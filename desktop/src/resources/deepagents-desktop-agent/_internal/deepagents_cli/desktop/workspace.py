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
        system_prompt: Custom system prompt for this workspace. If empty, uses default prompt.
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
    system_prompt: str = ""

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
        from deepagents_cli.config import settings
        workspace_meta_dir = settings.get_workspace_dir_v2(workspace.id)
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
        custom_path: str | None = None,
        system_prompt: str | None = None
    ) -> WorkspaceConfig | None:
        """Update workspace configuration.

        Args:
            workspace_id: Workspace identifier
            name: New name (optional)
            category: New category (optional)
            enabled_skills: New enabled skills list (optional)
            icon: New icon (optional)
            custom_path: New custom path (optional)
            system_prompt: New system prompt (optional)

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
        if system_prompt is not None:
            workspace.system_prompt = system_prompt

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


# ============================================================================
# Prompt Templates Management
# ============================================================================

PROMPT_TEMPLATES_PATH = Path.home() / ".deepagents" / "prompt_templates.json"


def get_default_templates() -> list[dict[str, Any]]:
    """Return built-in default prompt templates.

    Returns:
        List of default prompt template dictionaries
    """
    return [
        {
            "id": "code-review",
            "name": "代码审查助手",
            "category": "开发",
            "prompt": """你是一个专业的代码审查助手。重点关注：

1. **代码质量和可读性**：变量命名、代码结构、注释完整性
2. **潜在的 bug 和边界情况**：空值处理、并发问题、资源泄漏
3. **性能优化建议**：算法复杂度、内存使用、缓存策略
4. **安全最佳实践**：输入验证、敏感数据处理、权限检查

请提供具体、可操作的建议，并给出改进示例。"""
        },
        {
            "id": "writer",
            "name": "写作助手",
            "category": "创作",
            "prompt": """你是一个专业的写作助手，擅长帮助用户：

1. **润色和改进文本表达**：提升文字的流畅度和感染力
2. **调整文章结构和逻辑**：优化段落组织，增强论证力度
3. **提供创意和建议**：拓展思路，丰富内容
4. **检查语法和拼写错误**：确保文字规范准确

请保持原文的核心观点和风格，只做必要的优化。"""
        },
        {
            "id": "data-analyst",
            "name": "数据分析专家",
            "category": "分析",
            "prompt": """你是一个数据分析专家，擅长：

1. **数据清洗和预处理**：处理缺失值、异常值和数据格式
2. **统计分析和可视化**：描述性统计、相关性分析、趋势识别
3. **洞察发现和解释**：从数据中提取有价值的商业洞察
4. **预测和建议**：基于数据趋势提供决策支持建议

分析时请注重数据的业务意义，而不仅仅是技术指标。"""
        },
        {
            "id": "general-assistant",
            "name": "通用助手",
            "category": "通用",
            "prompt": """你是一个专业的 AI 助手，能够帮助用户完成各种任务。

请：
- 准确理解用户的需求
- 提供清晰、有条理的回答
- 在不确定时主动询问澄清
- 保持专业和友好的态度

根据具体任务调整你的回答风格和深度。"""
        },
        {
            "id": "translation",
            "name": "翻译助手",
            "category": "语言",
            "prompt": """你是一个专业的翻译助手，擅长中英互译。

翻译原则：
1. **准确性**：忠实传达原文含义，不添加或删除信息
2. **流畅性**：符合目标语言的表达习惯
3. **风格一致性**：保持原文的语气和风格
4. **专业性**：准确翻译专业术语

对于技术文档、商务邮件等正式文本，请使用规范的表达。"""
        },
        {
            "id": "learning-coach",
            "name": "学习辅导",
            "category": "教育",
            "prompt": """你是一个专业的学习辅导老师，擅长：

1. **知识讲解**：用清晰易懂的语言解释复杂概念
2. **学习规划**：帮助学生制定合理的学习计划
3. **问题解答**：耐心回答学生的疑问
4. **练习推荐**：提供有针对性的练习题目

