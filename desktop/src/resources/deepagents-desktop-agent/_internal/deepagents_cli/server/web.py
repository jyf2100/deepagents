"""FastAPI WebSocket server for DeepAgents Web UI."""

import asyncio
import json
import logging
import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from deepagents_cli.agent import create_cli_agent
from deepagents_cli.config import SessionState, create_model
from deepagents_cli.core.events import Decision, HITLPromptEvent
from deepagents_cli.core.handlers import ExecutionHandler
from deepagents_cli.execution import execute_task_with_handler
from deepagents_cli.integrations.sandbox_factory import create_opensandbox_sandbox

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DeepAgents Web UI")

# Mount static files
import os
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Pending HITL decisions: decision_id -> asyncio.Future
# Using global registry with UUID decision_ids to avoid conflicts
_pending_decisions: dict[str, asyncio.Future] = {}

# Sandbox registry: sandbox_id -> sandbox_info
_active_sandboxes: dict[str, dict] = {}
_sandbox_lock = asyncio.Lock()


# ============================================================================
# WebSocket Chat Endpoint
# ============================================================================

class WebSocketEventHandler(ExecutionHandler):
    """Event handler that pushes events to a WebSocket connection."""

    def __init__(self, websocket: WebSocket, session_id: str):
        self.ws = websocket
        self.session_id = session_id

    async def on_start(self) -> None:
        """Called when execution starts."""
        await self.ws.send_json({
            "type": "session_start",
            "data": {"session_id": self.session_id}
        })

    async def on_complete(self) -> None:
        """Called when execution completes."""
        await self.ws.send_json({
            "type": "session_complete",
            "data": {"session_id": self.session_id}
        })

    async def on_error(self, error) -> None:
        """Called when an error occurs."""
        await self.ws.send_json({
            "type": "error",
            "data": {
                "message": error.data.get("message", "Unknown error"),
                "type": error.data.get("type", "Error")
            }
        })

    async def on_event(self, event: Any) -> None:
        """Handle an event by sending it to the WebSocket."""
        await self.ws.send_json(event.to_dict())

    async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
        """Handle HITL prompt by waiting for user decision via WebSocket."""
        # Use UUID for decision_id to avoid conflicts across connections
        decision_id = str(uuid.uuid4())

        logger.info(f"[DEBUG] Creating HITL prompt: session={self.session_id}, decision_id={decision_id}")

        # Send HITL prompt to frontend
        await self.ws.send_json({
            "type": "hitl_prompt",
            "data": {**prompt.data, "decision_id": decision_id}
        })

        # Wait for user decision (30 minute timeout)
        future = asyncio.Future()
        _pending_decisions[decision_id] = future
        logger.info(f"[DEBUG] Future created for {decision_id}, total pending: {len(_pending_decisions)}")
        try:
            result = await asyncio.wait_for(future, timeout=1800.0)  # 30 minutes
            logger.info(f"[DEBUG] Future resolved for {decision_id}, result: {result}")
            return Decision(**result)
        except asyncio.TimeoutError:
            # Only clean up on timeout
            logger.warning(f"[DEBUG] Future timeout for {decision_id}")
            _pending_decisions.pop(decision_id, None)
            return Decision(action="reject")
        # Don't clean up in finally - keep it for manual decision if needed


