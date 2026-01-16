"""Workspace management for DeepAgents Desktop.

This module provides workspace configuration and management capabilities:
- Create, read, update, delete workspaces
- Manage workspace-specific skill configurations
- Provide workspace directory isolation for file operations
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

logger = logging.getLogger(__name__)

# Workspace configuration file path
WORKSPACES_CONFIG_PATH = Path.home() / ".deepagents" / "workspaces.json"
# Workspace base directory
WORKSPACES_BASE_DIR = Path.home() / ".deepagents" / "workspaces"

# Default workspace configuration
DEFAULT_WORKSPACE_ID = "default"
DEFAULT_WORKSPACE_NAME = "默认工作空间"
DEFAULT_WORKSPACE_CATEGORY = "通用"


@dataclass
class WorkspaceConfig:
    """Configuration for a single workspace.

    Attributes:
        id: Unique workspace identifier (used as directory name)
        name: Human-readable workspace name
        category: Workspace category for grouping
        enabled_skills: List of skill names enabled for this workspace
                         ["*"] means all skills enabled
        root_dir: Absolute path to workspace file directory (legacy, for backward compat)
        custom_path: User-specified custom path for workspace files (overrides root_dir)
        created_at: ISO timestamp of workspace creation
        icon: Icon name for UI display
        conversation_ids: List of conversation IDs belonging to this workspace
    """
    id: str
    name: str
    category: str = "通用"
    enabled_skills: list[str] = field(default_factory=lambda: ["*"])
    root_dir: str = ""
    custom_path: str = ""
    created_at: str = ""
    icon: str = "folder"
    conversation_ids: list[str] = field(default_factory=list)

    def __post_init__(self):
        """Initialize derived fields after creation."""
        if not self.root_dir and not self.custom_path:
            # Default: use workspaces/{id}/files/ for backward compatibility
            self.root_dir = str(WORKSPACES_BASE_DIR / self.id / "files")
        if not self.created_at:
            self.created_at = datetime.now().isoformat()

    def get_workspace_root(self) -> Path:
        """Get the actual workspace root directory path.

        Priority:
        1. custom_path (if set) - User-specified path
        2. root_dir - Configured path
        3. Default path - workspaces/{id}/files/

        Returns:
            Path to the workspace root directory
        """
        if self.custom_path:
            return Path(self.custom_path).expanduser()
        elif self.root_dir:
            return Path(self.root_dir).expanduser()
        else:
            return WORKSPACES_BASE_DIR / self.id / "files"

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WorkspaceConfig":
        """Create from dictionary."""
        return cls(**data)


class WorkspaceManager:
    """Manager for workspace configurations.

    Provides CRUD operations for workspaces with automatic
    configuration file persistence and default workspace creation.
    """

    def __init__(self, config_path: Path | None = None):
        """Initialize workspace manager.

        Args:
            config_path: Path to workspaces.json file. Defaults to
                        ~/.deepagents/workspaces.json
        """
        self.config_path = config_path or WORKSPACES_CONFIG_PATH
        self._config: dict[str, Any] | None = None

    def _load_config(self) -> dict[str, Any]:
        """Load workspace configuration from file.

        Creates default configuration if file doesn't exist.

        Returns:
            Configuration dictionary with version, default_workspace, and workspaces
        """
        if self._config is not None:
            return self._config

        if self.config_path.exists():
            try:
                content = self.config_path.read_text(encoding="utf-8")
                self._config = json.loads(content)
                logger.info(f"Loaded workspace config from {self.config_path}")
                return self._config
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"Failed to load workspace config: {e}, creating new")

        # Create default configuration
        self._config = {
            "version": "1.0",
            "default_workspace": DEFAULT_WORKSPACE_ID,
            "workspaces": {}
        }

        # Create default workspace
        default_workspace = WorkspaceConfig(
            id=DEFAULT_WORKSPACE_ID,
            name=DEFAULT_WORKSPACE_NAME,
            category=DEFAULT_WORKSPACE_CATEGORY
        )
        self._config["workspaces"][DEFAULT_WORKSPACE_ID] = default_workspace.to_dict()

        # Save and create directory
        self._save_config()
        self._ensure_workspace_directory(default_workspace)

        logger.info(f"Created default workspace configuration")
        return self._config

    def _save_config(self) -> None:
        """Save workspace configuration to file."""
        if self._config is None:
            return

        try:
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            self.config_path.write_text(
                json.dumps(self._config, indent=2, ensure_ascii=False),
                encoding="utf-8"
            )
            logger.debug(f"Saved workspace config to {self.config_path}")
        except OSError as e:
            logger.error(f"Failed to save workspace config: {e}")
            raise

    def _ensure_workspace_directory(self, workspace: WorkspaceConfig) -> Path:
        """Ensure workspace directory and subdirectories exist.

        Creates:
        - Workspace metadata directory (workspaces/{id}/)
        - skills/ subdirectory for workspace-specific skills
        - agent.md file for workspace-specific memory (if not exists)
        - files/ subdirectory for file operations

        Directory structure:
        workspaces/{id}/
        ├── agent.md          # Workspace memory
        ├── skills/           # Workspace-specific skills
        └── files/            # File operations directory

        Args:
            workspace: Workspace configuration

        Returns:
            Path to workspace metadata directory (workspaces/{id}/)
        """
        # Use the unified workspace directory (not the files subdirectory)
        from deepagents_cli.config import Settings
        workspace_meta_dir = Settings().get_workspace_dir_v2(workspace.id)
        workspace_meta_dir.mkdir(parents=True, exist_ok=True)

        # Create skills subdirectory for workspace-specific skills
        skills_dir = workspace_meta_dir / "skills"
        skills_dir.mkdir(parents=True, exist_ok=True)

        # Create workspace agent.md if it doesn't exist
        agent_md = workspace_meta_dir / "agent.md"
        if not agent_md.exists():
            # Try to copy from global default configuration
            from deepagents_cli.config import settings
            default_agent_md = settings.get_user_agent_md_path("desktop")
            if default_agent_md.exists():
                import shutil
                shutil.copy(default_agent_md, agent_md)
            else:
                # Create empty file with header
                agent_md.write_text("# 工作空间配置\n\n")
            logger.debug(f"Created workspace agent.md for {workspace.id}")

        # Ensure files directory exists (for file operations)
        workspace_file_dir = workspace.get_workspace_root()
        workspace_file_dir.mkdir(parents=True, exist_ok=True)

        return workspace_meta_dir

    def get_workspace(self, workspace_id: str) -> WorkspaceConfig | None:
        """Get workspace configuration by ID.

        Args:
            workspace_id: Workspace identifier

        Returns:
            Workspace configuration or None if not found
        """
        config = self._load_config()
        workspace_data = config.get("workspaces", {}).get(workspace_id)
        if workspace_data:
            return WorkspaceConfig.from_dict(workspace_data)
        return None

    def list_workspaces(self) -> list[WorkspaceConfig]:
        """List all workspaces.

        Returns:
            List of all workspace configurations
        """
        config = self._load_config()
        workspaces = []
        for workspace_data in config.get("workspaces", {}).values():
            workspaces.append(WorkspaceConfig.from_dict(workspace_data))
        return workspaces

    def get_default_workspace(self) -> WorkspaceConfig:
        """Get the default workspace.

        Returns:
            Default workspace configuration
        """
        config = self._load_config()
        default_id = config.get("default_workspace", DEFAULT_WORKSPACE_ID)
        workspace = self.get_workspace(default_id)
        if workspace is None:
            # Fallback to default
            workspace = WorkspaceConfig(
                id=DEFAULT_WORKSPACE_ID,
                name=DEFAULT_WORKSPACE_NAME
            )
            self.create_workspace(workspace)
        return workspace

    def create_workspace(
        self,
        workspace: WorkspaceConfig | None = None,
        *,
        id: str | None = None,
        name: str | None = None,
        category: str = "通用",
        enabled_skills: list[str] | None = None,
        icon: str = "folder"
    ) -> WorkspaceConfig:
        """Create a new workspace.

        Args:
            workspace: Complete workspace configuration (overrides other params)
            id: Workspace identifier (must be unique)
            name: Human-readable name
            category: Category for grouping
            enabled_skills: List of enabled skill names (["*"] for all)
            icon: Icon name for UI

        Returns:
            Created workspace configuration

        Raises:
            ValueError: If workspace_id already exists or validation fails
        """
        # Build workspace from parameters
        if workspace is None:
            workspace_id = id or name or "workspace"
            # Sanitize workspace_id for filesystem use
            workspace_id = "".join(
                c if c.isalnum() or c in ("-", "_") else "_"
                for c in workspace_id
            ).lower()

            workspace = WorkspaceConfig(
                id=workspace_id,
                name=name or workspace_id,
                category=category,
                enabled_skills=enabled_skills or ["*"],
                icon=icon
            )

        # Load config and check for duplicates
        config = self._load_config()
        if workspace.id in config.get("workspaces", {}):
            raise ValueError(f"Workspace '{workspace.id}' already exists")

        # Add to configuration
        config["workspaces"][workspace.id] = workspace.to_dict()
        self._config = config
        self._save_config()

        # Create directory
        self._ensure_workspace_directory(workspace)

        logger.info(f"Created workspace: {workspace.id}")
        return workspace

    def update_workspace(
        self,
        workspace_id: str,
        *,
        name: str | None = None,
        category: str | None = None,
        enabled_skills: list[str] | None = None,
        icon: str | None = None,
        custom_path: str | None = None
    ) -> WorkspaceConfig | None:
        """Update workspace configuration.

        Args:
            workspace_id: Workspace identifier
            name: New name (optional)
            category: New category (optional)
            enabled_skills: New enabled skills list (optional)
            icon: New icon (optional)
            custom_path: New custom path (optional)

        Returns:
            Updated workspace configuration or None if not found
        """
        workspace = self.get_workspace(workspace_id)
        if workspace is None:
            return None

        if name is not None:
            workspace.name = name
        if category is not None:
            workspace.category = category
        if enabled_skills is not None:
            workspace.enabled_skills = enabled_skills
        if icon is not None:
            workspace.icon = icon
        if custom_path is not None:
            workspace.custom_path = custom_path
            # Re-create directory structure if path changed
            self._ensure_workspace_directory(workspace)

        # Update config
        config = self._load_config()
        config["workspaces"][workspace_id] = workspace.to_dict()
        self._config = config
        self._save_config()

        logger.info(f"Updated workspace: {workspace_id}")
        return workspace

    def save_workspace(self, workspace: WorkspaceConfig) -> None:
        """Save workspace configuration to file.

        Args:
            workspace: Workspace configuration to save
        """
        config = self._load_config()
        config["workspaces"][workspace.id] = workspace.to_dict()
        self._config = config
        self._save_config()
        logger.debug(f"Saved workspace: {workspace.id}")

    def delete_workspace(self, workspace_id: str) -> bool:
        """Delete a workspace.

        Note: This only removes the workspace configuration.
        The workspace directory and files are preserved on disk.

        Args:
            workspace_id: Workspace identifier

        Returns:
            True if deleted, False if not found

        Raises:
            ValueError: If trying to delete the default workspace
        """
        config = self._load_config()

        # Prevent deleting default workspace
        if workspace_id == DEFAULT_WORKSPACE_ID:
            raise ValueError("Cannot delete default workspace")

        if workspace_id not in config.get("workspaces", {}):
            return False

        # Remove from config
        del config["workspaces"][workspace_id]

        # Update default if needed
        if config.get("default_workspace") == workspace_id:
            config["default_workspace"] = DEFAULT_WORKSPACE_ID

        self._config = config
        self._save_config()

        logger.info(f"Deleted workspace: {workspace_id}")
        return True

    def set_default_workspace(self, workspace_id: str) -> bool:
        """Set the default workspace.

        Args:
            workspace_id: Workspace identifier

        Returns:
            True if successful, False if workspace not found
        """
        config = self._load_config()
        if workspace_id not in config.get("workspaces", {}):
            return False

        config["default_workspace"] = workspace_id
        self._config = config
        self._save_config()

        logger.info(f"Set default workspace: {workspace_id}")
        return True

    def get_enabled_skills(
        self,
        workspace_id: str,
        all_available_skills: list[str]
    ) -> list[str]:
        """Get list of enabled skills for a workspace.

        Args:
            workspace_id: Workspace identifier
            all_available_skills: List of all available skill names

        Returns:
            List of enabled skill names
        """
        workspace = self.get_workspace(workspace_id)
        if workspace is None:
            return all_available_skills

        if "*" in workspace.enabled_skills:
            return all_available_skills

        # Filter to only enabled skills that actually exist
        return [
            skill for skill in workspace.enabled_skills
            if skill in all_available_skills
        ]


# Global workspace manager instance
_global_workspace_manager: WorkspaceManager | None = None


def get_workspace_manager() -> WorkspaceManager:
    """Get the global workspace manager instance.

    Returns:
        Shared WorkspaceManager instance
    """
    global _global_workspace_manager
    if _global_workspace_manager is None:
        _global_workspace_manager = WorkspaceManager()
    return _global_workspace_manager
