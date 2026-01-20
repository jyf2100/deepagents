"""Desktop mode for DeepAgents."""

import asyncio
import os
import sys
from pathlib import Path

import dotenv
from rich.console import Console

from .protocol import DesktopProtocol


async def main(socket_path: str, assistant_id: str = "desktop") -> None:
    """Entry point for desktop mode.

    Args:
        socket_path: Path to the Unix socket for IPC
        assistant_id: Agent identifier for memory storage
    """
    config_file = Path.home() / '.deepagents' / '.env'
    if config_file.exists():
        dotenv.load_dotenv(config_file, override=True)
        from deepagents_cli.config import _normalize_env_aliases, settings as global_settings
        _normalize_env_aliases()

        # Debug logging
        print(f"[Desktop] OPENAI_API_KEY: {'***' if os.environ.get('OPENAI_API_KEY') else 'NOT SET'}", flush=True)
        print(f"[Desktop] OPENAI_MODEL: {os.environ.get('OPENAI_MODEL', 'NOT SET')}", flush=True)
        print(f"[Desktop] ANTHROPIC_API_KEY: {'***' if os.environ.get('ANTHROPIC_API_KEY') else 'NOT SET'}", flush=True)

        global_settings.openai_api_key = os.environ.get("OPENAI_API_KEY")
        global_settings.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
        global_settings.google_api_key = os.environ.get("GOOGLE_API_KEY")
        global_settings.tavily_api_key = os.environ.get("TAVILY_API_KEY")

        print(f"[Desktop] Settings has_openai: {global_settings.has_openai}", flush=True)
        print(f"[Desktop] Settings has_anthropic: {global_settings.has_anthropic}", flush=True)
        print(f"[Desktop] Loaded configuration from {config_file}", flush=True)
    else:
        print(f"[Desktop] No configuration file found at {config_file}", flush=True)
        print(f"[Desktop] Please configure API keys through the application interface", flush=True)

    # Debug logging
    print(f"[Desktop] Starting with socket_path: {socket_path}", flush=True)
    print(f"[Desktop] assistant_id: {assistant_id}", flush=True)

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
