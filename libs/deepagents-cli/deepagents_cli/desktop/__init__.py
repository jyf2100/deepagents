"""Desktop mode for DeepAgents."""

import asyncio
import sys

from .protocol import DesktopProtocol


async def main(socket_path: str, assistant_id: str = "desktop") -> None:
    """Entry point for desktop mode.

    Args:
        socket_path: Path to the Unix socket for IPC
        assistant_id: Agent identifier for memory storage
    """
    protocol = DesktopProtocol(socket_path, assistant_id)
    try:
        await protocol.start()
    except KeyboardInterrupt:
        print("\nDesktop mode stopped.")
        await protocol.stop()


if __name__ == '__main__':
    socket_path_arg = sys.argv[1] if len(sys.argv) > 1 else '/tmp/deepagents-desktop.sock'
    assistant_id_arg = sys.argv[2] if len(sys.argv) > 2 else 'desktop'
    asyncio.run(main(socket_path_arg, assistant_id_arg))
