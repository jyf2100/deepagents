"""Event system for deepagents-cli execution.

This module defines the event types and data structures used for the
event-driven architecture that separates execution logic from UI rendering.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal, Optional


class EventType(Enum):
    """Execution event types."""

    # Agent state
    THINKING_START = "thinking_start"
    THINKING_STOP = "thinking_stop"
    AGENT_MESSAGE = "agent_message"

    # Tool execution
    TOOL_START = "tool_start"
    TOOL_COMPLETE = "tool_complete"
    TOOL_ERROR = "tool_error"

    # File operations
    FILE_READ = "file_read"
    FILE_WRITE = "file_write"
    FILE_EDIT = "file_edit"
    FILE_DIFF = "file_diff"

    # Task management
    TODO_UPDATE = "todo_update"

    # HITL (Human-in-the-loop)
    HITL_PROMPT = "hitl_prompt"
    HITL_DECISION = "hitl_decision"

    # System events
    ERROR = "error"
    TOKEN_USAGE = "token_usage"
    SESSION_END = "session_end"


@dataclass
class ExecutionEvent:
    """Base execution event.

    All execution events inherit from this class and provide
    a to_dict() method for WebSocket serialization.
    """

    type: EventType
    data: dict[str, Any]
    timestamp: float = field(default_factory=lambda: __import__("time").time())

    def to_dict(self) -> dict[str, Any]:
        """Convert event to dictionary for WebSocket transmission.

        Returns:
            Dictionary with type, data, and timestamp fields.
        """
        return {
            "type": self.type.value,
            "data": self.data,
            "timestamp": self.timestamp,
        }


# ============================================================================
# Concrete event types
# ============================================================================


@dataclass
class ThinkingStartEvent(ExecutionEvent):
    """Agent started thinking."""

    type: EventType = field(init=False, default=EventType.THINKING_START)
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class ThinkingStopEvent(ExecutionEvent):
    """Agent stopped thinking."""

    type: EventType = field(init=False, default=EventType.THINKING_STOP)
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentMessageEvent(ExecutionEvent):
    """Agent text message.

    Attributes:
        content: The message content.
        done: Whether the message stream is complete.
    """

    type: EventType = field(init=False, default=EventType.AGENT_MESSAGE)
    data: dict[str, Any] = field(
        default_factory=lambda: {"content": "", "done": False}
    )


@dataclass
class ToolStartEvent(ExecutionEvent):
    """Tool execution started.

    Attributes:
        name: The tool name.
        id: The tool call ID.
        args: The tool arguments.
    """

    type: EventType = field(init=False, default=EventType.TOOL_START)
    data: dict[str, Any] = field(
        default_factory=lambda: {"name": "", "id": "", "args": {}}
    )


@dataclass
class ToolCompleteEvent(ExecutionEvent):
    """Tool execution completed.

    Attributes:
        name: The tool name.
        id: The tool call ID.
        result: The execution result.
        duration: Execution duration in seconds.
    """

    type: EventType = field(init=False, default=EventType.TOOL_COMPLETE)
    data: dict[str, Any] = field(
        default_factory=lambda: {"name": "", "id": "", "result": "", "duration": 0.0}
    )


@dataclass
class FileDiffEvent(ExecutionEvent):
    """File difference.

    Attributes:
        path: The file path.
        diff: List of diff blocks.
        operation: The operation type (read/write/edit).
    """

    type: EventType = field(init=False, default=EventType.FILE_DIFF)
    data: dict[str, Any] = field(
        default_factory=lambda: {"path": "", "diff": [], "operation": ""}
    )


@dataclass
class TodoUpdateEvent(ExecutionEvent):
    """Todo list update.

    Attributes:
        todos: List of todo items.
        status: Current status (pending/in_progress/completed).
    """

    type: EventType = field(init=False, default=EventType.TODO_UPDATE)
    data: dict[str, Any] = field(default_factory=lambda: {"todos": [], "status": ""})


@dataclass
class HITLPromptEvent(ExecutionEvent):
    """Request human-in-the-loop approval.

    Attributes:
        tool_name: The tool name.
        tool_args: The tool arguments.
        preview: Operation preview (diff, file content, etc.).
        can_edit: Whether parameter editing is allowed.
        timeout: Timeout in seconds.
    """

    type: EventType = field(init=False, default=EventType.HITL_PROMPT)
    data: dict[str, Any] = field(
        default_factory=lambda: {
            "tool_name": "",
            "tool_args": {},
            "preview": "",
            "can_edit": True,
            "timeout": 60,
        }
    )


@dataclass
class HITLDecisionEvent(ExecutionEvent):
    """Human-in-the-loop decision.

    Attributes:
        decision: The decision (approve/reject/edit).
        edited_args: Edited parameters (if decision is edit).
    """

    type: EventType = field(init=False, default=EventType.HITL_DECISION)
    data: dict[str, Any] = field(
        default_factory=lambda: {"decision": "", "edited_args": None}
    )


@dataclass
class TokenUsageEvent(ExecutionEvent):
    """Token usage statistics.

    Attributes:
        input_tokens: Number of input tokens.
        output_tokens: Number of output tokens.
        total_tokens: Total tokens used.
        model: The model name.
    """

    type: EventType = field(init=False, default=EventType.TOKEN_USAGE)
    data: dict[str, Any] = field(
        default_factory=lambda: {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "model": "",
        }
    )


# Alias for backward compatibility
TicketUsageEvent = TokenUsageEvent


@dataclass
class ErrorEvent(ExecutionEvent):
    """Error event.

    Attributes:
        message: The error message.
        type: The error type.
        traceback: The stack traceback (optional).
    """

    type: EventType = field(init=False, default=EventType.ERROR)
    data: dict[str, Any] = field(
        default_factory=lambda: {"message": "", "type": "", "traceback": ""}
    )


# ============================================================================
# Decision dataclass (separate from events)
# ============================================================================


@dataclass
class Decision:
    """HITL decision.

    Attributes:
        action: The decision action (approve/reject/edit).
        edited_args: Edited arguments (if action is edit).
    """

    action: Literal["approve", "reject", "edit"]
    edited_args: Optional[dict[str, Any]] = None

    def __post_init__(self) -> None:
        """Validate decision action."""
        valid_actions = {"approve", "reject", "edit"}
        if self.action not in valid_actions:
            raise ValueError(f"Invalid action: {self.action}. Must be one of {valid_actions}")
