"""Unit tests for the async backend wrapper."""

import asyncio
import pytest
from typing import Any

from deepagents.backends.protocol import (
    EditResult,
    FileInfo,
    GrepMatch,
    WriteResult,
)
from deepagents_cli.core.async_backend import AsyncBackendWrapper


class SimpleMockBackend:
    """Simple mock backend implementing a subset of BackendProtocol."""

    def __init__(self) -> None:
        self.files: dict[str, str] = {}
        self.calls: list[str] = []

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> str:
        self.calls.append(f"read({file_path}, offset={offset}, limit={limit})")
        content = self.files.get(file_path, "")
        lines = content.split("\n")
        selected = lines[offset : offset + limit]
        return "\n".join(f"{i + offset + 1}: {line}" for i, line in enumerate(selected))

    def write(self, file_path: str, content: str) -> WriteResult:
        self.calls.append(f"write({file_path})")
        self.files[file_path] = content
        return WriteResult(path=file_path, error=None, files_update=None)

    def edit(self, file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> EditResult:
        self.calls.append(f"edit({file_path})")
        if file_path not in self.files:
            return EditResult(error="File not found", path=None, files_update=None, occurrences=None)

        content = self.files[file_path]
        if old_string not in content:
            return EditResult(error="String not found", path=None, files_update=None, occurrences=None)

        occurrences = content.count(old_string) if not replace_all else 1
        self.files[file_path] = content.replace(old_string, new_string, -1 if replace_all else 1)
        return EditResult(path=file_path, error=None, files_update=None, occurrences=occurrences)

    def ls_info(self, path: str) -> list[FileInfo]:
        self.calls.append(f"ls_info({path})")
        return [FileInfo(path=p, is_dir=False, size=len(c)) for p, c in self.files.items()]

    def glob_info(self, pattern: str, path: str = "/") -> list[FileInfo]:
        self.calls.append(f"glob_info({pattern}, path={path})")
        import fnmatch

        return [
            FileInfo(path=p, is_dir=False, size=len(c))
            for p, c in self.files.items()
            if fnmatch.fnmatch(p, pattern) or fnmatch.fnmatch(p.lstrip("/"), pattern)
        ]

    def grep_raw(self, pattern: str, path: str | None = None, glob: str | None = None) -> list[GrepMatch] | str:
        self.calls.append(f"grep_raw({pattern}, path={path}, glob={glob})")
        results: list[GrepMatch] = []
        for file_path, content in self.files.items():
            for line_num, line in enumerate(content.split("\n"), 1):
                if pattern in line:
                    results.append(GrepMatch(path=file_path, line=line_num, text=line))
        return results


class AsyncMockBackend(SimpleMockBackend):
    """Mock backend with async methods already implemented."""

    async def aread(self, file_path: str, offset: int = 0, limit: int = 2000) -> str:
        self.calls.append(f"aread({file_path}, offset={offset}, limit={limit})")
        # Simulate async delay
        await asyncio.sleep(0.001)
        return await asyncio.to_thread(self.read, file_path, offset, limit)

    async def awrite(self, file_path: str, content: str) -> WriteResult:
        self.calls.append(f"awrite({file_path})")
        await asyncio.sleep(0.001)
        return await asyncio.to_thread(self.write, file_path, content)

    async def aedit(self, file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> EditResult:
        self.calls.append(f"aedit({file_path})")
        await asyncio.sleep(0.001)
        return await asyncio.to_thread(self.edit, file_path, old_string, new_string, replace_all)

    async def als_info(self, path: str) -> list[FileInfo]:
        self.calls.append(f"als_info({path})")
        await asyncio.sleep(0.001)
        return await asyncio.to_thread(self.ls_info, path)

    async def aglob_info(self, pattern: str, path: str = "/") -> list[FileInfo]:
        self.calls.append(f"aglob_info({pattern}, path={path})")
        await asyncio.sleep(0.001)
        return await asyncio.to_thread(self.glob_info, pattern, path)

    async def agrep_raw(self, pattern: str, path: str | None = None, glob: str | None = None) -> list[GrepMatch] | str:
        self.calls.append(f"agrep_raw({pattern}, path={path}, glob={glob})")
        await asyncio.sleep(0.001)
        return await asyncio.to_thread(self.grep_raw, pattern, path, glob)


class TestAsyncBackendWrapper:
    """Tests for AsyncBackendWrapper with sync backend."""

    @pytest.fixture
    def sync_backend(self) -> SimpleMockBackend:
        """Create a sync mock backend."""
        return SimpleMockBackend()

    @pytest.fixture
    def async_backend(self, sync_backend: SimpleMockBackend) -> AsyncBackendWrapper:
        """Create an async backend wrapper."""
        return AsyncBackendWrapper(sync_backend)

    @pytest.mark.asyncio
    async def test_async_backend_aread(self, async_backend: AsyncBackendWrapper, sync_backend: SimpleMockBackend) -> None:
        """Should asynchronously read a file."""
        sync_backend.write("/test.txt", "Hello\nWorld\nPython")
        sync_backend.calls.clear()  # Clear write call

        content = await async_backend.aread("/test.txt")

        assert "Hello" in content
        assert "1:" in content  # Line numbers
        assert "read(/test.txt" in sync_backend.calls[0]

    @pytest.mark.asyncio
    async def test_async_backend_awrite(self, async_backend: AsyncBackendWrapper, sync_backend: SimpleMockBackend) -> None:
        """Should asynchronously write a file."""
        result = await async_backend.awrite("/test.txt", "Hello, World!")

        assert result.path == "/test.txt"
        assert result.error is None
        assert sync_backend.files["/test.txt"] == "Hello, World!"
        assert "write(/test.txt)" in sync_backend.calls[0]

    @pytest.mark.asyncio
    async def test_async_backend_aedit(self, async_backend: AsyncBackendWrapper, sync_backend: SimpleMockBackend) -> None:
        """Should asynchronously edit a file."""
        sync_backend.write("/test.txt", "Hello, World!")
        sync_backend.calls.clear()

        result = await async_backend.aedit("/test.txt", "World", "Python")

        assert result.path == "/test.txt"
        assert result.error is None
        assert sync_backend.files["/test.txt"] == "Hello, Python!"
        assert "edit(/test.txt)" in sync_backend.calls[0]

    @pytest.mark.asyncio
    async def test_async_backend_als_info(self, async_backend: AsyncBackendWrapper, sync_backend: SimpleMockBackend) -> None:
        """Should asynchronously list directory."""
        sync_backend.write("/file1.txt", "content1")
        sync_backend.write("/file2.txt", "content2")
        sync_backend.calls.clear()

        result = await async_backend.als_info("/")

        assert len(result) == 2
        assert result[0]["path"] == "/file1.txt"
        assert result[1]["path"] == "/file2.txt"
        assert "ls_info(/)" in sync_backend.calls[0]

    @pytest.mark.asyncio
    async def test_async_backend_aglob_info(self, async_backend: AsyncBackendWrapper, sync_backend: SimpleMockBackend) -> None:
        """Should asynchronously glob files."""
        sync_backend.write("/test/file1.txt", "content1")
        sync_backend.write("/test/file2.py", "content2")
        sync_backend.write("/other/file3.txt", "content3")
        sync_backend.calls.clear()

        result = await async_backend.aglob_info("*.txt")

        assert len(result) >= 2
        paths = [r["path"] for r in result]
        assert "/test/file1.txt" in paths
        assert "/other/file3.txt" in paths
        assert "glob_info(*.txt" in sync_backend.calls[0]

    @pytest.mark.asyncio
    async def test_async_backend_agrep_raw(self, async_backend: AsyncBackendWrapper, sync_backend: SimpleMockBackend) -> None:
        """Should asynchronously grep files."""
        sync_backend.write("/file1.txt", "Hello, World!")
        sync_backend.write("/file2.txt", "Python is great")
        sync_backend.write("/file3.txt", "Goodbye")
        sync_backend.calls.clear()

        result = await async_backend.agrep_raw("Python")

        assert isinstance(result, list)
        assert len(result) >= 1
        assert result[0]["path"] == "/file2.txt"
        assert "grep_raw(Python" in sync_backend.calls[0]

    @pytest.mark.asyncio
    async def test_async_backend_does_not_block_event_loop(self, async_backend: AsyncBackendWrapper) -> None:
        """Should not block the event loop during blocking operations."""
        async def slow_operation(backend: AsyncBackendWrapper, value: int) -> int:
            await backend.awrite(f"/file{value}.txt", "content")
            return value

        start = asyncio.get_event_loop().time()
        # Run multiple operations concurrently
        results = await asyncio.gather(
            slow_operation(async_backend, 1),
            slow_operation(async_backend, 2),
            slow_operation(async_backend, 3),
        )
        duration = asyncio.get_event_loop().time() - start

        assert sorted(results) == [1, 2, 3]
        # With async wrapping, operations should run concurrently
        assert duration < 1.0  # Should complete quickly

    @pytest.mark.asyncio
    async def test_async_backend_with_empty_backend(self, sync_backend: SimpleMockBackend) -> None:
        """Should handle operations on empty backend gracefully."""
        async_backend = AsyncBackendWrapper(sync_backend)

        content = await async_backend.aread("/nonexistent.txt")
        # Empty file returns line number with no content
        assert content == "" or content == "1: "

        files = await async_backend.als_info("/")
        assert files == []

        matches = await async_backend.agrep_raw("pattern")
        assert matches == []

        results = await async_backend.aglob_info("*.txt")
        assert results == []


class TestAsyncBackendWrapperWithAsyncBackend:
    """Tests for AsyncBackendWrapper with backend that has async methods."""

    @pytest.fixture
    def async_native_backend(self) -> AsyncMockBackend:
        """Create an async-native mock backend."""
        return AsyncMockBackend()

    @pytest.fixture
    def wrapper(self, async_native_backend: AsyncMockBackend) -> AsyncBackendWrapper:
        """Create an async backend wrapper."""
        return AsyncBackendWrapper(async_native_backend)

    @pytest.mark.asyncio
    async def test_wrapper_uses_native_async_methods(self, wrapper: AsyncBackendWrapper, async_native_backend: AsyncMockBackend) -> None:
        """Should use native async methods if available."""
        await wrapper.awrite("/test.txt", "Hello")

        # Should use the native async method (first call should be awrite)
        assert "awrite" in async_native_backend.calls[0]

    @pytest.mark.asyncio
    async def test_wrapper_aread_uses_async(self, wrapper: AsyncBackendWrapper, async_native_backend: AsyncMockBackend) -> None:
        """Should use native aread if available."""
        async_native_backend.write("/test.txt", "Hello")
        async_native_backend.calls.clear()

        await wrapper.aread("/test.txt")

        assert any("aread" in call for call in async_native_backend.calls)

    @pytest.mark.asyncio
    async def test_wrapper_all_operations_use_async(self, wrapper: AsyncBackendWrapper, async_native_backend: AsyncMockBackend) -> None:
        """All wrapper operations should use native async methods."""
        async_native_backend.write("/file1.txt", "Hello World\nPython is great")
        async_native_backend.write("/file2.py", "code here")
        async_native_backend.calls.clear()

        await wrapper.awrite("/new.txt", "content")
        await wrapper.aread("/new.txt")
        await wrapper.aedit("/file1.txt", "World", "Universe")
        await wrapper.als_info("/")
        await wrapper.aglob_info("*.txt")
        await wrapper.agrep_raw("Python")

        # Check that async methods were used
        async_methods = [call for call in async_native_backend.calls if call.startswith("a")]
        assert len(async_methods) >= 6
