"""Async backend wrapper for deepagents-cli.

This module provides a wrapper that ensures all backend operations
are non-blocking by using asyncio.to_thread for synchronous methods.
"""

import asyncio
from typing import Any

from deepagents.backends.protocol import (
    EditResult,
    FileDownloadResponse,
    FileUploadResponse,
    GrepMatch,
    WriteResult,
)


class AsyncBackendWrapper:
    """Wrapper for BackendProtocol that ensures all operations are async.

    This wrapper provides async methods for all backend operations,
    using asyncio.to_thread to run synchronous operations without
    blocking the event loop.

    The actual BackendProtocol already provides async methods (aread, awrite, etc.),
    but this wrapper ensures a consistent async interface even when working
    with backends that may not fully implement async methods.

    Example:
        ```python
        backend = StateBackend(runtime)
        async_backend = AsyncBackendWrapper(backend)

        # All operations are async and non-blocking
        content = await async_backend.aread("/path/to/file.txt")
        await async_backend.awrite("/path/to/new.txt", "content")
        ```
    """

    def __init__(self, backend: Any) -> None:
        """Initialize the wrapper with a backend instance.

        Args:
            backend: A BackendProtocol instance.
        """
        self._backend = backend

    async def aread(
        self,
        file_path: str,
        offset: int = 0,
        limit: int = 2000,
    ) -> str:
        """Async read operation.

        Args:
            file_path: Path to the file to read.
            offset: Line number to start reading from.
            limit: Maximum number of lines to read.

        Returns:
            File content as string.
        """
        if hasattr(self._backend, "aread"):
            return await self._backend.aread(file_path, offset, limit)
        return await asyncio.to_thread(self._backend.read, file_path, offset, limit)

    async def awrite(
        self,
        file_path: str,
        content: str,
    ) -> WriteResult:
        """Async write operation.

        Args:
            file_path: Path to the file to write.
            content: Content to write.

        Returns:
            WriteResult with error info.
        """
        if hasattr(self._backend, "awrite"):
            return await self._backend.awrite(file_path, content)
        return await asyncio.to_thread(self._backend.write, file_path, content)

    async def aedit(
        self,
        file_path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        """Async edit operation.

        Args:
            file_path: Path to the file to edit.
            old_string: String to replace.
            new_string: Replacement string.
            replace_all: Whether to replace all occurrences.

        Returns:
            EditResult with error info.
        """
        if hasattr(self._backend, "aedit"):
            return await self._backend.aedit(file_path, old_string, new_string, replace_all)
        return await asyncio.to_thread(self._backend.edit, file_path, old_string, new_string, replace_all)

    async def als_info(self, path: str) -> list[dict[str, Any]]:
        """Async list directory operation.

        Args:
            path: Path to the directory to list.

        Returns:
            List of file info dicts.
        """
        if hasattr(self._backend, "als_info"):
            return await self._backend.als_info(path)
        return await asyncio.to_thread(self._backend.ls_info, path)

    async def aglob_info(self, pattern: str, path: str = "/") -> list[dict[str, Any]]:
        """Async glob operation.

        Args:
            pattern: Glob pattern.
            path: Base directory to search from.

        Returns:
            List of file info dicts.
        """
        if hasattr(self._backend, "aglob_info"):
            return await self._backend.aglob_info(pattern, path)
        return await asyncio.to_thread(self._backend.glob_info, pattern, path)

    async def agrep_raw(
        self,
        pattern: str,
        path: str | None = None,
        glob: str | None = None,
    ) -> list[GrepMatch] | str:
        """Async grep operation.

        Args:
            pattern: Literal pattern to search for.
            path: Optional directory path to search in.
            glob: Optional glob pattern to filter files.

        Returns:
            List of GrepMatch or error string.
        """
        if hasattr(self._backend, "agrep_raw"):
            return await self._backend.agrep_raw(pattern, path, glob)
        return await asyncio.to_thread(self._backend.grep_raw, pattern, path, glob)

    async def aupload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        """Async upload files operation.

        Args:
            files: List of (path, content) tuples.

        Returns:
            List of FileUploadResponse objects.
        """
        if hasattr(self._backend, "aupload_files"):
            return await self._backend.aupload_files(files)
        return await asyncio.to_thread(self._backend.upload_files, files)

    async def adownload_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        """Async download files operation.

        Args:
            paths: List of file paths to download.

        Returns:
            List of FileDownloadResponse objects.
        """
        if hasattr(self._backend, "adownload_files"):
            return await self._backend.adownload_files(paths)
        return await asyncio.to_thread(self._backend.download_files, paths)


__all__ = ["AsyncBackendWrapper"]
