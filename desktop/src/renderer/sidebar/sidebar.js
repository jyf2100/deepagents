// desktop/src/renderer/sidebar/sidebar.js

/**
 * Sidebar 类 - 管理左侧侧边栏
 */
class Sidebar {
  /**
   * @param {Object} options - 配置选项
   * @param {HTMLElement} options.container - 侧边栏容器元素
   * @param {Function} options.onWorkspaceChange - 工作空间切换回调
   * @param {Function} options.onConversationChange - 对话切换回调
   */
  constructor(options = {}) {
    this.container = options.container || document.getElementById('sidebar');
    this.overlay = document.getElementById('sidebar-overlay');
    this.isCollapsed = false;
    this.expandedGroups = ['workspace', 'settings'];
    this.groups = new Map();

    this.callbacks = {
      onWorkspaceChange: options.onWorkspaceChange || null,
      onConversationChange: options.onConversationChange || null,
    };

    this._init();
  }

  /**
   * 初始化侧边栏
   */
  _init() {
    this._loadState();
    this._updateCollapseState();
    this._updateGroupStates();
    this._bindEvents();

    // 监听窗口大小变化
    window.addEventListener('resize', () => this._handleResize());
  }

  /**
   * 绑定事件监听
   */
  _bindEvents() {
    // 汉堡按钮点击
    const hamburgerButton = document.getElementById('hamburger-button');
    if (hamburgerButton) {
      hamburgerButton.addEventListener('click', () => this.toggle());
    }

    // 遮罩点击（移动端关闭侧边栏）
    if (this.overlay) {
      this.overlay.addEventListener('click', () => {
        this.container.classList.remove('sidebar-expanded');
        this.overlay.classList.remove('active');
      });
    }

    // 使用事件委托处理所有菜单点击
    this.container.addEventListener('click', (e) => {
      this._handleClick(e);
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      this._handleKeyboard(e);
    });
  }

  /**
   * 处理点击事件
   */
  _handleClick(e) {
    // 分组标题点击
    const groupHeader = e.target.closest('.menu-group-header');
    if (groupHeader) {
      const groupId = groupHeader.dataset.group;
      if (groupId) {
        this.toggleGroup(groupId);
      }
      return;
    }

    // 菜单项点击
    const menuItem = e.target.closest('.menu-item');
    if (menuItem) {
      const action = menuItem.dataset.action;
      const data = menuItem.dataset;
      this._handleMenuAction(action, data, e);
      return;
    }
  }

  /**
   * 处理键盘快捷键
   */
  _handleKeyboard(e) {
    // Cmd/Ctrl + B: 切换侧边栏
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      this.toggle();
    }

