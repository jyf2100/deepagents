"""Unix Socket 通信协议 - 桌面模式."""

import asyncio
import msgpack
import os
import sys
from typing import Any

from deepagents_cli.agent import create_cli_agent
from deepagents_cli.config import settings


class DesktopProtocol:
    """Desktop mode protocol using Unix Socket communication.

    This protocol handles communication between Electron desktop app and Python Agent
    via Unix Domain Socket with MessagePack encoding.
    """

    def __init__(self, socket_path: str, assistant_id: str = "desktop"):
        """Initialize the DesktopProtocol.

        Args:
            socket_path: Path to the Unix socket file
            assistant_id: Agent identifier for memory storage
        """
        self.socket_path = socket_path
        self.assistant_id = assistant_id

        # Agent cache: workspace_id:conversation_id -> (agent, backend, model)
        self.agents: dict[str, tuple] = {}

        # Current state
        self.agent = None
        self.composite_backend = None
        self.model = None
        self.running = False
        self.current_workspace_id = None  # Track current workspace
        self.current_conversation_id = None  # Track current conversation
        self.pending_interrupts: dict[str, dict] = {}  # Store pending HITL interrupts

    async def start(self) -> None:
        """Start the socket client and connect to Electron."""
        # Check for test mode
        if os.getenv("DEEPAGENTS_TEST") == "1":
            await self._test_mode_handler()
            return

        # Normal mode: Create agent and handle connections
        await self._normal_mode_handler()

    async def _normal_mode_handler(self) -> None:
        """Normal mode handler with full agent capabilities."""
        # Initialize model (this sets settings.model_name based on available API keys)
        from deepagents_cli.config import create_model
        model = create_model()

        # Create the agent
        self.agent, self.composite_backend = create_cli_agent(
            model=model,
            assistant_id=self.assistant_id,
            tools=[],  # No extra tools for desktop mode
            sandbox=None,  # Local filesystem mode
            auto_approve=False,  # Require user approval for destructive operations
            enable_memory=True,
            enable_skills=True,
            enable_shell=True,  # Enable shell execution
        )

        # Debug: Check if agent has interrupt_on configured
        import sys
        print(f"[DEBUG] Agent created with auto_approve=False", file=sys.stderr)
        print(f"[DEBUG] Agent graph name: {self.agent.name}", file=sys.stderr)

        # Debug: Print all available tools
        print(f"[DEBUG] ========== TOOLS DEBUG ==========", file=sys.stderr)
        try:
            graph = self.agent.get_graph()
            print(f"[DEBUG] Graph nodes: {list(graph.nodes.keys())}", file=sys.stderr)

            # Collect tools from all nodes
            all_tools = []
            for node_name, node in graph.nodes.items():
                if hasattr(node, 'data') and node.data:
                    # Try to get tools from the node
                    if hasattr(node.data, '__self__') and hasattr(node.data.__self__, 'tools'):
                        for t in node.data.__self__.tools:
                            tool_name = t.name if hasattr(t, 'name') else str(t)
                            all_tools.append(f"{node_name}.{tool_name}")

            print(f"[DEBUG] All tools found: {all_tools}", file=sys.stderr)
            print(f"[DEBUG] Total tool count: {len(all_tools)}", file=sys.stderr)
        except Exception as e:
            print(f"[DEBUG] Error getting tools: {e}", file=sys.stderr)
        print(f"[DEBUG] ==================================", file=sys.stderr)

        self.running = True
        while self.running:
            try:
                reader, writer = await asyncio.open_unix_connection(self.socket_path)
                await self.handle_connection(reader, writer)
            except (ConnectionRefusedError, FileNotFoundError):
                # Socket not ready yet, wait and retry
                await asyncio.sleep(1)
            except Exception as e:
                print(f"Connection error: {e}")
                await asyncio.sleep(1)

    async def _get_or_create_agent(
        self,
        workspace_id: str | None,
        conversation_id: str | None = None
    ) -> tuple:
        """Get or create an agent for the specified workspace and conversation.

        This implements agent caching to avoid recreating agents for the same
        workspace/conversation combination.

        Args:
            workspace_id: Workspace identifier for isolation
            conversation_id: Conversation identifier for persistent checkpointer

        Returns:
            Tuple of (agent, composite_backend)
        """
        import sys
        from deepagents_cli.config import create_model
        from deepagents_cli.checkpointer_factory import get_checkpointer_factory

        # Build cache key
        cache_key = f"{workspace_id or 'default'}:{conversation_id or 'default'}"
        print(f"[_get_or_create_agent] cache_key: {cache_key}", file=sys.stderr)

        # Check cache
        # TODO: Re-enable caching once HITL configuration is stable
        # if cache_key in self.agents:
        #     print(f"[_get_or_create_agent] Cache hit! Reusing existing agent", file=sys.stderr)
        #     self.agent, self.composite_backend, self.model = self.agents[cache_key]
        #     return self.agent, self.composite_backend

        # Cache miss - create new agent
        print(f"[_get_or_create_agent] Creating new agent (caching temporarily disabled for HITL fix)", file=sys.stderr)

        if self.model is None:
            self.model = create_model()

        # Initialize checkpointer asynchronously if conversation_id is present
        checkpointer = None
        if conversation_id:
            try:
                checkpointer = await get_checkpointer_factory().get_async_checkpointer(conversation_id)
                print(f"[_get_or_create_agent] Async checkpointer created for {conversation_id}", file=sys.stderr)
            except Exception as e:
                print(f"[_get_or_create_agent] Failed to create async checkpointer: {e}", file=sys.stderr)
                # Fallback handled inside create_cli_agent if we pass None, but better to be explicit about failure
                # Assuming fallback to memory or sync? No, sync is broken. 
                # Let create_cli_agent fallback to InMemorySaver if we pass None?
                # Actually, get_async_checkpointer handles fallback to memory saver internally if SQLITE_AVAILABLE is false.
                # If it raises exception, it's serious.
                pass

        agent, backend = create_cli_agent(
            model=self.model,
            assistant_id=self.assistant_id,
            tools=[],
            sandbox=None,
            auto_approve=False,  # Require user approval for destructive operations
            enable_memory=True,
            enable_skills=True,
            enable_shell=True,
            workspace_id=workspace_id,
            conversation_id=conversation_id,  # Pass for persistent checkpointer (fallback if checkpointer is None)
            checkpointer=checkpointer,  # Pass the async initialized checkpointer
            # interrupt_on=["tool_call"],  # REMOVED: This was incorrect. auto_approve=False handles defaults.
        )

        # Cache the agent
        self.agents[cache_key] = (agent, backend, self.model)
        self.agent = agent
        self.composite_backend = backend

        print(f"[_get_or_create_agent] Agent created and cached", file=sys.stderr)
        return agent, backend

    def _recreate_agent_with_workspace(self, workspace_id: str | None) -> None:
        """Recreate the agent with a new workspace configuration.

        DEPRECATED: Use _get_or_create_agent instead for proper caching.

        Args:
            workspace_id: The workspace ID to use, or None for default behavior
        """
        import sys

        print(f"[_recreate_agent] Recreating agent with workspace_id: {workspace_id}", file=sys.stderr, flush=True)

        try:
            # Initialize model (this sets settings.model_name based on available API keys)
            from deepagents_cli.config import create_model
            model = create_model()

            self.agent, self.composite_backend = create_cli_agent(
                model=model,
                assistant_id=self.assistant_id,
                tools=[],
                sandbox=None,
                auto_approve=False,
                enable_memory=True,
                enable_skills=True,
                enable_shell=True,
                workspace_id=workspace_id,
            )
            self.current_workspace_id = workspace_id

            # Log workspace info
            if workspace_id:
                from deepagents_cli.desktop.workspace import get_workspace_manager
                workspace_manager = get_workspace_manager()
                all_workspaces = workspace_manager.list_workspaces()
                print(f"[_recreate_agent] All workspace IDs: {[ws.id for ws in all_workspaces]}", file=sys.stderr, flush=True)
                print(f"[_recreate_agent] Looking for workspace_id: '{workspace_id}'", file=sys.stderr, flush=True)
                ws = workspace_manager.get_workspace(workspace_id)
                if ws:
                    print(f"[_recreate_agent] Workspace found - root_dir: {ws.root_dir}", file=sys.stderr, flush=True)
                    print(f"[_recreate_agent] Composite backend default: {self.composite_backend.default}", file=sys.stderr, flush=True)
                else:
                    print(f"[_recreate_agent] ERROR: Workspace not found for id: '{workspace_id}'", file=sys.stderr, flush=True)

            print(f"[_recreate_agent] Agent recreated successfully", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"ERROR recreating agent: {e}", file=sys.stderr, flush=True)
            raise

    async def _test_mode_handler(self) -> None:
        """Test mode handler with simple ping-pong."""
        print(f"DesktopProtocol: Test mode - connecting to {self.socket_path}")
        self.running = True
        while self.running:
            try:
                reader, writer = await asyncio.open_unix_connection(self.socket_path)
                await self.handle_connection(reader, writer)
            except (ConnectionRefusedError, FileNotFoundError):
                await asyncio.sleep(1)
            except Exception as e:
                print(f"Connection error: {e}")
                await asyncio.sleep(1)

    async def handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        """Handle connection from Electron.

        Args:
            reader: Stream reader for incoming data
            writer: Stream writer for outgoing data
        """
        try:
            while True:
                # Read length prefix (4 bytes)
                length_data = await reader.readexactly(4)
                length = int.from_bytes(length_data, 'little')
                
                # Debug logging
                import sys
                print(f"[handle_connection] Reading message of length: {length}", file=sys.stdout, flush=True)

                # Read message body
                try:
                    message_data = await reader.readexactly(length)
                    
                    # Log first 50 bytes in hex for debugging
                    hex_dump = message_data[:50].hex()
                    print(f"[handle_connection] Raw data (hex, first 50): {hex_dump}", file=sys.stdout, flush=True)
                    
                    # FORCE fallback: try JSON first, then msgpack as last resort
                    # This avoids the zlib error by assuming Electron is sending JSON string bytes
                    import json
                    try:
                        message_str = message_data.decode('utf-8')
                        # print(f"[handle_connection] Decoding as UTF-8 JSON: {message_str[:100]}...", file=sys.stderr, flush=True)
                        message = json.loads(message_str)
                    except Exception:
                        # Common case for MsgPack data, no need to log as error
                        # print(f"[handle_connection] JSON decode failed: {json_err}. Trying msgpack...", file=sys.stderr, flush=True)
                        message = msgpack.unpackb(message_data)
                        
                except Exception as e:
                    print(f"[handle_connection] CRITICAL unpacking error: {e}", file=sys.stderr, flush=True)
                    # Re-raise to close connection and retry
                    raise e

                # Process request
                response = await self.handle_request(message)

                # Send response
                response_data = msgpack.packb(response)
                response_length = len(response_data).to_bytes(4, 'little')
                writer.write(response_length + response_data)
                await writer.drain()

        except asyncio.IncompleteReadError:
            # Connection closed by client
            pass
        except Exception as e:
            # Send error response
            import traceback
            try:
                print(f"[handle_connection] EXCEPTION: {e}", file=sys.stderr)
                print(f"[handle_connection] TRACEBACK:\n{traceback.format_exc()}", file=sys.stderr)
                error_response = msgpack.packb({
                    'request_id': message.get('request_id') if 'message' in locals() else None,
                    'status': 'error',
                    'error': {
                        'code': 'PROCESSING_ERROR',
                        'message': str(e)
                    }
                })
                writer.write(len(error_response).to_bytes(4, 'little') + error_response)
                await writer.drain()
            except Exception:
                pass  # Best effort error reporting
        finally:
            writer.close()
            await writer.wait_closed()

    async def handle_request(self, message: dict[str, Any]) -> dict[str, Any]:
        """Handle incoming request from Electron.

        Args:
            message: Request message with method and params

        Returns:
            Response message
        """
        request_type = message.get('method')

        # Debug logging
        import sys
        print(f"[handle_request] Received request: {request_type}", file=sys.stdout)
        print(f"[handle_request] Full message: {message}", file=sys.stdout)

        # Test mode: simple ping-pong (DISABLED for production)
        # if os.getenv("DEEPAGENTS_TEST") == "1":
        #     if request_type == "ping":
        #         return {
        #             'request_id': message.get('request_id'),
        #             'status': 'success',
        #             'data': {'pong': True}
        #         }
        #     return {
        #         'request_id': message.get('request_id'),
        #         'status': 'error',
        #         'error': {
        #             'code': 'UNKNOWN_METHOD',
        #             'message': f"Unknown method: {request_type}"
        #         }
        #     }

        # Normal mode: handle chat requests
        if request_type == "chat":
            return await self._handle_chat(message.get('request_id'), message.get('params', {}))

        # Handle tool approval decisions
        if request_type == "tool_approval":
            return await self._handle_tool_approval(message.get('request_id'), message.get('params', {}))

        # Handle skill management requests
        if request_type == "list_skills":
            return await self._handle_list_skills(message.get('request_id'))

        if request_type == "upload_skill":
            return await self._handle_upload_skill(message.get('request_id'), message.get('params', {}))

        if request_type == "clone_skill_from_github":
            return await self._handle_clone_skill_from_github(message.get('request_id'), message.get('params', {}))

        if request_type == "scan_github_for_skills":
            return await self._handle_scan_github_for_skills(message.get('request_id'), message.get('params', {}))

        if request_type == "import_selected_skills":
            return await self._handle_import_selected_skills(message.get('request_id'), message.get('params', {}))

        if request_type == "delete_skill":
            return await self._handle_delete_skill(message.get('request_id'), message.get('params', {}))

        # Handle config management requests
        if request_type == "setConfig":
            return await self._handle_set_config(message.get('request_id'), message.get('params', {}))

        if request_type == "getConfig":
            return await self._handle_get_config(message.get('request_id'))

        if request_type == "reload_config":
            return await self._handle_reload_config(message.get('request_id'))

        # Handle workspace management requests
        if request_type == "list_workspaces":
            return await self._handle_list_workspaces(message.get('request_id'))

        if request_type == "create_workspace":
            return await self._handle_create_workspace(message.get('request_id'), message.get('params', {}))

        if request_type == "delete_workspace":
            return await self._handle_delete_workspace(message.get('request_id'), message.get('params', {}))

        if request_type == "update_workspace":
            return await self._handle_update_workspace(message.get('request_id'), message.get('params', {}))

        if request_type == "set_workspace_skills":
            return await self._handle_set_workspace_skills(message.get('request_id'), message.get('params', {}))

        # Handle conversation management requests
        if request_type == "create_conversation":
            return await self._handle_create_conversation(message.get('request_id'), message.get('params', {}))

        if request_type == "list_conversations":
            print(f"[handle_request] Handling list_conversations", file=sys.stdout)
            return await self._handle_list_conversations(message.get('request_id'), message.get('params', {}))

        if request_type == "delete_conversation":
            return await self._handle_delete_conversation(message.get('request_id'), message.get('params', {}))

        if request_type == "switch_conversation":
            return await self._handle_switch_conversation(message.get('request_id'), message.get('params', {}))

        if request_type == "rename_conversation":
            return await self._handle_rename_conversation(message.get('request_id'), message.get('params', {}))

        if request_type == "get_conversation_history":
            return await self._handle_get_conversation_history(message.get('request_id'), message.get('params', {}))

        return {
            'request_id': message.get('request_id'),
            'status': 'error',
            'error': {
                'code': 'UNKNOWN_METHOD',
                'message': f"Unknown method: {request_type}"
            }
        }

    async def _handle_chat(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle chat request.

        Args:
            request_id: Request identifier for response correlation
            params: Chat parameters including message, stream, workspace_id, and conversation_id

        Returns:
            Response with AI content
        """
        user_message = params.get('message') or ''
        stream = params.get('stream', False)
        workspace_id = params.get('workspace_id')
        conversation_id = params.get('conversation_id')

        # Debug logging (safe for None values)
        import sys
        
        # Handle case where user_message might be a dictionary (from frontend bug)
        if isinstance(user_message, dict):
            # Try to extract actual message string
            actual_message = user_message.get('message', '')
            print(f"[_handle_chat] WARNING: user_message is a dict: {user_message}. Using extracted: '{actual_message}'", file=sys.stdout)
            user_message = actual_message
            
        safe_message = (user_message or '')[:50] if isinstance(user_message, str) else str(user_message)[:50]
        print(f"[_handle_chat] Called with message: '{safe_message}...', stream={stream}, workspace_id={workspace_id}, conversation_id={conversation_id}", file=sys.stdout)

        # Update current state
        self.current_workspace_id = workspace_id
        self.current_conversation_id = conversation_id

        # Ensure conversation metadata exists (handle implicit creation via chat)
        if workspace_id and conversation_id:
            try:
                await self._ensure_conversation_metadata(workspace_id, conversation_id, user_message)
            except Exception as e:
                print(f"[_handle_chat] WARNING: Failed to ensure conversation metadata: {e}", file=sys.stderr)

        # Get or create agent with caching
        try:
            self.agent, self.composite_backend = await self._get_or_create_agent(
                workspace_id=workspace_id,
                conversation_id=conversation_id
            )
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'AGENT_INIT_FAILED',
                    'message': f'Failed to initialize agent: {str(e)}'
                }
            }

        # Prepare config with thread_id for checkpointer
        # Use conversation_id as thread_id for conversation-level persistence
        thread_id = conversation_id if conversation_id else (workspace_id if workspace_id else "default")
        agent_config = {"configurable": {"thread_id": thread_id}}

        # Log agent system prompt working directory
        try:
            # Try to get system prompt from the graph if possible, or just log intent
            print(f"[_handle_chat] Agent initialized for workspace: {workspace_id or 'default'}", file=sys.stderr)
            if hasattr(self.agent, "get_graph"):
                # We can't easily inspect the compiled graph's system prompt directly here
                # without digging into internal state, but we can verify the backend
                if self.composite_backend and hasattr(self.composite_backend, "default"):
                    backend = self.composite_backend.default
                    if hasattr(backend, "root_dir"):
                        print(f"[_handle_chat] Backend root_dir: {backend.root_dir}", file=sys.stderr)
        except Exception as e:
            print(f"[_handle_chat] DEBUG: Failed to log agent details: {e}", file=sys.stderr)

        try:
            # Invoke agent
            if stream:
                # Streaming response
                content = ""
                chunk_count = 0
                async for chunk in self.agent.astream(
                    {'messages': [user_message]},
                    config=agent_config,
                    stream_mode="updates"
                ):
                    chunk_count += 1

                    # Debug: log chunk type
                    # print(f"[_handle_chat] Chunk {chunk_count}: type={type(chunk).__name__}", file=sys.stderr)
                    if isinstance(chunk, dict):
                        # print(f"[_handle_chat] Chunk {chunk_count} keys: {list(chunk.keys())}", file=sys.stderr)
                        if "__interrupt__" in chunk:
                            print(f"[_handle_chat] *** INTERRUPT FOUND in chunk! ***", file=sys.stderr)

                    # Handle UPDATES stream - for interrupts (similar to execution.py)
                    if isinstance(chunk, tuple) and len(chunk) == 3:
                        _namespace, current_stream_mode, data = chunk
                        if current_stream_mode == "updates" and isinstance(data, dict):
                            if "__interrupt__" in data:
                                interrupts: list = data["__interrupt__"]
                                if interrupts:
                                    # Clear previous pending interrupts as we have new ones from current execution
                                    self.pending_interrupts.clear()
                                    
                                    for interrupt_obj in interrupts:
                                        interrupt_id = interrupt_obj.id
                                        hitl_request = interrupt_obj.value
                                        self.pending_interrupts[interrupt_id] = hitl_request

                                    # Extract tool info from first action request for frontend
                                    tool_name = 'unknown_tool'
                                    tool_args = {}
                                    agent_thinking = ''
                                    action_requests = []
                                    for hitl_request in self.pending_interrupts.values():
                                        action_requests = hitl_request.get("action_requests", [])
                                        if action_requests and len(action_requests) > 0:
                                            action = action_requests[0]
                                            tool_name = action.get('name', 'unknown_tool')
                                            tool_args = action.get('args', {})
                                            agent_thinking = action.get('description', '')
                                            break

                                    # Return interrupt event to frontend with expected format
                                    print(f"[_handle_chat] Interrupt detected: tool={tool_name}, args={tool_args}", file=sys.stderr)
                                    return {
                                        'request_id': request_id,
                                        'type': 'interrupt_request',  # Use 'type' not 'status'
                                        'data': {
                                            'tool_name': tool_name,
                                            'tool_input': tool_args,
                                            'agent_thinking': agent_thinking
                                        }
                                    }
                            # Skip updates chunks for content extraction
                            continue
                    elif isinstance(chunk, dict) and "__interrupt__" in chunk:
                        # Handle dict-format interrupts (when using single stream_mode)
                        interrupts: list = chunk["__interrupt__"]
                        if interrupts:
                            # Clear previous pending interrupts
                            self.pending_interrupts.clear()

                            # Store the original chat request_id with the interrupt
                            # This allows _handle_tool_approval to resolve the correct Promise
                            self._original_chat_request_id = request_id

                            for interrupt_obj in interrupts:
                                interrupt_id = interrupt_obj.id
                                hitl_request = interrupt_obj.value
                                self.pending_interrupts[interrupt_id] = hitl_request

                            # Extract tool info from first action request for frontend
                            tool_name = 'unknown_tool'
                            tool_args = {}
                            agent_thinking = ''
                            action_requests = []
                            for hitl_request in self.pending_interrupts.values():
                                action_requests = hitl_request.get("action_requests", [])
                                if action_requests and len(action_requests) > 0:
                                    action = action_requests[0]
                                    tool_name = action.get('name') or 'unknown_tool'
                                    tool_args = action.get('args') or {}
                                    agent_thinking = action.get('description') or ''
                                    break

                            # Return interrupt event to frontend with expected format
                            print(f"[_handle_chat] Interrupt detected (dict): tool={tool_name}, args={tool_args}, original_request_id={request_id}", file=sys.stderr)
                            return {
                                'request_id': request_id,
                                'type': 'interrupt_request',  # Use 'type' not 'status'
                                'data': {
                                    'tool_name': tool_name,
                                    'tool_input': tool_args,
                                    'agent_thinking': agent_thinking
                                }
                            }
                        # Skip interrupt chunks for content extraction
                        continue

                    # Handle HumanInTheLoopMiddleware chunk (direct middleware key)
                    if isinstance(chunk, dict) and "HumanInTheLoopMiddleware.after_model" in chunk:
                        middleware_data = chunk["HumanInTheLoopMiddleware.after_model"]
                        # Debug log only if data is present to reduce noise
                        if middleware_data is not None:
                            print(f"[_handle_chat] Checking HumanInTheLoopMiddleware chunk: {middleware_data.keys() if isinstance(middleware_data, dict) else type(middleware_data)}", file=sys.stderr)
                        
                        if isinstance(middleware_data, dict) and "__interrupt__" in middleware_data:
                            interrupts: list = middleware_data["__interrupt__"]
                            if interrupts:
                                # Clear previous pending interrupts
                                self.pending_interrupts.clear()

                                # Store the original chat request_id with the interrupt
                                self._original_chat_request_id = request_id

                                for interrupt_obj in interrupts:
                                    interrupt_id = interrupt_obj.id
                                    hitl_request = interrupt_obj.value
                                    self.pending_interrupts[interrupt_id] = hitl_request

                                # Extract tool info
                                tool_name = 'unknown_tool'
                                tool_args = {}
                                agent_thinking = ''
                                action_requests = []
                                for hitl_request in self.pending_interrupts.values():
                                    action_requests = hitl_request.get("action_requests", [])
                                    if action_requests and len(action_requests) > 0:
                                        action = action_requests[0]
                                        tool_name = action.get('name') or 'unknown_tool'
                                        tool_args = action.get('args') or {}
                                        agent_thinking = action.get('description') or ''
                                        break

                                print(f"[_handle_chat] Interrupt detected (middleware key): tool={tool_name}, args={tool_args}", file=sys.stderr)
                                return {
                                    'request_id': request_id,
                                    'type': 'interrupt_request',
                                    'data': {
                                        'tool_name': tool_name,
                                        'tool_input': tool_args,
                                        'agent_thinking': agent_thinking
                                    }
                                }
                        continue

                    # Debug: print chunk with 'model' key
                    # if isinstance(chunk, dict) and 'model' in chunk:
                    #     print(f"[_handle_chat] Chunk {chunk_count} has 'model' key: {type(chunk['model'])}", file=sys.stderr)
                    #     print(f"[_handle_chat] model value: {chunk['model']}", file=sys.stderr)

                    # Try to extract content from different possible keys
                    if isinstance(chunk, dict):
                        # Check for 'messages' key
                        if 'messages' in chunk:
                            for msg in chunk['messages']:
                                if hasattr(msg, 'content'):
                                    content += str(msg.content)
                                elif isinstance(msg, dict) and 'content' in msg:
                                    content += str(msg['content'])

                        # Check for 'model' key (LLM response)
                        elif 'model' in chunk:
                            model_data = chunk['model']
                            if hasattr(model_data, 'content'):
                                content += str(model_data.content)
                            elif isinstance(model_data, dict) and 'messages' in model_data:
                                for msg in model_data['messages']:
                                    if hasattr(msg, 'content'):
                                        content += str(msg.content)
                                    elif isinstance(msg, dict) and 'content' in msg:
                                        content += str(msg['content'])

                print(f"[_handle_chat] Stream complete: {chunk_count} chunks, content length={len(content)}", file=sys.stderr)
                return {
                    'request_id': request_id,
                    'status': 'success',
                    'data': {'content': content}
                }
            else:
                # Single response
                response = await self.agent.ainvoke(
                    {'messages': [user_message]},
                    config=agent_config
                )

                # Debug logging
                print(f"[_handle_chat] Response keys: {response.keys() if isinstance(response, dict) else type(response)}", file=sys.stderr)
                print(f"[_handle_chat] Response: {response}", file=sys.stderr)

                # Check for interrupt in non-streaming mode
                if '__interrupt__' in response:
                    interrupts = response['__interrupt__']
                    if interrupts:
                        # Clear previous pending interrupts
                        self.pending_interrupts.clear()

                        for interrupt_obj in interrupts:
                            self.pending_interrupts[interrupt_obj.id] = interrupt_obj.value

                        # Extract tool info from first action request for frontend
                        tool_name = 'unknown_tool'
                        tool_args = {}
                        agent_thinking = ''
                        action_requests = []
                        for hitl_request in self.pending_interrupts.values():
                            action_requests = hitl_request.get("action_requests", [])
                            if action_requests and len(action_requests) > 0:
                                action = action_requests[0]
                                tool_name = action.get('name', 'unknown_tool')
                                tool_args = action.get('args', {})
                                agent_thinking = action.get('description', '')
                                break

                        print(f"[_handle_chat] Interrupt detected (non-streaming): tool={tool_name}, args={tool_args}", file=sys.stderr)
                        return {
                            'request_id': request_id,
                            'type': 'interrupt_request',  # Use 'type' not 'status'
                            'data': {
                                'tool_name': tool_name,
                                'tool_input': tool_args,
                                'agent_thinking': agent_thinking
                            }
                        }

                content = ""
                if 'messages' in response:
                    for msg in response['messages']:
                        if hasattr(msg, 'content'):
                            content += msg.content
                        elif isinstance(msg, dict) and 'content' in msg:
                            content += msg['content']
                print(f"[_handle_chat] Extracted content length: {len(content)}", file=sys.stderr)

                return {
                    'request_id': request_id,
                    'status': 'success',
                    'data': {'content': content}
                }
        except Exception as e:
            print(f"[_handle_chat] Exception: {e}", file=sys.stderr)
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'AGENT_ERROR',
                    'message': str(e)
                }
            }

    async def _handle_tool_approval(self, request_id: str, params: dict) -> dict[str, Any]:
        """Handle tool approval decision from frontend.

        Args:
            request_id: Request identifier (unused, kept for compatibility)
            params: Contains action and optional tool_input

        Returns:
            Response with agent content after resuming - MUST use original chat request_id
                to resolve the correct Promise in Electron main process.
        """
        import sys
        print(f"[_handle_tool_approval] Called with params: {params}", file=sys.stderr)

        if not self.pending_interrupts:
            print(f"[_handle_tool_approval] No pending interrupts!", file=sys.stderr)
            return {
                'status': 'error',
                'error': {'code': 'NO_PENDING_INTERRUPT', 'message': 'No pending interrupt to approve'}
            }

        action = params.get('action')  # 'approve', 'reject', or 'edit'
        tool_input = params.get('tool_input')

        # Get workspace_id for thread_id
        workspace_id = self.current_workspace_id
        conversation_id = self.current_conversation_id
        thread_id = conversation_id if conversation_id else (workspace_id if workspace_id else "default")
        agent_config = {"configurable": {"thread_id": thread_id}}
        
        print(f"[_handle_tool_approval] Using thread_id: {thread_id} (ws={workspace_id}, conv={conversation_id})", file=sys.stderr)

        # Prepare state for resumption
        current_state = await self.agent.aget_state(agent_config)
        
        # Calculate existing message count to filter out history from response later
        start_msg_count = 0
        if current_state and hasattr(current_state, "values"):
            start_msg_count = len(current_state.values.get("messages", []))
        
        print(f"[_handle_tool_approval] Existing message count: {start_msg_count}", file=sys.stderr)

        # DEBUG: Log current state messages to debug 400 error
        import json
        try:
            msgs = current_state.values.get("messages", [])
            print(f"[_handle_tool_approval] DEBUG: Current state messages count: {len(msgs)}", file=sys.stderr)
            
            modified_messages = []  # Initialize list for patched messages
            
            for i, msg in enumerate(msgs):
                # Log detailed message info
                content_preview = str(msg.content)[:100] if msg.content else "None/Empty"
                tool_calls_info = str(msg.tool_calls) if hasattr(msg, "tool_calls") else "N/A"
                print(f"[_handle_tool_approval] MSG {i}: type={type(msg).__name__}, role={getattr(msg, 'role', 'N/A')}, content='{content_preview}', tool_calls={tool_calls_info}", file=sys.stderr)
                
                # Check patch condition explicitly
                # Handle both object and dict (just in case)
                is_obj = hasattr(msg, "type")
                has_tc = False
                is_empty = False
                
                if is_obj:
                    has_tc = hasattr(msg, "tool_calls") and bool(msg.tool_calls)
                    is_empty = not msg.content
                elif isinstance(msg, dict):
                    has_tc = "tool_calls" in msg and bool(msg["tool_calls"])
                    is_empty = not msg.get("content")
                
                is_invalid = has_tc and is_empty
                print(f"[_handle_tool_approval] MSG {i} PATCH CHECK: invalid={is_invalid} (has_tc={has_tc}, is_empty={is_empty})", file=sys.stderr)

                if is_invalid:
                    print(f"[_handle_tool_approval] PATCHING: Found invalid AIMessage, injecting space", file=sys.stderr)
                    if is_obj:
                        msg.content = " "
                    else:
                        msg["content"] = " "
                    modified_messages.append(msg)
            
            if modified_messages:
                print(f"[_handle_tool_approval] PATCHING: Updating state with {len(modified_messages)} fixed messages", file=sys.stderr)
                # update_state with add_messages reducer will upsert if IDs are present
                await self.agent.aupdate_state(agent_config, {"messages": modified_messages})
        except Exception as patch_error:
            print(f"[_handle_tool_approval] PATCH ERROR: {patch_error}", file=sys.stderr)

        # Build hitl_response (map interrupt_id to decisions)
        hitl_response = {}
        for interrupt_id in self.pending_interrupts.keys():
            decision = {"type": action}
            if action == "edit" and tool_input:
                # IMPORTANT: For 'edit', LangChain middleware expects 'edited_action' dict
                # with 'name' and 'args'. The frontend sends tool_input which is just the args.
                original_request = self.pending_interrupts[interrupt_id]
                original_action_requests = original_request.get("action_requests", [])
                
                # Default to unknown if not found, but we should find it
                tool_name = "unknown_tool"
                if original_action_requests:
                    tool_name = original_action_requests[0].get("name", "unknown_tool")
                
                # Construct the proper edited_action structure
                decision["edited_action"] = {
                    "name": tool_name,
                    "args": tool_input
                }
            hitl_response[interrupt_id] = {"decisions": [decision]}

        print(f"[_handle_tool_approval] Resuming with {len(hitl_response)} interrupt decisions", file=sys.stderr)
        # Debug the exact payload we are sending to resume
        import json
        print(f"[_handle_tool_approval] Resume payload: {json.dumps(hitl_response, default=str)}", file=sys.stderr)

        try:
            from langgraph.types import Command

            # Resume agent with user decision
            import traceback
            try:
                response = await self.agent.ainvoke(
                    Command(resume=hitl_response),
                    config=agent_config
                )
            except Exception as invoke_error:
                print(f"[_handle_tool_approval] ainvoke error: {invoke_error}", file=sys.stderr)
                print(f"[_handle_tool_approval] traceback: {traceback.format_exc()}", file=sys.stderr)
                raise invoke_error

            # Check for new interrupts immediately after resume
            if isinstance(response, dict) and '__interrupt__' in response:
                interrupts = response['__interrupt__']
                if interrupts:
                    print(f"[_handle_tool_approval] New interrupt detected during resume!", file=sys.stderr)
                    # Clear previous pending interrupts (the ones we just handled)
                    self.pending_interrupts.clear()

                    for interrupt_obj in interrupts:
                        self.pending_interrupts[interrupt_obj.id] = interrupt_obj.value

                    # Extract tool info from first action request for frontend
                    tool_name = 'unknown_tool'
                    tool_args = {}
                    agent_thinking = ''
                    action_requests = []
                    for hitl_request in self.pending_interrupts.values():
                        action_requests = hitl_request.get("action_requests", [])
                        if action_requests and len(action_requests) > 0:
                            action = action_requests[0]
                            tool_name = action.get('name', 'unknown_tool')
                            tool_args = action.get('args', {})
                            agent_thinking = action.get('description', '')
                            break
                    
                    # Try to capture the output of the previous tool execution to show context
                    # This is optional but helpful
                    prev_output = ""
                    try:
                        final_state = await self.agent.aget_state(agent_config)
                        final_messages = final_state.values.get("messages", [])
                        if final_messages:
                            last_msg = final_messages[-1]
                            # If the last message is an AIMessage (thinking about next tool), 
                            # check the one before it for ToolMessage
                            if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls and len(final_messages) > 1:
                                prev_msg = final_messages[-2]
                                if hasattr(prev_msg, 'type') and prev_msg.type == 'tool':
                                    prev_output = str(prev_msg.content)[:200] + "..."
                            elif hasattr(last_msg, 'type') and last_msg.type == 'tool':
                                prev_output = str(last_msg.content)[:200] + "..."
                    except Exception:
                        pass
                    
                    if prev_output:
                        print(f"[_handle_tool_approval] Captured previous tool output: {prev_output}", file=sys.stderr)
                        # We could prepend it to agent_thinking, but let's just log it for now
                        # agent_thinking = f"[Previous Output]: {prev_output}\n\n{agent_thinking}"

                    # CRITICAL: Use the original chat request_id
                    original_request_id = getattr(self, '_original_chat_request_id', request_id)
                    
                    return {
                        'request_id': original_request_id,
                        'type': 'interrupt_request',
                        'data': {
                            'tool_name': tool_name,
                            'tool_input': tool_args,
                            'agent_thinking': agent_thinking
                        }
                    }

            # Clear pending interrupts
            self.pending_interrupts.clear()

            # Get final state to ensure we capture all updates (including ToolMessages)
            final_state = await self.agent.aget_state(agent_config)
            final_messages = final_state.values.get("messages", [])
            
            # Extract content from new messages
            content = ""
            
            # Only process new messages generated during this resume
            # If start_msg_count is invalid or messages were replaced, try to be smarter
            if len(final_messages) <= start_msg_count:
                print(f"[_handle_tool_approval] WARNING: final_messages ({len(final_messages)}) <= start_msg_count ({start_msg_count}). Fetching last 5 messages.", file=sys.stderr)
                new_messages = final_messages[-5:] if final_messages else []
            else:
                new_messages = final_messages[start_msg_count:]
            
            print(f"[_handle_tool_approval] Start count: {start_msg_count}, Final count: {len(final_messages)}", file=sys.stderr)
            print(f"[_handle_tool_approval] New messages: {len(new_messages)}", file=sys.stderr)
            
            # Debug: print new messages details
            for i, msg in enumerate(new_messages):
                print(f"[_handle_tool_approval] New MSG {i}: type={type(msg).__name__}, content={str(msg.content)[:50]}", file=sys.stderr)
            
            for msg in new_messages:
                # Filter out HumanMessage to prevent echoing user input
                msg_type = getattr(msg, 'type', None)
                if not msg_type and isinstance(msg, dict):
                    msg_type = msg.get('type')
                
                # Also check role if type is not clear
                msg_role = getattr(msg, 'role', None)
                if not msg_role and isinstance(msg, dict):
                    msg_role = msg.get('role')

                print(f"[_handle_tool_approval] Processing msg: type={msg_type}, role={msg_role}", file=sys.stderr)

                if msg_type in ['human', 'user'] or msg_role in ['human', 'user']:
                    print(f"[_handle_tool_approval] Skipping HumanMessage to prevent echo", file=sys.stderr)
                    continue

                # Handle AIMessage content
                if hasattr(msg, 'content') and msg.content and isinstance(msg.content, str) and msg.content.strip():
                    content += msg.content
                elif isinstance(msg, dict) and 'content' in msg and msg['content'] and isinstance(msg['content'], str) and msg['content'].strip():
                    content += msg['content']
                
                # Handle ToolMessage content (if it's the last message and no AI response yet)
                # We often want to show tool output if the agent stopped there
                if hasattr(msg, 'type') and msg.type == 'tool':
                     tool_name = getattr(msg, 'name', 'tool')
                     tool_output = str(msg.content) if msg.content else "Success"
                     # If content is empty so far, show tool output
                     if not content:
                         content += f"\n[Tool '{tool_name}' Output]: {tool_output[:200]}..."
                elif isinstance(msg, dict) and msg.get('type') == 'tool':
                     tool_name = msg.get('name', 'tool')
                     tool_output = str(msg.get('content', 'Success'))
                     if not content:
                         content += f"\n[Tool '{tool_name}' Output]: {tool_output[:200]}..."

            print(f"[_handle_tool_approval] Resume complete, content length: {len(content)}", file=sys.stderr)
            if content:
                 print(f"[_handle_tool_approval] Resume content preview: {content[:100]}...", file=sys.stderr)
            else:
                 print(f"[_handle_tool_approval] Resume content is EMPTY! Full response keys: {response.keys() if isinstance(response, dict) else type(response)}", file=sys.stderr)
                 # Check if there are tool calls in the response, which might mean no content but valid next step
                 if 'messages' in response and response['messages']:
                     last_msg = response['messages'][-1]
                     if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
                         print(f"[_handle_tool_approval] Response has tool calls: {last_msg.tool_calls}", file=sys.stderr)
                     elif isinstance(last_msg, dict) and 'tool_calls' in last_msg:
                         print(f"[_handle_tool_approval] Response has tool calls (dict): {last_msg['tool_calls']}", file=sys.stderr)

            # CRITICAL: Use the original chat request_id to resolve the correct Promise
            original_request_id = getattr(self, '_original_chat_request_id', None)
            
            # If content is empty but we have a successful resume, check if we need to return something
            # The agent might have executed the tool but returned no text content yet (e.g. if tool output is hidden or next step is pending)
            if not content:
                # Try to get the last message content again, maybe it's a ToolMessage now?
                # When tool is executed, the graph usually loops back. 
                # If we are here, it means ainvoke returned.
                pass

            if original_request_id:
                print(f"[_handle_tool_approval] Using original request_id: {original_request_id}", file=sys.stderr)
                return {
                    'request_id': original_request_id,  # Use original chat request_id
                    'status': 'success',
                    'data': {'content': content or "Tool approved and executing..."} # Fallback content
                }
            else:
                print(f"[_handle_tool_approval] WARNING: No original request_id stored, using current: {request_id}", file=sys.stderr)
                return {
                    'request_id': request_id,
                    'status': 'success',
                    'data': {'content': content or "Tool approved and executing..."} # Fallback content
                }
        except Exception as e:
            import sys
            import traceback
            print(f"[_handle_tool_approval] Exception: {e}", file=sys.stderr)
            print(f"[_handle_tool_approval] Traceback: {traceback.format_exc()}", file=sys.stderr)
            return {
                'status': 'error',
                'error': {'code': 'AGENT_ERROR', 'message': str(e)}
            }

    async def _ensure_conversation_metadata(self, workspace_id: str, conversation_id: str, first_message: str | None = None) -> None:
        """Ensure conversation metadata exists for implicitly created conversations.

        If the conversation was created via chat() (e.g. using a timestamp ID from frontend)
        instead of create_conversation(), the metadata file might not exist.
        This method creates it to ensure persistence in the list.
        """
        from deepagents_cli.desktop.workspace import get_workspace_manager
        from deepagents_cli.config import settings
        from pathlib import Path
        import json
        import sys

        workspace_manager = get_workspace_manager()
        workspace = workspace_manager.get_workspace(workspace_id)

        if not workspace:
            print(f"[_ensure_conversation_metadata] Workspace not found: {workspace_id}", file=sys.stderr)
            return

        # 1. Add to workspace conversation_ids if missing
        if conversation_id not in workspace.conversation_ids:
            print(f"[_ensure_conversation_metadata] Adding {conversation_id} to workspace {workspace_id}", file=sys.stderr)
            workspace.conversation_ids.append(conversation_id)
            workspace_manager.save_workspace(workspace)

        # 2. Create metadata JSON if missing
        conv_dir = settings.get_workspace_dir_v2(workspace_id) / 'conversations'
        conv_dir.mkdir(parents=True, exist_ok=True)
        conv_file = conv_dir / f'{conversation_id}.json'

        if not conv_file.exists():
            print(f"[_ensure_conversation_metadata] Creating metadata for {conversation_id}", file=sys.stderr)
            
            # Generate title from message or default
            title = '新对话'
            if first_message and isinstance(first_message, str) and first_message.strip():
                title = first_message.strip()[:30]
                if len(first_message.strip()) > 30:
                    title += '...'
            
            conv_metadata = {
                'id': conversation_id,
                'workspace_id': workspace_id,
                'title': title,
                'created_at': str(Path.cwd()), # Use current time logic
                'updated_at': str(Path.cwd())
            }
            conv_file.write_text(json.dumps(conv_metadata, ensure_ascii=False, indent=2))

    async def _handle_list_workspaces(self, request_id: str) -> dict[str, Any]:
        """Handle list_workspaces request."""
        from deepagents_cli.desktop.workspace import get_workspace_manager

        try:
            workspace_manager = get_workspace_manager()
            workspaces = workspace_manager.list_workspaces()
            workspaces_list = [ws.to_dict() for ws in workspaces]

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {'workspaces': workspaces_list}
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'LIST_WORKSPACES_FAILED',
                    'message': f'Failed to list workspaces: {str(e)}'
                }
            }

    async def _handle_create_workspace(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle create_workspace request.

        Creates a new workspace with optional custom path specification.
        """
        from deepagents_cli.desktop.workspace import get_workspace_manager, WorkspaceConfig

        try:
            workspace_id = params.get('id')
            name = params.get('name')
            category = params.get('category', '通用')
            enabled_skills = params.get('enabled_skills', ['*'])
            icon = params.get('icon', 'folder')
            custom_path = params.get('custom_path', '')

            workspace_manager = get_workspace_manager()

            # Create workspace config with custom_path support
            workspace = WorkspaceConfig(
                id=workspace_id or name or 'workspace',
                name=name or workspace_id or 'Workspace',
                category=category,
                enabled_skills=enabled_skills,
                icon=icon,
                custom_path=custom_path
            )

            # Use workspace_manager to create and persist
            created_workspace = workspace_manager.create_workspace(workspace=workspace)

            return {
                'request_id': request_id,
                'status': 'success',
                'data': created_workspace.to_dict()
            }
        except ValueError as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': str(e)
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'CREATE_WORKSPACE_FAILED',
                    'message': f'Failed to create workspace: {str(e)}'
                }
            }

    async def _handle_delete_workspace(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle delete_workspace request."""
        from deepagents_cli.desktop.workspace import get_workspace_manager

        try:
            workspace_id = params.get('workspace_id')

            if not workspace_id:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'workspace_id is required'
                    }
                }

            workspace_manager = get_workspace_manager()
            success = workspace_manager.delete_workspace(workspace_id)

            if not success:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'WORKSPACE_NOT_FOUND',
                        'message': f'Workspace not found: {workspace_id}'
                    }
                }

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'message': f'Workspace "{workspace_id}" deleted successfully'
                }
            }
        except ValueError as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': str(e)
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'DELETE_WORKSPACE_FAILED',
                    'message': f'Failed to delete workspace: {str(e)}'
                }
            }

    async def _handle_update_workspace(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle update_workspace request."""
        from deepagents_cli.desktop.workspace import get_workspace_manager

        try:
            workspace_id = params.get('workspace_id')
            name = params.get('name')
            category = params.get('category')
            icon = params.get('icon')

            if not workspace_id:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'workspace_id is required'
                    }
                }

            workspace_manager = get_workspace_manager()
            workspace = workspace_manager.update_workspace(
                workspace_id,
                name=name,
                category=category,
                icon=icon
            )

            if workspace is None:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'WORKSPACE_NOT_FOUND',
                        'message': f'Workspace not found: {workspace_id}'
                    }
                }

            return {
                'request_id': request_id,
                'status': 'success',
                'data': workspace.to_dict()
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'UPDATE_WORKSPACE_FAILED',
                    'message': f'Failed to update workspace: {str(e)}'
                }
            }

    async def _handle_set_workspace_skills(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle set_workspace_skills request."""
        from deepagents_cli.desktop.workspace import get_workspace_manager

        try:
            workspace_id = params.get('workspace_id')
            enabled_skills = params.get('enabled_skills')

            if not workspace_id:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'workspace_id is required'
                    }
                }

            if enabled_skills is None:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'enabled_skills is required'
                    }
                }

            workspace_manager = get_workspace_manager()
            workspace = workspace_manager.update_workspace(
                workspace_id,
                enabled_skills=enabled_skills
            )

            if workspace is None:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'WORKSPACE_NOT_FOUND',
                        'message': f'Workspace not found: {workspace_id}'
                    }
                }

            return {
                'request_id': request_id,
                'status': 'success',
                'data': workspace.to_dict()
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'SET_WORKSPACE_SKILLS_FAILED',
                    'message': f'Failed to set workspace skills: {str(e)}'
                }
            }

    # === Skill Management Methods ===

    async def _handle_list_skills(self, request_id: str) -> dict[str, Any]:
        """Handle list_skills request."""
        from pathlib import Path
        from deepagents_cli.skills.load import list_skills
        from deepagents_cli.config import settings

        try:
            # Use agent-level skills directory: ~/.deepagents/{agent_name}/skills/
            user_skills_dir = settings.ensure_user_skills_dir(self.assistant_id)
            project_skills_dir = settings.get_project_skills_dir()

            skills = list_skills(
                user_skills_dir=user_skills_dir,
                project_skills_dir=project_skills_dir
            )

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {'skills': skills}
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'LIST_SKILLS_FAILED',
                    'message': f'Failed to list skills: {str(e)}'
                }
            }

    async def _handle_upload_skill(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle upload_skill request."""
        import base64
        import shutil
        from pathlib import Path
        from deepagents_cli.config import settings

        try:
            skill_name = params.get('skill_name')  # Changed from skillName to match Electron
            files = params.get('files', [])
            location = params.get('location', 'project')

            if not skill_name or not files:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'skillName and files are required'
                    }
                }

            # Determine target directory
            if location == 'user':
                # Use agent-level skills directory: ~/.deepagents/{agent_name}/skills/
                target_dir = settings.ensure_user_skills_dir(self.assistant_id) / skill_name
            else:
                # Use application data directory for project skills
                target_dir = settings.get_project_skills_dir()
                if target_dir:
                    target_dir = target_dir / skill_name
                else:
                    # Fallback to agent-level skills directory
                    target_dir = settings.ensure_user_skills_dir(self.assistant_id) / skill_name

            # Create skill directory
            target_dir.mkdir(parents=True, exist_ok=True)

            # Write files
            for file_info in files:
                file_path = target_dir / file_info['name']
                file_path.parent.mkdir(parents=True, exist_ok=True)

                # Decode base64 content
                if file_info.get('mimeType') == 'application/json':
                    # JSON file
                    content = file_info['content']
                else:
                    # Decode base64
                    content = base64.b64decode(file_info['content'])

                file_path.write_bytes(content)

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {'message': f'Skill "{skill_name}" uploaded successfully'}
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'UPLOAD_SKILL_FAILED',
                    'message': f'Failed to upload skill: {str(e)}'
                }
            }

    async def _handle_delete_skill(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle delete_skill request."""
        import shutil
        from pathlib import Path
        from deepagents_cli.config import settings

        try:
            skill_name = params.get('skill_name')
            location = params.get('location', 'auto')

            if not skill_name:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'skill_name is required'
                    }
                }

            # Try to find and delete the skill
            deleted = False
            user_skills_dir = settings.ensure_user_skills_dir(self.assistant_id)
            project_skills_dir = settings.get_project_skills_dir()

            # Check user skills
            user_skill_dir = user_skills_dir / skill_name
            if user_skill_dir.exists():
                shutil.rmtree(user_skill_dir)
                deleted = True

            # Check project skills
            if location in ['auto', 'project'] and project_skills_dir:
                project_skill_dir = project_skills_dir / skill_name
                if project_skill_dir.exists():
                    shutil.rmtree(project_skill_dir)
                    deleted = True

            if deleted:
                return {
                    'request_id': request_id,
                    'status': 'success',
                    'data': {'message': f'Skill "{skill_name}" deleted successfully'}
                }
            else:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'SKILL_NOT_FOUND',
                        'message': f'Skill not found: {skill_name}'
                    }
                }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'DELETE_SKILL_FAILED',
                    'message': f'Failed to delete skill: {str(e)}'
                }
            }

    async def _handle_set_config(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle setConfig request - save configuration to user home directory."""
        from pathlib import Path

        try:
            config_dir = Path.home() / '.deepagents'
            config_dir.mkdir(parents=True, exist_ok=True)
            config_file = config_dir / '.env'

            # Read existing config
            existing_lines = []
            if config_file.exists():
                existing_lines = config_file.read_text().splitlines()

            # Build new config
            config_updates = params.get('config', {})
            if not isinstance(config_updates, dict):
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'config must be a dictionary'
                    }
                }

            # Update existing lines
            updated_keys = set()
            new_lines = []
            for line in existing_lines:
                if line.strip() and not line.strip().startswith('#'):
                    key_value = line.split('=', 1)
                    if len(key_value) == 2:
                        key = key_value[0].strip()
                        if key in config_updates:
                            new_lines.append(f"{key}={config_updates[key]}")
                            updated_keys.add(key)
                            continue
                new_lines.append(line)

            # Add new keys
            for key, value in config_updates.items():
                if key not in updated_keys:
                    new_lines.append(f"{key}={value}")

            # Write config file
            config_file.write_text('\n'.join(new_lines) + '\n')

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {'message': 'Configuration saved successfully'}
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'SET_CONFIG_FAILED',
                    'message': f'Failed to save configuration: {str(e)}'
                }
            }

    async def _handle_get_config(self, request_id: str) -> dict[str, Any]:
        """Handle getConfig request - read configuration from user home directory."""
        from pathlib import Path

        try:
            config_file = Path.home() / '.deepagents' / '.env'
            config = {}

            if config_file.exists():
                for line in config_file.read_text().splitlines():
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        config[key.strip()] = value.strip()

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {'config': config}
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'GET_CONFIG_FAILED',
                    'message': f'Failed to read configuration: {str(e)}'
                }
            }

    async def _handle_reload_config(self, request_id: str) -> dict[str, Any]:
        """Handle reload_config request - reload configuration from file."""
        from pathlib import Path

        try:
            config_file = Path.home() / '.deepagents' / '.env'
            config = {}

            if config_file.exists():
                for line in config_file.read_text().splitlines():
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        config[key.strip()] = value.strip()

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'config': config,
                    'message': 'Configuration reloaded successfully'
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'RELOAD_CONFIG_FAILED',
                    'message': f'Failed to reload configuration: {str(e)}'
                }
            }

    async def _handle_clone_skill_from_github(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle clone_skill_from_github request."""
        import subprocess
        import tempfile
        from pathlib import Path
        from deepagents_cli.config import settings

        try:
            github_url = params.get('github_url')
            location = params.get('location', 'project')
            use_proxy = params.get('use_proxy', False)

            if not github_url:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'github_url is required'
                    }
                }

            # Create temp directory for cloning
            with tempfile.TemporaryDirectory() as temp_dir:
                # Set up proxy if needed
                git_env = None
                if use_proxy:
                    import os
                    git_env = os.environ.copy()
                    # You can set proxy here if needed

                # Clone repository
                result = subprocess.run(
                    ['git', 'clone', '--depth', '1', github_url, temp_dir],
                    capture_output=True,
                    text=True,
                    env=git_env
                )

                if result.returncode != 0:
                    return {
                        'request_id': request_id,
                        'status': 'error',
                        'error': {
                            'code': 'CLONE_FAILED',
                            'message': f'Failed to clone repository: {result.stderr}'
                        }
                    }

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {'message': 'Repository cloned successfully'}
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'CLONE_FAILED',
                    'message': f'Failed to clone from GitHub: {str(e)}'
                }
            }

    async def _handle_scan_github_for_skills(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle scan_github_for_skills request."""
        import subprocess
        import tempfile
        import os
        from pathlib import Path

        try:
            github_url = params.get('github_url')
            use_proxy = params.get('use_proxy', False)

            if not github_url:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'github_url is required'
                    }
                }

            # Create temp directory
            temp_dir = tempfile.mkdtemp(prefix='deepagents-github-')

            # Clone repository
            env = os.environ.copy()
            if use_proxy:
                # Set proxy if needed
                pass

            result = subprocess.run(
                ['git', 'clone', '--depth', '1', github_url, temp_dir],
                capture_output=True,
                text=True,
                env=env
            )

            if result.returncode != 0:
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'SCAN_FAILED',
                        'message': f'Failed to clone: {result.stderr}'
                    }
                }

            # Scan for skills
            found_skills = []
            skills_base = Path(temp_dir) / '.claude' / 'skills'

            if skills_base.exists():
                for skill_dir in skills_base.iterdir():
                    if skill_dir.is_dir():
                        skill_md = skill_dir / 'SKILL.md'
                        if skill_md.exists():
                            found_skills.append({
                                'dir_name': skill_dir.name,
                                'relative_path': str(skill_dir.relative_to(temp_dir))
                            })

            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'temp_dir': str(temp_dir),
                    'skills': found_skills
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'SCAN_FAILED',
                    'message': f'Failed to scan GitHub: {str(e)}'
                }
            }

    async def _handle_import_selected_skills(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle import_selected_skills request."""
        import shutil
        from pathlib import Path
        from deepagents_cli.config import settings

        try:
            temp_dir = Path(params.get('temp_dir'))
            selected_skills = params.get('selected_skills', [])
            location = params.get('location', 'project')

            # Determine target directory
            if location == 'user':
                # Use agent-level skills directory: ~/.deepagents/{agent_name}/skills/
                target_base = settings.ensure_user_skills_dir(self.assistant_id)
            else:
                # Use application data directory for project skills
                target_base = settings.get_project_skills_dir()
                if not target_base:
                    # Fallback to agent-level skills directory
                    target_base = settings.ensure_user_skills_dir(self.assistant_id)

            target_base.mkdir(parents=True, exist_ok=True)

            imported_count = 0
            for skill_info in selected_skills:
                skill_name = skill_info['dir_name']
                relative_path = skill_info['relative_path']
                source_dir = temp_dir / relative_path
                target_dir = target_base / skill_name

                if source_dir.exists():
                    # Copy skill directory
                    if target_dir.exists():
                        shutil.rmtree(target_dir)
                    shutil.copytree(source_dir, target_dir)
                    imported_count += 1

            # Clean up temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'message': f'Imported {imported_count} skills successfully'
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'IMPORT_FAILED',
                    'message': f'Failed to import skills: {str(e)}'
                }
            }

    # === Conversation Management Methods ===

    async def _handle_create_conversation(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle create_conversation request.

        Creates a new conversation within a workspace and associates it with the workspace.
        """
        from deepagents_cli.desktop.workspace import get_workspace_manager
        import uuid
        from pathlib import Path

        try:
            workspace_id = params.get('workspace_id')
            title = params.get('title')

            if not workspace_id:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'workspace_id is required'
                    }
                }

            workspace_manager = get_workspace_manager()
            workspace = workspace_manager.get_workspace(workspace_id)

            if not workspace:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'WORKSPACE_NOT_FOUND',
                        'message': f'Workspace not found: {workspace_id}'
                    }
                }

            # Generate unique conversation ID
            conversation_id = str(uuid.uuid4())

            # Add conversation_id to workspace's conversation_ids list
            if conversation_id not in workspace.conversation_ids:
                workspace.conversation_ids.append(conversation_id)
                workspace_manager.save_workspace(workspace)

            # Create conversation metadata file
            from deepagents_cli.config import settings
            conv_dir = settings.get_workspace_dir_v2(workspace_id)
            conv_dir.mkdir(parents=True, exist_ok=True)

            # Create conversations directory within workspace
            conversations_dir = conv_dir / 'conversations'
            conversations_dir.mkdir(parents=True, exist_ok=True)

            # Save conversation metadata
            conv_metadata = {
                'id': conversation_id,
                'workspace_id': workspace_id,
                'title': title or f'对话 {len(workspace.conversation_ids)}',
                'created_at': str(Path.cwd()),  # Use current time as placeholder
                'updated_at': str(Path.cwd())
            }

            import json
            conv_file = conversations_dir / f'{conversation_id}.json'
            conv_file.write_text(json.dumps(conv_metadata, ensure_ascii=False, indent=2))

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'conversation_id': conversation_id,
                    'title': conv_metadata['title'],
                    'workspace_id': workspace_id
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'CREATE_CONVERSATION_FAILED',
                    'message': f'Failed to create conversation: {str(e)}'
                }
            }

    async def _handle_list_conversations(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle list_conversations request.

        Lists all conversations within a workspace.
        """
        from deepagents_cli.desktop.workspace import get_workspace_manager
        from deepagents_cli.config import settings
        import json
        from pathlib import Path

        try:
            workspace_id = params.get('workspace_id')

            if not workspace_id:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'workspace_id is required'
                    }
                }

            workspace_manager = get_workspace_manager()
            workspace = workspace_manager.get_workspace(workspace_id)

            if not workspace:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'WORKSPACE_NOT_FOUND',
                        'message': f'Workspace not found: {workspace_id}'
                    }
                }

            # Load conversation metadata from workspace
            conv_dir = settings.get_workspace_dir_v2(workspace_id) / 'conversations'
            print(f"[_handle_list_conversations] Loading conversations from: {conv_dir}", file=sys.stderr)

            conversations = []
            if conv_dir.exists():
                for conv_file in conv_dir.glob('*.json'):
                    try:
                        metadata = json.loads(conv_file.read_text())
                        conversations.append(metadata)
                    except Exception as e:
                        print(f"[_handle_list_conversations] Error reading {conv_file}: {e}", file=sys.stderr)
                        continue
            
            # Sort conversations by updated_at (descending)
            conversations.sort(key=lambda x: x.get('updated_at', ''), reverse=True)
            
            print(f"[_handle_list_conversations] Found {len(conversations)} conversations", file=sys.stderr)

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'conversations': conversations,
                    'workspace_id': workspace_id
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'LIST_CONVERSATIONS_FAILED',
                    'message': f'Failed to list conversations: {str(e)}'
                }
            }

    async def _handle_delete_conversation(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle delete_conversation request.

        Deletes a conversation and its associated checkpointer database.
        """
        from deepagents_cli.desktop.workspace import get_workspace_manager
        from deepagents_cli.config import settings
        from pathlib import Path

        try:
            conversation_id = params.get('conversation_id')

            if not conversation_id:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'conversation_id is required'
                    }
                }

            workspace_manager = get_workspace_manager()

            # Find and update workspace containing this conversation
            workspaces = workspace_manager.list_workspaces()
            for workspace in workspaces:
                if conversation_id in workspace.conversation_ids:
                    workspace.conversation_ids.remove(conversation_id)
                    workspace_manager.save_workspace(workspace)

                    # Delete conversation metadata file
                    conv_dir = settings.get_workspace_dir_v2(workspace.id) / 'conversations'
                    conv_file = conv_dir / f'{conversation_id}.json'
                    if conv_file.exists():
                        conv_file.unlink()

                    # Delete checkpointer database
                    from deepagents_cli.checkpointer_factory import get_checkpointer_factory
                    checkpointer_factory = get_checkpointer_factory()
                    db_path = checkpointer_factory.base_path / f'{conversation_id}.db'
                    if db_path.exists():
                        db_path.unlink()

                    # Clear from agent cache if present
                    cache_key = f"{workspace.id}:{conversation_id}"
                    if cache_key in self.agents:
                        del self.agents[cache_key]

                    return {
                        'request_id': request_id,
                        'status': 'success',
                        'data': {
                            'message': f'Conversation "{conversation_id}" deleted successfully'
                        }
                    }

            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'CONVERSATION_NOT_FOUND',
                    'message': f'Conversation not found: {conversation_id}'
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'DELETE_CONVERSATION_FAILED',
                    'message': f'Failed to delete conversation: {str(e)}'
                }
            }

    async def _handle_switch_conversation(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle switch_conversation request.

        Switches the active conversation within a workspace.
        """
        try:
            workspace_id = params.get('workspace_id')
            conversation_id = params.get('conversation_id')

            # Update current conversation tracking
            self.current_workspace_id = workspace_id
            self.current_conversation_id = conversation_id

            # Pre-load agent for this conversation
            if workspace_id and conversation_id:
                self.agent, self.composite_backend = await self._get_or_create_agent(
                    workspace_id=workspace_id,
                    conversation_id=conversation_id
                )

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'workspace_id': workspace_id,
                    'conversation_id': conversation_id,
                    'message': 'Switched to conversation successfully'
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'SWITCH_CONVERSATION_FAILED',
                    'message': f'Failed to switch conversation: {str(e)}'
                }
            }

    async def _handle_rename_conversation(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle rename_conversation request.

        Renames a conversation within a workspace.
        """
        from deepagents_cli.desktop.workspace import get_workspace_manager
        from deepagents_cli.config import settings
        import json
        from pathlib import Path

        try:
            conversation_id = params.get('conversation_id')
            title = params.get('title')

            if not conversation_id or not title:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'conversation_id and title are required'
                    }
                }

            workspace_manager = get_workspace_manager()
            workspaces = workspace_manager.list_workspaces()

            for workspace in workspaces:
                if conversation_id in workspace.conversation_ids:
                    # Update conversation metadata file
                    conv_dir = settings.get_workspace_dir_v2(workspace.id) / 'conversations'
                    conv_file = conv_dir / f'{conversation_id}.json'

                    if conv_file.exists():
                        metadata = json.loads(conv_file.read_text())
                        metadata['title'] = title
                        metadata['updated_at'] = str(Path.cwd())  # Use current time as placeholder
                        conv_file.write_text(json.dumps(metadata, ensure_ascii=False, indent=2))

                        return {
                            'request_id': request_id,
                            'status': 'success',
                            'data': {
                                'conversation_id': conversation_id,
                                'title': title
                            }
                        }

            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'CONVERSATION_NOT_FOUND',
                    'message': f'Conversation not found: {conversation_id}'
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'RENAME_CONVERSATION_FAILED',
                    'message': f'Failed to rename conversation: {str(e)}'
                }
            }

    async def _handle_get_conversation_history(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """Handle get_conversation_history request.

        Retrieves the message history for a specific conversation.
        """
        import sys
        print(f"[_handle_get_conversation_history] Called with params: {params}", file=sys.stderr)

        try:
            workspace_id = params.get('workspace_id')
            conversation_id = params.get('conversation_id')

            if not conversation_id:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'conversation_id is required'
                    }
                }

            # Get agent for this conversation (this loads the checkpointer)
            agent, _ = await self._get_or_create_agent(
                workspace_id=workspace_id,
                conversation_id=conversation_id
            )

            # Determine thread_id
            thread_id = conversation_id if conversation_id else (workspace_id if workspace_id else "default")
            agent_config = {"configurable": {"thread_id": thread_id}}
            
            print(f"[_handle_get_conversation_history] Fetching history for thread_id: {thread_id}", file=sys.stderr)

            # DEBUG: Check DB file
            from deepagents_cli.checkpointer_factory import get_checkpointer_factory
            factory = get_checkpointer_factory()
            db_path = factory.base_path / f"{conversation_id}.db"
            if db_path.exists():
                print(f"[_handle_get_conversation_history] DB file exists: {db_path}, size: {db_path.stat().st_size} bytes", file=sys.stderr)
            else:
                 print(f"[_handle_get_conversation_history] DB file DOES NOT exist: {db_path}", file=sys.stderr)

            # Fetch state
            state = await agent.aget_state(agent_config)
            messages = state.values.get("messages", [])
            
            print(f"[_handle_get_conversation_history] Found {len(messages)} messages", file=sys.stderr)

            # Serialize messages
            history = []
            for i, msg in enumerate(messages):
                msg_type = getattr(msg, 'type', 'unknown')
                content = getattr(msg, 'content', '')
                
                print(f"[_handle_get_conversation_history] MSG {i}: type={msg_type}, content_len={len(str(content))}, content_preview={str(content)[:50]}", file=sys.stderr)
                
                # Basic message object
                msg_obj = {
                    'type': msg_type,
                    'content': content
                }
                
                # Add additional fields based on type
                if msg_type == 'tool':
                    msg_obj['name'] = getattr(msg, 'name', '')
                    msg_obj['tool_call_id'] = getattr(msg, 'tool_call_id', '')
                elif msg_type == 'ai':
                    if hasattr(msg, 'tool_calls') and msg.tool_calls:
                        msg_obj['tool_calls'] = [
                            {
                                'name': tc.get('name'),
                                'args': tc.get('args'),
                                'id': tc.get('id')
                            }
                            for tc in msg.tool_calls
                        ]
                
                history.append(msg_obj)

            return {
                'request_id': request_id,
                'status': 'success',
                'data': {
                    'conversation_id': conversation_id,
                    'messages': history
                }
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'GET_HISTORY_FAILED',
                    'message': f'Failed to get conversation history: {str(e)}'
                }
            }

    async def stop(self) -> None:
        """Stop the protocol and cleanup resources."""
        self.running = False
