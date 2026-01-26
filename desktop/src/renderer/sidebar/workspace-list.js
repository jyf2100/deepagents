// desktop/src/renderer/sidebar/workspace-list.js

/**
 * WorkspaceList class - Manages workspace list
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
    this.sidebar = options.sidebar || null;

    // Load data
    this.load();
  }

  /**
   * Load workspaces
   */
  async load() {
    try {
      console.log('[WorkspaceList] Loading workspaces...');

      // Load workspaces
      const workspacesResult = await window.deepagents.listWorkspaces();
      console.log('[WorkspaceList] workspacesResult:', workspacesResult);

      if (workspacesResult.status === 'success') {
        this.workspaces = workspacesResult.data?.workspaces || workspacesResult.data || [];
        console.log('[WorkspaceList] Loaded workspaces:', this.workspaces.length, this.workspaces);
      } else {
        console.error('[WorkspaceList] Failed to load workspaces, status:', workspacesResult.status);
      }

      console.log('[WorkspaceList] About to render...');
      this._render();
      console.log('[WorkspaceList] Render complete');
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
   * Render workspace list
   */
  _render() {
    this.clear();

    // Render each workspace as a menu item
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