请根据学生的水平和进度调整讲解深度，鼓励学生独立思考。"""
        }
    ]


def get_prompt_templates() -> list[dict[str, Any]]:
    """Get all available prompt templates.

    Loads templates from the user's template file if it exists,
    otherwise returns the default built-in templates.

    Returns:
        List of prompt template dictionaries
    """
    if PROMPT_TEMPLATES_PATH.exists():
        try:
            content = PROMPT_TEMPLATES_PATH.read_text(encoding="utf-8")
            data = json.loads(content)
            templates = data.get("templates", [])
            if templates:
                logger.debug(f"Loaded {len(templates)} templates from {PROMPT_TEMPLATES_PATH}")
                return templates
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load templates from {PROMPT_TEMPLATES_PATH}: {e}")

    # Return default templates
    return get_default_templates()


def save_prompt_templates(templates: list[dict[str, Any]]) -> bool:
    """Save prompt templates to the user's template file.

    Args:
        templates: List of template dictionaries to save

    Returns:
        True if successful, False otherwise
    """
    try:
        PROMPT_TEMPLATES_PATH.parent.mkdir(parents=True, exist_ok=True)
        content = json.dumps({"templates": templates}, indent=2, ensure_ascii=False)
        PROMPT_TEMPLATES_PATH.write_text(content, encoding="utf-8")
        logger.info(f"Saved {len(templates)} templates to {PROMPT_TEMPLATES_PATH}")
        return True
    except OSError as e:
        logger.error(f"Failed to save templates: {e}")
        return False


async def generate_workspace_prompt(
    workspace_name: str,
    category: str,
    description: str = ""
) -> str:
    """Generate a system prompt for a workspace using AI.

    Args:
        workspace_name: Name of the workspace
        category: Workspace category
        description: Additional description (optional)

    Returns:
        Generated system prompt text
    """
    from deepagents_cli.config import create_model
    from langchain_core.messages import HumanMessage

    model = create_model()

    prompt = f"""请为以下工作空间生成一个专业的系统提示词：

工作空间名称：{workspace_name}
分类：{category}
描述：{description or "无"}

要求：
1. 提示词应该简洁明确，不超过 200 字
2. 侧重于该工作空间的核心功能和目标
3. 使用专业的语气
4. 直接返回提示词内容，不需要其他解释

生成的提示词："""

    try:
        response = await model.ainvoke([HumanMessage(content=prompt)])
        generated = response.content.strip()
        logger.info(f"Generated prompt for workspace '{workspace_name}'")
        return generated
    except Exception as e:
        logger.error(f"Failed to generate prompt: {e}")
        return get_default_prompt_for_category(category)


def get_default_prompt_for_category(category: str) -> str:
    """Get a default system prompt based on category.

    Args:
        category: Workspace category

    Returns:
        Default prompt for the category
    """
    defaults = {
        "开发": "你是一个专业的开发助手，擅长代码编写、调试和架构设计。请提供清晰、可维护的代码示例。",
        "写作": "你是一个专业的写作助手，擅长文本润色和内容创作。请保持原文风格，只做必要的优化。",
        "分析": "你是一个专业的数据分析助手，擅长数据处理和洞察发现。请注重数据的业务意义。",
        "创作": "你是一个专业的创作助手，擅长创意写作和内容策划。请提供有创意且可执行的建议。",
        "语言": "你是一个专业的语言助手，擅长翻译和语言学习。请确保翻译准确、流畅。",
        "教育": "你是一个专业的教育助手，擅长知识讲解和学习辅导。请用通俗易懂的方式解释概念。",
        "商业": "你是一个专业的商业助手，擅长商业分析和决策支持。请提供基于数据和逻辑的建议。"
    }
    return defaults.get(category, "你是一个专业的 AI 助手，能够帮助用户完成各种任务。请准确理解需求并提供有帮助的回答。")