    // Cmd/Ctrl + K: 聚焦到搜索框（如果有的话）
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      // TODO: 实现搜索功能
    }

    // Escape: 关闭侧边栏（移动端展开状态）
    if (e.key === 'Escape') {
      if (this.container.classList.contains('sidebar-expanded')) {
        this.container.classList.remove('sidebar-expanded');
        this.overlay.classList.remove('active');
      }
    }
  }

  /**
   * 处理菜单项动作
   */
  async _handleMenuAction(action, data, event) {
    // 如果点击的是删除按钮，不要触发菜单项的默认动作
    if (event.target.classList.contains('menu-item-action')) {
      event.stopPropagation();
      const deleteAction = event.target.dataset.action;
      if (deleteAction === 'delete-conversation') {
        await this._deleteConversation(data.conversationId);
      }
      return;
    }

    switch (action) {
      case 'select-workspace':
        await this._selectWorkspace(data.workspaceId);
        break;
      case 'create-workspace':
        this._createWorkspace();
        break;
      case 'select-conversation':
        await this._selectConversation(data.conversationId);
        break;
      case 'create-conversation':
        await this._createConversation();
        break;
      case 'open-skills-dialog':
        this._openSkillsDialog();
        break;
      case 'open-add-skill-dialog':
        this._openAddSkillDialog();
        break;
      case 'toggle-theme':
        await this._toggleTheme();
        break;
      case 'open-settings':
        this._openSettings();
        break;
      case 'open-about':
        this._openAbout();
        break;
    }
  }

  /**
   * 切换侧边栏折叠状态
   */
  toggle() {
    // 小窗口模式下使用 overlay 展开模式
    if (window.innerWidth <= 800) {
      this.container.classList.toggle('sidebar-expanded');
      this.overlay.classList.toggle('active');
    } else {
      this.isCollapsed = !this.isCollapsed;
      this._updateCollapseState();
      this._saveState();
    }
  }

  /**
   * 更新折叠状态
   */
  _updateCollapseState() {
    if (this.isCollapsed) {
      this.container.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
    } else {
      this.container.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
    }
  }

  /**
   * 处理窗口大小变化
   */
  _handleResize() {
    // 从小窗口切换到大窗口时，清理 overlay 状态
    if (window.innerWidth > 800) {
      this.container.classList.remove('sidebar-expanded');
      this.overlay.classList.remove('active');
    }
  }

  /**
   * 切换分组展开/折叠
   */
  toggleGroup(groupId) {
    const index = this.expandedGroups.indexOf(groupId);
    if (index > -1) {
      this.expandedGroups.splice(index, 1);
    } else {
      this.expandedGroups.push(groupId);
    }
    this._updateGroupStates();
    this._saveState();
  }

  /**
   * 更新分组状态
   */
  _updateGroupStates() {
    const groups = this.container.querySelectorAll('.menu-group');
    groups.forEach(group => {
      const groupId = group.id.replace('-group', '');
      if (this.expandedGroups.includes(groupId)) {
        group.classList.remove('collapsed');
      } else {
        group.classList.add('collapsed');
      }
    });
  }

  /**
   * 加载状态
   */
  _loadState() {
    try {
      const collapsed = localStorage.getItem('sidebar.collapsed');
      if (collapsed !== null) {
        this.isCollapsed = collapsed === 'true';
      }

      const expanded = localStorage.getItem('sidebar.expandedGroups');
      if (expanded !== null) {
        this.expandedGroups = JSON.parse(expanded);
      }
    } catch (error) {
      console.error('[Sidebar] Failed to load state:', error);
    }
  }

  /**
   * 保存状态
   */
  _saveState() {
    try {
      localStorage.setItem('sidebar.collapsed', String(this.isCollapsed));
      localStorage.setItem('sidebar.expandedGroups', JSON.stringify(this.expandedGroups));
    } catch (error) {
      console.error('[Sidebar] Failed to save state:', error);
    }
  }

  /**
   * 选择工作空间
   */
  async _selectWorkspace(workspaceId) {
    try {
      await window.deepagents.updateWorkspace(workspaceId, {});
      if (this.callbacks.onWorkspaceChange) {
        this.callbacks.onWorkspaceChange(workspaceId);
      }
      this._updateActiveStates();
    } catch (error) {
      console.error('[Sidebar] Failed to select workspace:', error);
    }
  }

  /**
   * 创建工作空间
   */
  _createWorkspace() {
    // 直接调用现有的创建工作空间对话框函数
    if (typeof showCreateWorkspaceDialog === 'function') {
      showCreateWorkspaceDialog();
    } else {
      console.error('[Sidebar] showCreateWorkspaceDialog function not found');
    }
  }

  /**
   * 选择对话
   */
  async _selectConversation(conversationId) {
    try {
      const currentWorkspaceId = window.currentWorkspaceId;
      await window.deepagents.switchConversation(currentWorkspaceId, conversationId);
      if (this.callbacks.onConversationChange) {
        this.callbacks.onConversationChange(conversationId);
      }
      this._updateActiveStates();
    } catch (error) {
      console.error('[Sidebar] Failed to select conversation:', error);
    }
  }

  /**
   * 创建新对话
   */
  async _createConversation() {
    try {
      const currentWorkspaceId = window.currentWorkspaceId;
      const result = await window.deepagents.createConversation(currentWorkspaceId, '新对话');
      if (result.status === 'success' && result.data.conversation_id) {
        await this._selectConversation(result.data.conversation_id);
      }
    } catch (error) {
      console.error('[Sidebar] Failed to create conversation:', error);
    }
  }

  /**
   * 删除对话
   */
  async _deleteConversation(conversationId) {
    if (!confirm('确定要删除这个对话吗？')) {
      return;
    }

    try {
      await window.deepagents.deleteConversation(conversationId);

      // 刷新工作空间列表（包含历史记录）
      const workspaceGroup = this.groups.get('workspace');
      if (workspaceGroup && workspaceGroup.refresh) {
        await workspaceGroup.refresh();
      }
    } catch (error) {
      console.error('[Sidebar] Failed to delete conversation:', error);
    }
  }

  /**
   * 打开技能面板
   */
  _openSkillsDialog() {
    // 通过切换到"技能"标签来显示技能面板
    const skillsTab = document.querySelector('.tab[data-tab="skills"]');
    if (skillsTab) {
      skillsTab.click();
    } else {
      console.error('[Sidebar] Skills tab not found');
    }
  }

  /**
   * 打开添加技能对话框
   */
  _openAddSkillDialog() {
    // 使用全局函数
    if (window.showAddSkillDialogGlobal) {
      window.showAddSkillDialogGlobal();
    }
  }

  /**
   * 打开主题设置对话框
   */
  _toggleTheme() {
    // 点击现有的主题切换按钮来打开主题对话框
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.click();
    } else {
      console.error('[Sidebar] theme-toggle-btn not found');
    }
  }

  /**
   * 打开模型设置对话框
   */
  _openSettings() {
    // 直接调用现有的配置对话框函数
    if (typeof openConfigDialog === 'function') {
      openConfigDialog();
    } else {
      console.error('[Sidebar] openConfigDialog function not found');
    }
  }

  /**
   * 打开关于
   */
  _openAbout() {
    alert(`Cowork v0.3.8\n\n智侣 AI 助手桌面应用`);
  }

  /**
   * 更新选中状态
   */
  _updateActiveStates() {
    // 更新工作空间选中状态
    const workspaceItems = this.container.querySelectorAll('.menu-item[data-action="select-workspace"]');
    workspaceItems.forEach(item => {
      if (item.dataset.workspaceId === String(window.currentWorkspaceId)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 更新对话选中状态
    const conversationItems = this.container.querySelectorAll('.menu-item[data-action="select-conversation"]');
    conversationItems.forEach(item => {
      if (item.dataset.conversationId === String(window.currentConversationId)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * 注册分组
   */
  registerGroup(id, groupInstance) {
    this.groups.set(id, groupInstance);
  }

  /**
   * 销毁实例
   */
  destroy() {
    // 清理事件监听器等
    if (this.container) {
      this.container.removeEventListener('click', this._handleClick);
    }
  }
}

// 导出到全局
window.Sidebar = Sidebar;
