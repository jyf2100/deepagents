"""Unit tests for DesktopProtocol."""

import asyncio
import msgpack
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from deepagents_cli.desktop.protocol import DesktopProtocol


@pytest.fixture
def socket_path(tmp_path):
    """Create a test socket path."""
    return str(tmp_path / "test.sock")


@pytest.fixture
def protocol(socket_path):
    """Create a DesktopProtocol instance for testing."""
    return DesktopProtocol(socket_path, assistant_id="test-desktop")


def test_decode_message(protocol):
    """Test decoding MessagePack messages."""
    # Arrange
    request = {
        'request_id': 'test-001',
        'method': 'chat',
        'params': {'message': 'hello'}
    }
    encoded = msgpack.packb(request)

    # Act
    decoded = msgpack.unpackb(encoded)

    # Assert
    assert decoded == request
    assert decoded['method'] == 'chat'


def test_encode_response(protocol):
    """Test encoding responses."""
    # Arrange
    response = {
        'request_id': 'test-001',
        'status': 'success',
        'data': {'content': 'hi there'}
    }

    # Act
    encoded = msgpack.packb(response)

    # Assert
    assert isinstance(encoded, bytes)
    decoded = msgpack.unpackb(encoded)
    assert decoded['status'] == 'success'


@pytest.mark.asyncio
async def test_handle_ping_request(protocol):
    """Test ping request handling in test mode."""
    # Arrange - Set test mode
    with patch.dict(os.environ, {'DEEPAGENTS_TEST': '1'}):
        request = {
            'request_id': 'ping-001',
            'method': 'ping',
            'params': {}
        }

        # Act
        response = await protocol.handle_request(request)

        # Assert
        assert response['request_id'] == 'ping-001'
        assert response['status'] == 'success'
        assert response['data']['pong'] is True


@pytest.mark.asyncio
async def test_handle_unknown_method(protocol):
    """Test unknown method handling."""
    # Arrange - Set test mode
    with patch.dict(os.environ, {'DEEPAGENTS_TEST': '1'}):
        request = {
            'request_id': 'err-001',
            'method': 'unknown_method',
            'params': {}
        }

        # Act
        response = await protocol.handle_request(request)

        # Assert
        assert response['status'] == 'error'
        assert response['error']['code'] == 'UNKNOWN_METHOD'


@pytest.mark.asyncio
async def test_handle_chat_request_without_agent(protocol):
    """Test chat request when agent is not initialized."""
    # Arrange
    with patch.dict(os.environ, {'DEEPAGENTS_TEST': ''}):  # Normal mode
        protocol.agent = None
        request = {
            'request_id': 'chat-001',
            'method': 'chat',
            'params': {
                'message': 'hi',
                'stream': False
            }
        }

        # Act
        response = await protocol.handle_request(request)

        # Assert
        assert response['status'] == 'error'
        assert response['error']['code'] == 'AGENT_NOT_READY'
        assert response['request_id'] == 'chat-001'


@pytest.mark.asyncio
async def test_handle_chat_request_with_mock_agent(protocol):
    """Test chat request with a mocked agent."""
    # Arrange
    with patch.dict(os.environ, {'DEEPAGENTS_TEST': ''}):  # Normal mode
        protocol.agent = AsyncMock()
        protocol.agent.ainvoke.return_value = {
            'messages': [
                MagicMock(content='Hello! How can I help you?')
            ]
        }

        request = {
            'request_id': 'chat-001',
            'method': 'chat',
            'params': {
                'message': 'hi there',
                'stream': False
            }
        }

        # Act
        response = await protocol.handle_request(request)

        # Assert
        assert response['request_id'] == 'chat-001'
        assert response['status'] == 'success'
        assert 'data' in response
        assert 'Hello!' in response['data']['content']
        protocol.agent.ainvoke.assert_called_once()


@pytest.mark.asyncio
async def test_handle_stream_chat_request(protocol):
    """Test streaming chat request with a mocked agent."""
    # Arrange
    with patch.dict(os.environ, {'DEEPAGENTS_TEST': ''}):  # Normal mode
        async def mock_stream(messages):
            """Mock streaming response."""
            chunks = [
                {'messages': [MagicMock(content='Hello ')]},
                {'messages': [MagicMock(content='there!')]}
            ]
        for chunk in chunks:
            yield chunk

        protocol.agent = AsyncMock()
        protocol.agent.astream = mock_stream

        request = {
            'request_id': 'stream-001',
            'method': 'chat',
            'params': {
                'message': 'hi',
                'stream': True
            }
        }

        # Act
        response = await protocol.handle_request(request)

        # Assert
        assert response['request_id'] == 'stream-001'
        assert response['status'] == 'success'
        assert 'data' in response
        assert 'Hello there!' in response['data']['content']


def test_protocol_initialization(socket_path):
    """Test DesktopProtocol initialization."""
    # Act
    protocol = DesktopProtocol(socket_path, assistant_id="my-agent")

    # Assert
    assert protocol.socket_path == socket_path
    assert protocol.assistant_id == "my-agent"
    assert protocol.agent is None
    assert protocol.composite_backend is None
    assert protocol.running is False
