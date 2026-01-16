"""Conversation checkpointer factory for persistent session storage.

This module provides a factory for creating checkpointers
that persist conversation state across application restarts.
"""

from pathlib import Path

# Try to import SqliteSaver for persistent storage, fall back to MemorySaver
try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    SQLITE_AVAILABLE = True
except ImportError:
    from langgraph.checkpoint.memory import MemorySaver as SqliteSaver
    SQLITE_AVAILABLE = False

# Base directory for conversation databases
CONVERSATIONS_DB_DIR = Path.home() / ".deepagents" / "conversations"


class ConversationCheckpointerFactory:
    """Factory class for managing SQLite persistent checkpoint storage.

    Each conversation gets its own SQLite database file, allowing for:
    - Independent conversation state management
    - Easy conversation deletion
    - Persistent storage across application restarts
    """

    def __init__(self, base_path: Path = CONVERSATIONS_DB_DIR) -> None:
        """Initialize the checkpointer factory.

        Args:
            base_path: Base directory for storing conversation databases.
                       Defaults to ~/.deepagents/conversations/
        """
        self.base_path = base_path
        self.base_path.mkdir(parents=True, exist_ok=True)

    def get_checkpointer(self, conversation_id: str) -> SqliteSaver:
        """Get or create a checkpointer for the specified conversation.

        Args:
            conversation_id: Unique identifier for the conversation

        Returns:
            A checkpointer instance (SqliteSaver if available, otherwise MemorySaver)
        """
        if SQLITE_AVAILABLE:
            # Use persistent SQLite storage
            db_path = self.base_path / f"{conversation_id}.db"
            return SqliteSaver(str(db_path))
        else:
            # Fall back to in-memory storage
            # Note: MemorySaver doesn't use db_path, conversation state will not persist
            return SqliteSaver()

    def list_conversations(self) -> list[str]:
        """List all conversation IDs that have existing databases.

        Returns:
            List of conversation IDs (filenames without .db extension)
        """
        if not self.base_path.exists():
            return []
        return [f.stem for f in self.base_path.glob("*.db")]

    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete the database file for a specific conversation.

        Args:
            conversation_id: The conversation ID to delete

        Returns:
            True if the database was deleted, False if it didn't exist
        """
        db_path = self.base_path / f"{conversation_id}.db"
        if db_path.exists():
            db_path.unlink()
            return True
        return False

    def conversation_exists(self, conversation_id: str) -> bool:
        """Check if a conversation database exists.

        Args:
            conversation_id: The conversation ID to check

        Returns:
            True if the conversation database exists
        """
        db_path = self.base_path / f"{conversation_id}.db"
        return db_path.exists()


# Global singleton instance
_checkpointer_factory: ConversationCheckpointerFactory | None = None


def get_checkpointer_factory() -> ConversationCheckpointerFactory:
    """Get the global checkpointer factory instance.

    This ensures a single factory instance is used throughout the application,
    maintaining consistent base path configuration.

    Returns:
        The global ConversationCheckpointerFactory instance
    """
    global _checkpointer_factory
    if _checkpointer_factory is None:
        _checkpointer_factory = ConversationCheckpointerFactory()
    return _checkpointer_factory
