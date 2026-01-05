"""Unit tests for the event system."""

import pytest

from deepagents_cli.core.events import (
    AgentMessageEvent,
    Decision,
    ErrorEvent,
    EventType,
    ExecutionEvent,
    FileDiffEvent,
    HITLDecisionEvent,
    HITLPromptEvent,
    ThinkingStartEvent,
    ThinkingStopEvent,
    TicketUsageEvent,
    ToolCompleteEvent,
    ToolStartEvent,
    TodoUpdateEvent,
)


class TestEventType:
    """Tests for EventType enum."""

    def test_event_type_enum_exists(self) -> None:
        """EventType enum should be defined."""
        assert EventType.THINKING_START.value == "thinking_start"
        assert EventType.THINKING_STOP.value == "thinking_stop"
        assert EventType.AGENT_MESSAGE.value == "agent_message"
        assert EventType.TOOL_START.value == "tool_start"
        assert EventType.TOOL_COMPLETE.value == "tool_complete"
        assert EventType.TOOL_ERROR.value == "tool_error"
        assert EventType.FILE_READ.value == "file_read"
        assert EventType.FILE_WRITE.value == "file_write"
        assert EventType.FILE_EDIT.value == "file_edit"
        assert EventType.FILE_DIFF.value == "file_diff"
        assert EventType.TODO_UPDATE.value == "todo_update"
        assert EventType.HITL_PROMPT.value == "hitl_prompt"
        assert EventType.HITL_DECISION.value == "hitl_decision"
        assert EventType.ERROR.value == "error"
        assert EventType.TOKEN_USAGE.value == "token_usage"
        assert EventType.SESSION_END.value == "session_end"


class TestExecutionEvent:
    """Tests for ExecutionEvent base class."""

    def test_execution_event_creation(self) -> None:
        """Should create an event with type, data, and timestamp."""
        event = ExecutionEvent(
            type=EventType.THINKING_START,
            data={"key": "value"},
        )
        assert event.type == EventType.THINKING_START
        assert event.data == {"key": "value"}
        assert event.timestamp > 0

    def test_execution_event_to_dict(self) -> None:
        """Should convert event to dictionary for WebSocket."""
        event = ExecutionEvent(
            type=EventType.TOOL_START,
            data={"name": "test_tool", "id": "123"},
        )
        result = event.to_dict()
        assert result == {
            "type": "tool_start",
            "data": {"name": "test_tool", "id": "123"},
            "timestamp": event.timestamp,
        }

    def test_execution_event_default_timestamp(self) -> None:
        """Should use current time as default timestamp."""
        import time

        before = time.time()
        event = ExecutionEvent(
            type=EventType.AGENT_MESSAGE,
            data={},
        )
        after = time.time()
        assert before <= event.timestamp <= after


class TestThinkingStartEvent:
    """Tests for ThinkingStartEvent."""

    def test_thinking_start_event_creation(self) -> None:
        """Should create a thinking start event."""
        event = ThinkingStartEvent()
        assert event.type == EventType.THINKING_START
        assert event.data == {}


class TestThinkingStopEvent:
    """Tests for ThinkingStopEvent."""

    def test_thinking_stop_event_creation(self) -> None:
        """Should create a thinking stop event."""
        event = ThinkingStopEvent()
        assert event.type == EventType.THINKING_STOP
        assert event.data == {}


class TestAgentMessageEvent:
    """Tests for AgentMessageEvent."""

    def test_agent_message_event_creation(self) -> None:
        """Should create an agent message event."""
        event = AgentMessageEvent(
            data={"content": "Hello", "done": True},
        )
        assert event.type == EventType.AGENT_MESSAGE
        assert event.data["content"] == "Hello"
        assert event.data["done"] is True

    def test_agent_message_event_default_data(self) -> None:
        """Should have default values for content and done."""
        event = AgentMessageEvent()
        assert event.data["content"] == ""
        assert event.data["done"] is False


class TestToolStartEvent:
    """Tests for ToolStartEvent."""

    def test_tool_start_event_creation(self) -> None:
        """Should create a tool start event."""
        event = ToolStartEvent(
            data={"name": "write_file", "id": "456", "args": {"path": "/test.txt"}},
        )
        assert event.type == EventType.TOOL_START
        assert event.data["name"] == "write_file"
        assert event.data["id"] == "456"
        assert event.data["args"] == {"path": "/test.txt"}

    def test_tool_start_event_default_data(self) -> None:
        """Should have default values for name, id, and args."""
        event = ToolStartEvent()
        assert event.data["name"] == ""
        assert event.data["id"] == ""
        assert event.data["args"] == {}


class TestToolCompleteEvent:
    """Tests for ToolCompleteEvent."""

    def test_tool_complete_event_creation(self) -> None:
        """Should create a tool complete event."""
        event = ToolCompleteEvent(
            data={"name": "write_file", "id": "456", "result": "Success", "duration": 0.5},
        )
        assert event.type == EventType.TOOL_COMPLETE
        assert event.data["name"] == "write_file"
        assert event.data["id"] == "456"
        assert event.data["result"] == "Success"
        assert event.data["duration"] == 0.5

    def test_tool_complete_event_default_data(self) -> None:
        """Should have default values for all fields."""
        event = ToolCompleteEvent()
        assert event.data["name"] == ""
        assert event.data["id"] == ""
        assert event.data["result"] == ""
        assert event.data["duration"] == 0.0


