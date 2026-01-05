"""Unit tests for the handler protocol."""

import asyncio
import pytest

from deepagents_cli.core.events import (
    Decision,
    ErrorEvent,
    EventType,
    HITLPromptEvent,
)
from deepagents_cli.core.handlers import ExecutionHandler


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
        assert decision.edited_args is None

    def test_decision_edit(self) -> None:
        """Should create an edit decision with edited args."""
        decision = Decision(action="edit", edited_args={"path": "/new.txt"})
        assert decision.action == "edit"
        assert decision.edited_args == {"path": "/new.txt"}

    def test_decision_invalid_action(self) -> None:
        """Should raise error for invalid action."""
        with pytest.raises(ValueError):
            Decision(action="invalid")  # type: ignore


class TestExecutionHandler:
    """Tests for ExecutionHandler abstract base class."""

    def test_execution_handler_is_abstract(self) -> None:
        """ExecutionHandler should not be directly instantiable."""
        with pytest.raises(TypeError):
            ExecutionHandler()  # type: ignore

    def test_execution_handler_required_methods(self) -> None:
        """ExecutionHandler should require all abstract methods to be implemented."""

        # Missing on_event
        with pytest.raises(TypeError):

            class IncompleteHandler1(ExecutionHandler):
                async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                    return Decision(action="approve")

                async def on_start(self) -> None:
                    pass

                async def on_complete(self) -> None:
                    pass

                async def on_error(self, error: ErrorEvent) -> None:
                    pass

            IncompleteHandler1()

        # Missing on_hitl_prompt
        with pytest.raises(TypeError):

            class IncompleteHandler2(ExecutionHandler):
                async def on_event(self, event) -> None:
                    pass

                async def on_start(self) -> None:
                    pass

                async def on_complete(self) -> None:
                    pass

                async def on_error(self, error: ErrorEvent) -> None:
                    pass

            IncompleteHandler2()

        # Missing on_start
        with pytest.raises(TypeError):

            class IncompleteHandler3(ExecutionHandler):
                async def on_event(self, event) -> None:
                    pass

                async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                    return Decision(action="approve")

                async def on_complete(self) -> None:
                    pass

                async def on_error(self, error: ErrorEvent) -> None:
                    pass

            IncompleteHandler3()

        # Missing on_complete
        with pytest.raises(TypeError):

            class IncompleteHandler4(ExecutionHandler):
                async def on_event(self, event) -> None:
                    pass

                async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                    return Decision(action="approve")

                async def on_start(self) -> None:
                    pass

                async def on_error(self, error: ErrorEvent) -> None:
                    pass

            IncompleteHandler4()

        # Missing on_error
        with pytest.raises(TypeError):

            class IncompleteHandler5(ExecutionHandler):
                async def on_event(self, event) -> None:
                    pass

                async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                    return Decision(action="approve")

                async def on_start(self) -> None:
                    pass

                async def on_complete(self) -> None:
                    pass

            IncompleteHandler5()

    def test_complete_handler_is_instantiable(self) -> None:
        """A complete handler implementation should be instantiable."""

        class MockEventHandler(ExecutionHandler):
            def __init__(self) -> None:
                self.events_received: list = []

            async def on_event(self, event) -> None:
                self.events_received.append(event)

            async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                return Decision(action="approve")

            async def on_start(self) -> None:
                self.events_received.append("started")

            async def on_complete(self) -> None:
                self.events_received.append("completed")

            async def on_error(self, error: ErrorEvent) -> None:
                self.events_received.append(error)

        handler = MockEventHandler()
        assert isinstance(handler, ExecutionHandler)
        assert handler.events_received == []

    @pytest.mark.asyncio
    async def test_mock_handler_on_event(self) -> None:
        """Mock handler should receive events through on_event."""

        class MockEventHandler(ExecutionHandler):
            def __init__(self) -> None:
                self.events_received: list = []

            async def on_event(self, event) -> None:
                self.events_received.append(event)

            async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                return Decision(action="approve")

            async def on_start(self) -> None:
                pass

            async def on_complete(self) -> None:
                pass

            async def on_error(self, error: ErrorEvent) -> None:
                pass

        handler = MockEventHandler()
        event = ErrorEvent(data={"message": "test error"})
        await handler.on_event(event)

        assert len(handler.events_received) == 1
        assert handler.events_received[0] == event

    @pytest.mark.asyncio
    async def test_mock_handler_on_hitl_prompt(self) -> None:
        """Mock handler should return a decision for HITL prompts."""

        class MockEventHandler(ExecutionHandler):
            def __init__(self) -> None:
                self.decision = Decision(action="approve")

            async def on_event(self, event) -> None:
                pass

            async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                return self.decision

            async def on_start(self) -> None:
                pass

            async def on_complete(self) -> None:
                pass

            async def on_error(self, error: ErrorEvent) -> None:
                pass

        handler = MockEventHandler()
        prompt = HITLPromptEvent(
            data={
                "tool_name": "write_file",
                "tool_args": {"path": "/test.txt"},
                "preview": "Test preview",
            }
        )

        decision = await handler.on_hitl_prompt(prompt)
        assert decision.action == "approve"

    @pytest.mark.asyncio
    async def test_mock_handler_on_start(self) -> None:
        """Mock handler should handle start event."""

        class MockEventHandler(ExecutionHandler):
            def __init__(self) -> None:
                self.started = False

            async def on_event(self, event) -> None:
                pass

            async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                return Decision(action="approve")

            async def on_start(self) -> None:
                self.started = True

            async def on_complete(self) -> None:
                pass

            async def on_error(self, error: ErrorEvent) -> None:
                pass

        handler = MockEventHandler()
        await handler.on_start()
        assert handler.started is True

    @pytest.mark.asyncio
    async def test_mock_handler_on_complete(self) -> None:
        """Mock handler should handle complete event."""

        class MockEventHandler(ExecutionHandler):
            def __init__(self) -> None:
                self.completed = False

            async def on_event(self, event) -> None:
                pass

            async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                return Decision(action="approve")

            async def on_start(self) -> None:
                pass

            async def on_complete(self) -> None:
                self.completed = True

            async def on_error(self, error: ErrorEvent) -> None:
                pass

        handler = MockEventHandler()
        await handler.on_complete()
        assert handler.completed is True

    @pytest.mark.asyncio
    async def test_mock_handler_on_error(self) -> None:
        """Mock handler should handle error event."""

        class MockEventHandler(ExecutionHandler):
            def __init__(self) -> None:
                self.errors_received: list = []

            async def on_event(self, event) -> None:
                pass

            async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> Decision:
                return Decision(action="approve")

            async def on_start(self) -> None:
                pass

            async def on_complete(self) -> None:
                pass

            async def on_error(self, error: ErrorEvent) -> None:
                self.errors_received.append(error)

        handler = MockEventHandler()
        error = ErrorEvent(data={"message": "test error"})
        await handler.on_error(error)

        assert len(handler.errors_received) == 1
        assert handler.errors_received[0] == error
