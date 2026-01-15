"""OpenSandbox backend implementation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from deepagents.backends.protocol import (
    ExecuteResponse,
    FileDownloadResponse,
    FileUploadResponse,
)
from deepagents.backends.sandbox import BaseSandbox

if TYPE_CHECKING:
    from opensandbox import Sandbox


class OpenSandboxBackend(BaseSandbox):
    """OpenSandbox backend implementation conforming to SandboxBackendProtocol.

    This implementation inherits all file operation methods from BaseSandbox
    and only implements the execute() method using OpenSandbox's API.
    """

    def __init__(self, sandbox: Sandbox, url: str) -> None:
        """Initialize the OpenSandboxBackend with an OpenSandbox instance.

        Args:
            sandbox: Active OpenSandbox instance
            url: The access URL for code-server
        """
        self._sandbox = sandbox
        self._url = url
        self._timeout = 30 * 60

    @property
    def id(self) -> str:
        """Unique identifier for the sandbox backend."""
        return str(self._sandbox.id)

    @property
    def url(self) -> str:
        """Get the access URL for this sandbox."""
        return self._url

    def execute(
        self,
        command: str,
    ) -> ExecuteResponse:
        """Execute a command in the sandbox and return ExecuteResponse.

        Args:
            command: Full shell command string to execute.

        Returns:
            ExecuteResponse with combined output, exit code, and truncation flag.
        """
        from opensandbox.models.execd import RunCommandOpts

        # Execute command using OpenSandbox's commands.run API
        result = self._sandbox.commands.run(
            command,
            opts=RunCommandOpts(timeout=int(self._timeout)),
        )

        return ExecuteResponse(
            output=result.stdout or "",
            exit_code=result.exit_code,
            truncated=False,  # OpenSandbox doesn't provide truncation info
        )

    def cleanup(self) -> None:
        """Clean up the sandbox."""
        self._sandbox.cleanup()
