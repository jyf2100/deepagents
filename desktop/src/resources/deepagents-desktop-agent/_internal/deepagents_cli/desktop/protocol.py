"""Unix Socket 通信协议 - 桌面模式."""

import asyncio
import msgpack
import os
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
        self.agent = None
        self.composite_backend = None
        self.running = False
        self.current_workspace_id = None  # Track current workspace for agent recreation
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

    def _recreate_agent_with_workspace(self, workspace_id: str | None) -> None:
        """Recreate the agent with a new workspace configuration.

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
                print(f"[handle_connection] Reading message of length: {length}", file=sys.stderr, flush=True)

                # Read message body
                try:
                    message_data = await reader.readexactly(length)
                    
                    # Log first 50 bytes in hex for debugging
                    hex_dump = message_data[:50].hex()
                    print(f"[handle_connection] Raw data (hex, first 50): {hex_dump}", file=sys.stderr, flush=True)
                    
                    # FORCE fallback: try JSON first, then msgpack as last resort
                    # This avoids the zlib error by assuming Electron is sending JSON string bytes
                    import json
                    try:
                        message_str = message_data.decode('utf-8')
                        print(f"[handle_connection] Decoding as UTF-8 JSON: {message_str[:100]}...", file=sys.stderr, flush=True)
                        message = json.loads(message_str)
                    except Exception as json_err:
                        print(f"[handle_connection] JSON decode failed: {json_err}. Trying msgpack...", file=sys.stderr, flush=True)
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
            try:
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
        print(f"[handle_request] Received request: {request_type}", file=sys.stderr)

        # Test mode: simple ping-pong
        if os.getenv("DEEPAGENTS_TEST") == "1":
            if request_type == "ping":
                return {
                    'request_id': message.get('request_id'),
                    'status': 'success',
                    'data': {'pong': True}
                }
            return {
                'request_id': message.get('request_id'),
                'status': 'error',
                'error': {
                    'code': 'UNKNOWN_METHOD',
                    'message': f"Unknown method: {request_type}"
                }
            }

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
            params: Chat parameters including message and stream flag

        Returns:
            Response with AI content
        """
        if self.agent is None:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'AGENT_NOT_READY',
                    'message': 'Agent not initialized'
                }
            }

        user_message = params.get('message', '')
        stream = params.get('stream', False)
        workspace_id = params.get('workspace_id')

        # Debug logging
        import sys
        print(f"[_handle_chat] Called with message: '{user_message[:50]}...', stream={stream}, workspace_id={workspace_id}", file=sys.stderr)

        # Check if workspace changed and recreate agent if needed
        if workspace_id != self.current_workspace_id:
            self._recreate_agent_with_workspace(workspace_id)

        # Prepare config with thread_id for checkpointer
        # Use workspace_id as thread_id for conversation isolation
        thread_id = workspace_id if workspace_id else "default"
        agent_config = {"configurable": {"thread_id": thread_id}}

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
                    print(f"[_handle_chat] Chunk {chunk_count}: type={type(chunk).__name__}", file=sys.stderr)
                    if isinstance(chunk, dict):
                        print(f"[_handle_chat] Chunk {chunk_count} keys: {list(chunk.keys())}", file=sys.stderr)
                        if "__interrupt__" in chunk:
                            print(f"[_handle_chat] *** INTERRUPT FOUND in chunk! ***", file=sys.stderr)

                    # Handle UPDATES stream - for interrupts (similar to execution.py)
                    if isinstance(chunk, tuple) and len(chunk) == 3:
                        _namespace, current_stream_mode, data = chunk
                        if current_stream_mode == "updates" and isinstance(data, dict):
                            if "__interrupt__" in data:
                                interrupts: list = data["__interrupt__"]
                                if interrupts:
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
                                    tool_name = action.get('name', 'unknown_tool')
                                    tool_args = action.get('args', {})
                                    agent_thinking = action.get('description', '')
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

                    # Debug: print chunk with 'model' key
                    import sys
                    if isinstance(chunk, dict) and 'model' in chunk:
                        print(f"[_handle_chat] Chunk {chunk_count} has 'model' key: {type(chunk['model'])}", file=sys.stderr)
                        print(f"[_handle_chat] model value: {chunk['model']}", file=sys.stderr)

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
                import sys
                print(f"[_handle_chat] Response keys: {response.keys() if isinstance(response, dict) else type(response)}", file=sys.stderr)
                print(f"[_handle_chat] Response: {response}", file=sys.stderr)

                # Check for interrupt in non-streaming mode
                if '__interrupt__' in response:
                    interrupts = response['__interrupt__']
                    if interrupts:
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
            import sys
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
        thread_id = workspace_id if workspace_id else "default"
        agent_config = {"configurable": {"thread_id": thread_id}}

        # Build hitl_response (map interrupt_id to decisions)
        hitl_response = {}
        for interrupt_id in self.pending_interrupts.keys():
            decision = {"type": action}
            if action == "edit" and tool_input:
                decision["tool_input"] = tool_input
            hitl_response[interrupt_id] = {"decisions": [decision]}

        print(f"[_handle_tool_approval] Resuming with {len(hitl_response)} interrupt decisions", file=sys.stderr)

        try:
            from langgraph.types import Command

            # Resume agent with user decision
            response = await self.agent.ainvoke(
                Command(resume=hitl_response),
                config=agent_config
            )

            # Clear pending interrupts
            self.pending_interrupts.clear()

            # Extract content from response
            content = ""
            if 'messages' in response:
                for msg in response['messages']:
                    if hasattr(msg, 'content'):
                        content += msg.content
                    elif isinstance(msg, dict) and 'content' in msg:
                        content += msg['content']

            print(f"[_handle_tool_approval] Resume complete, content length: {len(content)}", file=sys.stderr)

            # CRITICAL: Use the original chat request_id to resolve the correct Promise
            original_request_id = getattr(self, '_original_chat_request_id', None)
            if original_request_id:
                print(f"[_handle_tool_approval] Using original request_id: {original_request_id}", file=sys.stderr)
                return {
                    'request_id': original_request_id,  # Use original chat request_id
                    'status': 'success',
                    'data': {'content': content}
                }
            else:
                print(f"[_handle_tool_approval] WARNING: No original request_id stored, using current: {request_id}", file=sys.stderr)
                return {
                    'request_id': request_id,
                    'status': 'success',
                    'data': {'content': content}
                }
        except Exception as e:
            import sys
            print(f"[_handle_tool_approval] Exception: {e}", file=sys.stderr)
            return {
                'status': 'error',
                'error': {'code': 'AGENT_ERROR', 'message': str(e)}
            }

    # === Workspace Management Methods ===

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
        """Handle create_workspace request."""
        from deepagents_cli.desktop.workspace import get_workspace_manager

        try:
            workspace_id = params.get('id')
            name = params.get('name')
            category = params.get('category', '通用')
            enabled_skills = params.get('enabled_skills', ['*'])
            icon = params.get('icon', 'folder')

            workspace_manager = get_workspace_manager()
            workspace = workspace_manager.create_workspace(
                id=workspace_id,
                name=name,
                category=category,
                enabled_skills=enabled_skills,
                icon=icon
            )

            return {
                'request_id': request_id,
                'status': 'success',
                'data': workspace.to_dict()
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
            skill_name = params.get('skillName')
            location = params.get('location', 'auto')

            if not skill_name:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'skillName is required'
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
            github_url = params.get('githubUrl')
            location = params.get('location', 'project')
            use_proxy = params.get('useProxy', False)

            if not github_url:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'githubUrl is required'
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
            github_url = params.get('githubUrl')
            use_proxy = params.get('useProxy', False)

            if not github_url:
                return {
                    'request_id': request_id,
                    'status': 'error',
                    'error': {
                        'code': 'INVALID_PARAMS',
                        'message': 'githubUrl is required'
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
                    'tempDir': temp_dir,
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
            temp_dir = Path(params.get('tempDir'))
            selected_skills = params.get('selectedSkills', [])
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

    async def stop(self) -> None:
        """Stop the protocol and cleanup resources."""
        self.running = False
