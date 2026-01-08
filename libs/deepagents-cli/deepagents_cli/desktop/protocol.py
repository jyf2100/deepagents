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
        # Create the agent
        self.agent, self.composite_backend = create_cli_agent(
            model=settings.model_name or "claude-sonnet-4-5-20250929",
            assistant_id=self.assistant_id,
            tools=[],  # No extra tools for desktop mode
            sandbox=None,  # Local filesystem mode
            auto_approve=False,  # Require user approval for destructive operations
            enable_memory=True,
            enable_skills=True,
            enable_shell=True,  # Enable shell execution
        )

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

                # Read message body
                message_data = await reader.readexactly(length)
                message = msgpack.unpackb(message_data)

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

        try:
            # Invoke agent
            if stream:
                # Streaming response
                content = ""
                async for chunk in self.agent.astream({'messages': [user_message]}):
                    # Extract content from chunk
                    if isinstance(chunk, dict) and 'messages' in chunk:
                        for msg in chunk['messages']:
                            if hasattr(msg, 'content'):
                                content += msg.content
                            elif isinstance(msg, dict) and 'content' in msg:
                                content += msg['content']
                return {
                    'request_id': request_id,
                    'status': 'success',
                    'data': {'content': content}
                }
            else:
                # Single response
                response = await self.agent.ainvoke({'messages': [user_message]})
                content = ""
                if 'messages' in response:
                    for msg in response['messages']:
                        if hasattr(msg, 'content'):
                            content += msg.content
                        elif isinstance(msg, dict) and 'content' in msg:
                            content += msg['content']
                return {
                    'request_id': request_id,
                    'status': 'success',
                    'data': {'content': content}
                }
        except Exception as e:
            return {
                'request_id': request_id,
                'status': 'error',
                'error': {
                    'code': 'AGENT_ERROR',
                    'message': str(e)
                }
            }

    async def stop(self) -> None:
        """Stop the protocol and cleanup resources."""
        self.running = False
