// desktop/src/renderer/sidebar/workspace-list.js

/**
 * WorkspaceList class - Manages workspace list with nested conversations
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
    this.workspaceConversations = new Map(); // workspaceId -> conversations[]
    this.expandedWorkspaces = [];
    this.sidebar = options.sidebar || null;

    // Load data
    this.load();
  }

  /**
   * Load workspaces and conversations for each workspace
   */
  async load() {
    try {
      // Load workspaces
      const workspacesResult = await window.deepagents.listWorkspaces();
      if (workspacesResult.status === 'success') {
        this.workspaces = workspacesResult.data?.workspaces || workspacesResult.data || [];
      }

      // Load conversations for each workspace
      for (const workspace of this.workspaces) {
        await this._loadConversations(workspace.id);
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
   * Load conversation list for a workspace
   */
  async _loadConversations(workspaceId) {
    try {
      const result = await window.deepagents.listConversations(workspaceId);
      if (result.status === 'success') {
        this.workspaceConversations.set(workspaceId, result.data || []);
      }
    } catch (error) {
      console.error('[WorkspaceList] Failed to load conversations:', error);
      this.workspaceConversations.set(workspaceId, []);
    }
  }

  /**
   * Render workspace list with nested conversations
   */
  _render() {
    this.clear();

    // Render each workspace as an expandable group
    this.workspaces.forEach(workspace => {
      this._renderWorkspace(workspace);
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
  }

  /**
   * Render a single workspace with its conversations
   */
  _renderWorkspace(workspace) {
    const isActive = String(workspace.id) === String(window.currentWorkspaceId);
    const isExpanded = this.expandedWorkspaces.includes(workspace.id);

    // Create workspace container
    const wsContainer = document.createElement('div');
    wsContainer.className = 'workspace-item';
    if (isActive) wsContainer.classList.add('active');

    // Create workspace header
    const wsHeader = document.createElement('div');
    wsHeader.className = 'workspace-header';
    wsHeader.dataset.workspaceId = workspace.id;
    wsHeader.innerHTML = `
      <span class="workspace-icon">${this._getWorkspaceIcon(workspace.icon)}</span>
      <span class="workspace-name">${this._escapeHtml(workspace.name)}</span>
      <span class="workspace-arrow">${isExpanded ? '▾' : '▶'</span>
    `;

    // Create workspace content
    const wsContent = document.createElement('div');
    wsContent.className = 'workspace-content';
    if (!isExpanded) {
      wsContent.style.display = 'none';
    }

    // Add conversations
    const conversations = this.workspaceConversations.get(workspace.id) || [];
    const recent = conversations.slice(0, 10);

    if (recent.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'menu-item';
      emptyItem.style.cssText = 'cursor: default; opacity: 0.5;';
      emptyItem.innerHTML = '<span class="menu-item-text" style="font-size: 12px;">暂无对话</span>';
      wsContent.appendChild(emptyItem);
    } else {
      recent.forEach(conv => {
        const isConvActive = String(conv.id) === String(window.currentConversationId);
        const timeStr = this._formatTime(conv.updated_at || conv.created_at);

        const convItem = document.createElement('div');
        convItem.className = 'menu-item';
        if (isConvActive) convItem.classList.add('active');
        convItem.dataset.action = 'select-conversation';
        convItem.dataset.conversationId = conv.id;
        convItem.innerHTML = `
          <span class="menu-item-icon">💬</span>
          <span class="menu-item-text">${this._escapeHtml(conv.title || '未命名对话')}  ·  ${timeStr}</span>
          <span class="menu-item-action" data-action="delete-conversation" data-conversation-id="${conv.id}" title="删除对话">×</span>
        `;
        wsContent.appendChild(convItem);
      });

      // If there are more conversations, show indicator
      if (conversations.length > 10) {
        const moreItem = document.createElement('div');
        moreItem.className = 'menu-item';
        moreItem.style.cssText = 'cursor: default; opacity: 0.6; font-size: 11px;';
        moreItem.innerHTML = `<span class="menu-item-text">还有 ${conversations.length - 10} 个对话...</span>`;
        wsContent.appendChild(moreItem);
      }
    }

    // Add divider before settings
    const divider = document.createElement('div');
    divider.className = 'menu-divider';
    wsContent.appendChild(divider);

    // Add workspace settings button
    const settingsItem = document.createElement('div');
    settingsItem.className = 'menu-item';
    settingsItem.dataset.action = 'open-workspace-settings';
    settingsItem.dataset.workspaceId = workspace.id;
    settingsItem.innerHTML = `
      <span class="menu-item-icon">⚙️</span>
      <span class="menu-item-text">工作空间设置</span>
    `;
    wsContent.appendChild(settingsItem);

    // Append to container
    wsContainer.appendChild(wsHeader);
    wsContainer.appendChild(wsContent);
    this.contentElement.appendChild(wsContainer);
  }

  /**
   * Toggle workspace expand/collapse
   */
  _toggleWorkspace(workspaceId) {
    const index = this.expandedWorkspaces.indexOf(workspaceId);
    if (index > -1) {
      this.expandedWorkspaces.splice(index, 1);
    } else {
      this.expandedWorkspaces.push(workspaceId);
    }
    this._render();
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
      return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `昨天`;
    }

    // This year
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    // Other years
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
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