class TestFileDiffEvent:
    """Tests for FileDiffEvent."""

    def test_file_diff_event_creation(self) -> None:
        """Should create a file diff event."""
        diff = [{"line": 1, "type": "add", "content": "new line"}]
        event = FileDiffEvent(
            data={"path": "/test.py", "diff": diff, "operation": "edit"},
        )
        assert event.type == EventType.FILE_DIFF
        assert event.data["path"] == "/test.py"
        assert event.data["diff"] == diff
        assert event.data["operation"] == "edit"

    def test_file_diff_event_default_data(self) -> None:
        """Should have default values for all fields."""
        event = FileDiffEvent()
        assert event.data["path"] == ""
        assert event.data["diff"] == []
        assert event.data["operation"] == ""


class TestTodoUpdateEvent:
    """Tests for TodoUpdateEvent."""

    def test_todo_update_event_creation(self) -> None:
        """Should create a todo update event."""
        todos = [{"task": "Write tests", "status": "pending"}]
        event = TodoUpdateEvent(
            data={"todos": todos, "status": "in_progress"},
        )
        assert event.type == EventType.TODO_UPDATE
        assert event.data["todos"] == todos
        assert event.data["status"] == "in_progress"

    def test_todo_update_event_default_data(self) -> None:
        """Should have default values for todos and status."""
        event = TodoUpdateEvent()
        assert event.data["todos"] == []
        assert event.data["status"] == ""


class TestHITLPromptEvent:
    """Tests for HITLPromptEvent."""

    def test_hitl_prompt_event_creation(self) -> None:
        """Should create a HITL prompt event."""
        event = HITLPromptEvent(
            data={
                "tool_name": "write_file",
                "tool_args": {"path": "/test.txt"},
                "preview": "This will write to /test.txt",
                "can_edit": True,
                "timeout": 60,
            },
        )
        assert event.type == EventType.HITL_PROMPT
        assert event.data["tool_name"] == "write_file"
        assert event.data["tool_args"] == {"path": "/test.txt"}
        assert event.data["preview"] == "This will write to /test.txt"
        assert event.data["can_edit"] is True
        assert event.data["timeout"] == 60

    def test_hitl_prompt_event_default_data(self) -> None:
        """Should have default values for all fields."""
        event = HITLPromptEvent()
        assert event.data["tool_name"] == ""
        assert event.data["tool_args"] == {}
        assert event.data["preview"] == ""
        assert event.data["can_edit"] is True
        assert event.data["timeout"] == 60


class TestHITLDecisionEvent:
    """Tests for HITLDecisionEvent."""

    def test_hitl_decision_event_creation(self) -> None:
        """Should create a HITL decision event."""
        event = HITLDecisionEvent(
            data={"decision": "approve", "edited_args": None},
        )
        assert event.type == EventType.HITL_DECISION
        assert event.data["decision"] == "approve"
        assert event.data["edited_args"] is None

    def test_hitl_decision_event_with_edit(self) -> None:
        """Should create a HITL decision event with edited args."""
        event = HITLDecisionEvent(
            data={"decision": "edit", "edited_args": {"path": "/edited.txt"}},
        )
        assert event.data["decision"] == "edit"
        assert event.data["edited_args"] == {"path": "/edited.txt"}

    def test_hitl_decision_event_default_data(self) -> None:
        """Should have default values for decision and edited_args."""
        event = HITLDecisionEvent()
        assert event.data["decision"] == ""
        assert event.data["edited_args"] is None


class TestTicketUsageEvent:
    """Tests for TicketUsageEvent (TokenUsageEvent)."""

    def test_token_usage_event_creation(self) -> None:
        """Should create a token usage event."""
        event = TicketUsageEvent(
            data={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150, "model": "gpt-4"},
        )
        assert event.type == EventType.TOKEN_USAGE
        assert event.data["input_tokens"] == 100
        assert event.data["output_tokens"] == 50
        assert event.data["total_tokens"] == 150
        assert event.data["model"] == "gpt-4"

    def test_token_usage_event_default_data(self) -> None:
        """Should have default values for all fields."""
        event = TicketUsageEvent()
        assert event.data["input_tokens"] == 0
        assert event.data["output_tokens"] == 0
        assert event.data["total_tokens"] == 0
        assert event.data["model"] == ""


class TestErrorEvent:
    """Tests for ErrorEvent."""

    def test_error_event_creation(self) -> None:
        """Should create an error event."""
        event = ErrorEvent(
            data={"message": "Something went wrong", "type": "ValueError", "traceback": "..."},
        )
        assert event.type == EventType.ERROR
        assert event.data["message"] == "Something went wrong"
        assert event.data["type"] == "ValueError"
        assert event.data["traceback"] == "..."

    def test_error_event_default_data(self) -> None:
        """Should have default values for all fields."""
        event = ErrorEvent()
        assert event.data["message"] == ""
        assert event.data["type"] == ""
        assert event.data["traceback"] == ""


class TestDecision:
    """Tests for Decision dataclass."""

    def test_decision_approve(self) -> None:
        """Should create an approve decision."""
        decision = Decision(action="approve")
        assert decision.action == "approve"
        assert decision.edited_args is None

    def test_decision_reject(self) -> None:
        """Should create a reject decision."""
        decision = Decision(action="reject")
        assert decision.action == "reject"

    def test_decision_edit(self) -> None:
        """Should create an edit decision with edited args."""
        decision = Decision(action="edit", edited_args={"path": "/new.txt"})
        assert decision.action == "edit"
        assert decision.edited_args == {"path": "/new.txt"}
