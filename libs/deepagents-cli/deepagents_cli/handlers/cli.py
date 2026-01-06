"""CLI event handler implementation.

This module provides the CLIEventHandler which renders execution events
to the terminal using Rich for beautiful output.
"""

import asyncio
from typing import Any

from deepagents_cli.config import console
from deepagents_cli.core.events import (
    Decision,
    ErrorEvent,
    EventType,
    HITLPromptEvent,
)
from deepagents_cli.core.handlers import ExecutionHandler
from deepagents_cli.execution import prompt_for_tool_approval
from deepagents_cli.ui import (
    TokenTracker,
    format_tool_display,
    render_diff_block,
    render_todo_list,
)


class CLIEventHandler(ExecutionHandler):
    """CLI event handler that renders events to the terminal.

    This handler integrates with the existing Rich-based UI rendering
    functions in deepagents_cli.ui to display execution events.

    Example:
        ```python
        handler = CLIEventHandler()
        await handler.on_start()
        await handler.on_event(some_event)
        decision = await handler.on_hitl_prompt(hitl_event)
        await handler.on_complete()
        ```
    """

    def __init__(self) -> None:
        """Initialize the CLI event handler."""
        self.token_tracker = TokenTracker()

    async def on_event(self, event: Any) -> None:
        """Handle an execution event.

        Args:
            event: The execution event to handle.
        """
        if not hasattr(event, "type"):
            return

        if event.type == EventType.THINKING_START:
            self._handle_thinking_start()
        elif event.type == EventType.THINKING_STOP:
            self._handle_thinking_stop()
        elif event.type == EventType.AGENT_MESSAGE:
            self._handle_agent_message(event.data)
        elif event.type == EventType.TOOL_START:
            self._handle_tool_start(event.data)
        elif event.type == EventType.TOOL_COMPLETE:
            self._handle_tool_complete(event.data)
        elif event.type == EventType.FILE_DIFF:
            self._handle_file_diff(event.data)
        elif event.type == EventType.TODO_UPDATE:
            self._handle_todo_update(event.data)
        elif event.type == EventType.TOKEN_USAGE:
            self._handle_token_usage(event.data)

    async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
        """Handle a human-in-the-loop prompt.

        Args:
            prompt: The HITL prompt event.

        Returns:
            The user's decision.
        """
        tool_name = prompt.data.get("tool_name", "")
        tool_args = prompt.data.get("tool_args", {})

        # Build action request for prompt function
        action_request = {
            "name": tool_name,
            "args": tool_args,
            "description": prompt.data.get("preview", ""),
        }

        # Call the existing prompt function
        result = await asyncio.to_thread(
            prompt_for_tool_approval,
            action_request,
            None,  # assistant_id
        )

        # Convert result to our Decision type
        # Check for decision type by checking the 'action' field
        if isinstance(result, dict):
            action = result.get("action", "")
            if action == "approve":
                return Decision(action="approve")
            if action == "reject":
                return Decision(action="reject")
            if result.get("type") == "auto_approve_all":
                # Auto-approve all mode - treat as approve
                return Decision(action="approve")

        # Default to approve for unknown types
        return Decision(action="approve")

    async def on_start(self) -> None:
        """Called when execution starts."""
        # Could display a startup banner here

    async def on_complete(self) -> None:
        """Called when execution completes successfully."""
        # Display final token usage
        self.token_tracker.display_last()

    async def on_error(self, error: ErrorEvent) -> None:
        """Called when an error occurs during execution.

        Args:
            error: The error event.
        """
        console.print(f"\n[red]Error: {error.data.get('message', 'Unknown error')}[/red]")
        error_type = error.data.get("type", "")
        if error_type:
            console.print(f"[dim]Type: {error_type}[/dim]")

        traceback = error.data.get("traceback", "")
        if traceback:
            console.print(f"[dim]{traceback}[/dim]")

    def _handle_thinking_start(self) -> None:
        """Handle thinking start event."""
        # Could show a thinking indicator here

    def _handle_thinking_stop(self) -> None:
        """Handle thinking stop event."""
        # Could hide thinking indicator here

    def _handle_agent_message(self, data: dict[str, Any]) -> None:
        """Handle agent message event.

        Args:
            data: Event data containing content and done flag.
        """
        content = data.get("content", "")
        if content:
            # Print the agent message
            console.print(content, end="" if not data.get("done") else "\n")

    def _handle_tool_start(self, data: dict[str, Any]) -> None:
        """Handle tool start event.

        Args:
            data: Event data containing tool name, id, and args.
        """
        name = data.get("name", "")
        args = data.get("args", {})

        # Format and display tool call
        display = format_tool_display(name, args)
        console.print(f"  [dim]▶[/dim] {display}")

    def _handle_tool_complete(self, data: dict[str, Any]) -> None:
        """Handle tool complete event.

        Args:
            data: Event data containing tool name, id, result, and duration.
        """
        # Could display tool result here
        # For now, we'll be silent as the result is often shown elsewhere

    def _handle_file_diff(self, data: dict[str, Any]) -> None:
        """Handle file diff event.

        Args:
            data: Event data containing path, diff, and operation.
        """
        diff = data.get("diff", [])
        path = data.get("path", "")
        operation = data.get("operation", "edit")

        if diff:
            # Format diff for display
            diff_text = "\n".join(
                f"{d.get('line', '')}: {d.get('content', '')}" for d in diff
            )
            title = f"{operation.capitalize()}: {path}"
            render_diff_block(diff_text, title)

    def _handle_todo_update(self, data: dict[str, Any]) -> None:
        """Handle todo update event.

        Args:
            data: Event data containing todos and status.
        """
        todos = data.get("todos", [])
        if todos:
            render_todo_list(todos)

    def _handle_token_usage(self, data: dict[str, Any]) -> None:
        """Handle token usage event.

        Args:
            data: Event data containing token counts.
        """
        input_tokens = data.get("input_tokens", 0)
        output_tokens = data.get("output_tokens", 0)

        # Update token tracker
        self.token_tracker.add(input_tokens, output_tokens)


__all__ = ["CLIEventHandler"]