@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time chat with the agent."""
    await websocket.accept()

    # Generate new session ID
    session_id = str(uuid.uuid4())
    handler = WebSocketEventHandler(websocket, session_id)

    # Send session_id back to client
    try:
        await websocket.send_json({
            "type": "session_init",
            "data": {"session_id": session_id}
        })
    except Exception:
        # Connection might be closed already
        pass
    session_state = SessionState(auto_approve=False)

    # Create model and agent
    model = create_model(None)
    agent, _backend = create_cli_agent(
        model=model,
        assistant_id=session_id,
        tools=[],
        sandbox=None,
        sandbox_type=None,
        auto_approve=False,
    )

    try:
        while True:
            # Log all received messages for debugging
            raw_data = await websocket.receive()

            # Check for text message (JSON string sent via ws.send())
            if "text" in raw_data:
                try:
                    data = json.loads(raw_data["text"])
                except:
                    logger.warning(f"[DEBUG] Received non-JSON data: {raw_data}")
                    continue
            # Check for json message (sent via ws.send_json())
            elif "json" in raw_data:
                data = raw_data["json"]
            else:
                logger.warning(f"[DEBUG] Received unknown message format: {raw_data}")
                continue

            logger.info(f"[DEBUG] Received message: type={data.get('type')}, keys={list(data.keys())}")

            if data["type"] == "start":
                # Start a new task
                user_input = data.get("content", "")
                if not user_input:
                    continue

                # Send user message to frontend for display
                await websocket.send_json({
                    "type": "user_message",
                    "data": {"content": user_input}
                })

                # Execute task with handler as background task to avoid blocking WebSocket loop
                asyncio.create_task(execute_task_with_handler(
                    user_input=user_input,
                    agent=agent,
                    assistant_id=session_id,
                    session_state=session_state,
                    handler=handler,
                ))

            elif data["type"] == "hitl_decision":
                # Handle HITL decision from frontend
                decision_id = data.get("decision_id")
                decision_data = data.get("decision", {})

                # Debug logging
                logger.info(f"[DEBUG] HITL decision received: decision_id={decision_id}")
                logger.info(f"[DEBUG] decision_data: {decision_data}")
                logger.info(f"[DEBUG] total pending decisions: {len(_pending_decisions)}")

                if decision_id in _pending_decisions:
                    _pending_decisions[decision_id].set_result(decision_data)
                    logger.info(f"[DEBUG] Decision set for {decision_id}")
                else:
                    logger.error(f"[DEBUG] ERROR: decision_id {decision_id} not found in pending decisions")

    except WebSocketDisconnect:
        # Client disconnected - clean up any stale pending decisions
        # Note: We can't easily know which decisions belong to this session
        # without tracking them, so we just log the disconnect
        logger.info(f"[DEBUG] Session {session_id} disconnected")
    except Exception as e:
        # Send error to client
        try:
            await websocket.send_json({
                "type": "error",
                "data": {"message": str(e), "type": type(e).__name__}
            })
        except Exception:
            pass


# ============================================================================
# Sandbox Management API
# ============================================================================

# API Router for sandbox management
sandbox_router = APIRouter(prefix="/api/sandboxes", tags=["sandboxes"])


class CreateSandboxRequest(BaseModel):
    """Request to create a new sandbox."""
    user_id: str = Field(..., description="User ID creating the sandbox")
    session_id: str = Field(..., description="Session ID for the sandbox")
    timeout_minutes: int = Field(default=240, ge=10, le=480, description="Timeout in minutes")


class SandboxResponse(BaseModel):
    """Response with sandbox details."""
    sandbox_id: str = Field(..., description="Unique sandbox identifier")
    url: str = Field(..., description="Access URL for VS Code")
    status: str = Field(default="running", description="Current sandbox status")


class SandboxStatusResponse(BaseModel):
    """Response with sandbox status."""
    sandbox_id: str
    status: str  # creating, running, stopped, error
    url: str | None = None
    created_at: str


@sandbox_router.post("", response_model=SandboxResponse, status_code=201)
async def create_sandbox(
    request: CreateSandboxRequest,
    background_tasks: BackgroundTasks,
) -> SandboxResponse:
    """Create a new VS Code sandbox.

    This creates an ephemeral VS Code environment managed by OpenSandbox.
    The sandbox will be automatically cleaned up after the timeout period.
    """
    try:
        # Generate unique sandbox ID
        sandbox_id = str(uuid.uuid4())

        # Create OpenSandbox backend using sandbox_factory
        # Note: We need to hold the sandbox context for the lifetime of the sandbox
        # For MVP, we'll store it in the registry with a reference to cleanup later
        with create_opensandbox_sandbox(sandbox_id=sandbox_id) as backend:
            url = backend.url

            # Register sandbox
            async with _sandbox_lock:
                _active_sandboxes[sandbox_id] = {
                    "id": sandbox_id,
                    "user_id": request.user_id,
                    "session_id": request.session_id,
                    "url": url,
                    "status": "running",
                    "created_at": asyncio.get_event_loop().time(),
                    "backend": backend,  # Store reference for cleanup
                }

            # Set up background cleanup task
            background_tasks.add_task(
                cleanup_sandbox_after_timeout,
                sandbox_id,
                request.timeout_minutes,
            )

            return SandboxResponse(
                sandbox_id=sandbox_id,
                url=url,
                status="running",
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"Sandbox creation failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")


@sandbox_router.get("/{sandbox_id}", response_model=SandboxStatusResponse)
async def get_sandbox_status(sandbox_id: str) -> SandboxStatusResponse:
    """Get sandbox status."""
    async with _sandbox_lock:
        sandbox = _active_sandboxes.get(sandbox_id)

    if not sandbox:
        raise HTTPException(status_code=404, detail=f"Sandbox {sandbox_id} not found")

    return SandboxStatusResponse(
        sandbox_id=sandbox_id,
        status=sandbox["status"],
        url=sandbox.get("url"),
        created_at=sandbox["created_at"],
    )


@sandbox_router.delete("/{sandbox_id}", status_code=204)
async def delete_sandbox(sandbox_id: str) -> None:
    """Stop and cleanup a sandbox."""
    async with _sandbox_lock:
        sandbox = _active_sandboxes.get(sandbox_id)

    if not sandbox:
        raise HTTPException(status_code=404, detail=f"Sandbox {sandbox_id} not found")

    # Mark as stopped
    async with _sandbox_lock:
        _active_sandboxes[sandbox_id]["status"] = "stopped"

    # Trigger cleanup
    await cleanup_sandbox(sandbox_id)


async def cleanup_sandbox(sandbox_id: str) -> None:
    """Cleanup sandbox resources."""
    async with _sandbox_lock:
        if sandbox_id in _active_sandboxes:
            sandbox = _active_sandboxes[sandbox_id]
            backend = sandbox.get("backend")
            if backend:
                try:
                    backend.cleanup()
                except Exception:
                    pass  # Best effort cleanup
            del _active_sandboxes[sandbox_id]


async def cleanup_sandbox_after_timeout(sandbox_id: str, timeout_minutes: int) -> None:
    """Cleanup sandbox after timeout."""
    await asyncio.sleep(timeout_minutes * 60)
    await cleanup_sandbox(sandbox_id)


# Include sandbox router in app
app.include_router(sandbox_router)


# ============================================================================
# Root Endpoint
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint - redirect to static UI."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
