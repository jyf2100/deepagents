// desktop/src/renderer/sidebar/workspace-list.js

/**
 * WorkspaceList class - Manages workspace list and conversation history
 */
class WorkspaceList extends MenuGroup {
  /**
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    super({
      id: 'workspace',
      title: '工作空间',
      icon: '📁',
      ...options
    });

    this.workspaces = [];
    this.conversations = [];
    this.sidebar = options.sidebar || null;

    // Load data
    this.load();
  }

  /**
   * Load workspaces and conversation list
   */
  async load() {
    try {
      // Load workspaces
      const workspacesResult = await window.deepagents.listWorkspaces();
      if (workspacesResult.status === 'success') {
        this.workspaces = workspacesResult.data || [];
      }

      // Load conversations for current workspace
      if (window.currentWorkspaceId) {
        await this._loadConversations(window.currentWorkspaceId);
      }

      this._render();
    } catch (error) {
      console.error('[WorkspaceList] Failed to load:', error);
    }
  }

  /**
   * Refresh data
   */
  async refresh() {
    await this.load();
  }

  /**
   * Load conversation list
   */
  async _loadConversations(workspaceId) {
    try {
      const result = await window.deepagents.listConversations(workspaceId);
      if (result.status === 'success') {
        this.conversations = result.data || [];
      }
    } catch (error) {
      console.error('[WorkspaceList] Failed to load conversations:', error);
      this.conversations = [];
    }
  }

  /**
   * Render workspace list
   */
  _render() {
    this.clear();

    // Render workspace list
    this.workspaces.forEach(workspace => {
      const isActive = String(workspace.id) === String(window.currentWorkspaceId);
      this.addItem({
        icon: this._getWorkspaceIcon(workspace.icon),
        text: workspace.name,
        action: 'select-workspace',
        data: { workspaceId: workspace.id },
        tooltip: workspace.name
      });

      if (isActive) {
        const item = this.contentElement.lastElementChild;
        if (item) item.classList.add('active');
      }
    });

    // Add divider
    this.addDivider();

    // Add "Create Workspace" button
    this.addItem({
      icon: '➕',
      text: '创建工作空间',
      action: 'create-workspace',
      tooltip: '创建工作空间'
    });

    // Add history subgroup
    this._renderConversations();
  }

  /**
   * Render conversation history
   */
  _renderConversations() {
    // Add subgroup title
    this.addSubgroupTitle('最近对话');

    // Render conversation list (max 10)
    const recent = this.conversations.slice(0, 10);

    if (recent.length === 0) {
      // Show message when no conversations
      const emptyItem = document.createElement('div');
      emptyItem.className = 'menu-item';
      emptyItem.style.cssText = 'cursor: default; opacity: 0.5;';
      emptyItem.innerHTML = '<span class="menu-item-text" style="font-size: 12px;">暂无对话</span>';
      this.contentElement.appendChild(emptyItem);
    } else {
      recent.forEach(conv => {
        const isActive = String(conv.id) === String(window.currentConversationId);
        const timeStr = this._formatTime(conv.updated_at || conv.created_at);

        this.addItem({
          icon: '💬',
          text: (conv.title || '未命名对话') + `  ·  ${timeStr}`,
          action: 'select-conversation',
          data: { conversationId: conv.id },
          actionIcon: '×',
          actionAction: 'delete-conversation',
          actionTooltip: '删除对话',
          tooltip: conv.title || '未命名对话'
        });

        if (isActive) {
          const item = this.contentElement.lastElementChild;
          if (item) item.classList.add('active');
        }
      });

      // If there are more conversations, show "View All"
      if (this.conversations.length > 10) {
        this.addItem({
          icon: '•••',
          text: `查看全部 ${this.conversations.length} 个对话`,
          action: 'view-all-conversations',
          tooltip: '查看全部对话'
        });
      }
    }

    // Add "New Conversation" button
    this.addItem({
      icon: '➕',
      text: '新对话',
      action: 'create-conversation',
      tooltip: '创建新对话'
    });
  }

  /**
   * Get workspace icon
   */
  _getWorkspaceIcon(icon) {
    const iconMap = {
      'folder': '📁',
      'code': '💻',
      'book': '📚',
      'briefcase': '💼',
      'lightbulb': '💡'
    };
    return iconMap[icon] || '📁';
  }

  /**
   * Format time
   */
  _formatTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return minutes < 1 ? '刚刚' : `${minutes}分钟前`;
    }

    // Today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    }

    // Earlier
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  /**
   * HTML escape
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export to global
window.WorkspaceList = WorkspaceList;
