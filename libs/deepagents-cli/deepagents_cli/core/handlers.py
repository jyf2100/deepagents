"""Handler protocol for deepagents-cli execution.

This module defines the abstract base class that all execution handlers
must implement, enabling separation of execution logic from UI rendering.
"""

from abc import ABC, abstractmethod
from typing import Any

from deepagents_cli.core.events import Decision, ErrorEvent, HITLPromptEvent


class ExecutionHandler(ABC):
    """Abstract base class for execution event handlers.

    Implementations of this protocol handle events generated during
    agent execution, rendering them to appropriate UI (CLI, Web, etc.).

    Example:
        ```python
        class CLIEventHandler(ExecutionHandler):
            async def on_event(self, event) -> None:
                # Render event to terminal
                print(event)

            async def on_hitl_prompt(self, prompt) -> Decision:
                # Show prompt and get user decision
                return Decision(action="approve")

            async def on_start(self) -> None:
                # Show start message
                pass

            async def on_complete(self) -> None:
                # Show completion message
                pass

            async def on_error(self, error) -> None:
                # Show error message
                pass
        ```
    """

    @abstractmethod
    async def on_event(self, event: Any) -> None:
        """Handle an execution event.

        Args:
            event: The execution event to handle.
        """

    @abstractmethod
    async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
        """Handle a human-in-the-loop prompt.

        Args:
            prompt: The HITL prompt event.

        Returns:
            The user's decision.
        """

    @abstractmethod
    async def on_start(self) -> None:
        """Called when execution starts."""

    @abstractmethod
    async def on_complete(self) -> None:
        """Called when execution completes successfully."""

    @abstractmethod
    async def on_error(self, error: ErrorEvent) -> None:
        """Called when an error occurs during execution.

        Args:
            error: The error event.
        """


__all__ = ["ExecutionHandler"]
