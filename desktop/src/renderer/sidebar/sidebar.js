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
    this.expandedGroups = ['workspace'];
    this.groups = new Map();

    // 工作空间相关
    this.workspaces = [];
    this.workspaceIcons = {
      'folder': '📁',
      'code': '💻',
      'book': '📚',
      'briefcase': '💼',
      'lightbulb': '💡'
    };

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

    // 初始化工作空间选择器
    this._initWorkspaceSelector();

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
        // 同时关闭工作空间菜单
        this._closeWorkspaceMenu();
      });
    }

    // 使用事件委托处理所有菜单点击
    this.container.addEventListener('click', (e) => {
      this._handleClick(e);
    });

    // 工作空间选择器按钮
    const workspaceSelector = document.getElementById('sidebar-workspace-selector');
    if (workspaceSelector) {
      workspaceSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleWorkspaceMenu();
      });
    }

    // 工作空间设置按钮
    const workspaceSettingsBtn = document.getElementById('sidebar-workspace-settings-btn');
    if (workspaceSettingsBtn) {
      workspaceSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeWorkspaceMenu();
        this._openWorkspaceSettings(window.currentWorkspaceId);
      });
    }

    // 新建工作空间按钮
    const createWorkspaceBtn = document.getElementById('sidebar-create-workspace-btn');
    if (createWorkspaceBtn) {
      createWorkspaceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeWorkspaceMenu();
        this._createWorkspace();
      });
    }

    // 点击其他地方关闭工作空间菜单
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('sidebar-workspace-menu');
      if (menu && !menu.contains(e.target)) {
        this._closeWorkspaceMenu();
      }
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

    // 点击非技能管理的菜单项时，关闭技能面板
    if (action !== 'open-skills-dialog') {
      this._closeSkillsPanel();
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
      case 'open-workspace-settings':
        this._openWorkspaceSettings(data.workspaceId);
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
   * 选择工作空间并切换展开状态
   */
  async _selectWorkspaceAndExpand(workspaceId) {
    // 先切换工作空间
    await this._selectWorkspace(workspaceId);

    // 然后切换展开状态
    const workspaceGroup = this.groups.get('workspace');
    if (workspaceGroup && workspaceGroup.expandedWorkspaces) {
      const index = workspaceGroup.expandedWorkspaces.indexOf(workspaceId);
      if (index > -1) {
        // 如果已展开，不需要做任何事
      } else {
        // 如果未展开，展开它
        workspaceGroup.expandedWorkspaces.push(workspaceId);
        workspaceGroup._render();
      }
    }
  }

  /**
   * 打开工作空间设置（需要先切换到该工作空间）
   */
  _openWorkspaceSettings(workspaceId) {
    // 切换到指定工作空间
    this._selectWorkspaceAndExpand(workspaceId);

    // 然后打开设置对话框
    if (typeof showWorkspaceSettings === 'function') {
      showWorkspaceSettings();
    } else {
      console.error('[Sidebar] showWorkspaceSettings function not found');
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
   * 打开历史标签页
   */
  _openHistory() {
    // 点击"历史"标签切换到历史视图
    const historyTab = document.querySelector('.tab[data-tab="history"]');
    if (historyTab) {
      historyTab.click();
    } else {
      console.error('[Sidebar] History tab not found');
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
  async _openSkillsDialog() {
    // 隐藏历史视图，显示技能面板
    const historyView = document.getElementById('history-view');
    const skillsPanel = document.getElementById('skills-panel-content');
    const sidePanel = document.getElementById('side-panel');

    if (historyView) historyView.style.display = 'none';
    if (skillsPanel) {
      skillsPanel.style.display = 'flex';
      skillsPanel.style.flexDirection = 'row';
    }

    // 标记侧边栏为技能激活状态
    if (sidePanel) sidePanel.classList.add('skills-active');

    // 确保技能列表已加载
    if (window.loadSkillsGlobal && typeof window.loadSkillsGlobal === 'function') {
      await window.loadSkillsGlobal();
    }
  }

  /**
   * 关闭技能面板，返回历史视图
   */
  _closeSkillsPanel() {
    const historyView = document.getElementById('history-view');
    const skillsPanel = document.getElementById('skills-panel-content');
    const sidePanel = document.getElementById('side-panel');

    if (historyView) historyView.style.display = 'block';
    if (skillsPanel) skillsPanel.style.display = 'none';

    // 移除技能激活状态
    if (sidePanel) sidePanel.classList.remove('skills-active');
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
   * 初始化工作空间选择器
   */
  async _initWorkspaceSelector() {
    try {
      await this._loadWorkspaces();
      this._updateWorkspaceSelectorUI();
    } catch (error) {
      console.error('[Sidebar] Failed to init workspace selector:', error);
    }
  }

  /**
   * 加载工作空间列表
   */
  async _loadWorkspaces() {
    try {
      const result = await window.deepagents.listWorkspaces();
      this.workspaces = result.data?.workspaces || result.data || [];
      console.log('[Sidebar] Loaded workspaces:', this.workspaces.length);
    } catch (error) {
      console.error('[Sidebar] Failed to load workspaces:', error);
      this.workspaces = [];
    }
  }

  /**
   * 更新工作空间选择器 UI
   */
  _updateWorkspaceSelectorUI() {
    const workspaceSelector = document.getElementById('sidebar-workspace-selector');

    // 如果没有当前工作空间，尝试从 localStorage 获取
    if (!window.currentWorkspaceId) {
      const savedId = localStorage.getItem('deepagents-current-workspace');
      if (savedId) {
        window.currentWorkspaceId = savedId;
      }
    }

    let currentWorkspace = this.workspaces.find(w => String(w.id) === String(window.currentWorkspaceId));

    // 如果还是没有，优先选择 default 工作空间
    if (!currentWorkspace && this.workspaces.length > 0) {
      const defaultWorkspace = this.workspaces.find(w => w.id === 'default' || w.name === '默认工作空间');
      if (defaultWorkspace) {
        currentWorkspace = defaultWorkspace;
        window.currentWorkspaceId = defaultWorkspace.id;
        localStorage.setItem('deepagents-current-workspace', defaultWorkspace.id);
        // 通知 app.js 更新
        if (this.callbacks.onWorkspaceChange) {
          this.callbacks.onWorkspaceChange(defaultWorkspace.id);
        }
      } else {
        // 使用第一个工作空间
        currentWorkspace = this.workspaces[0];
        window.currentWorkspaceId = currentWorkspace.id;
        localStorage.setItem('deepagents-current-workspace', currentWorkspace.id);
        if (this.callbacks.onWorkspaceChange) {
          this.callbacks.onWorkspaceChange(currentWorkspace.id);
        }
      }
    }

    if (workspaceSelector && currentWorkspace) {
      const icon = this.workspaceIcons[currentWorkspace.icon] || '📁';
      workspaceSelector.textContent = `${icon} ${currentWorkspace.name}`;
    } else if (workspaceSelector) {
      workspaceSelector.textContent = '📁 未选择工作空间';
    }

    this._renderWorkspaceMenu();
  }

  /**
   * 渲染工作空间下拉菜单
   */
  _renderWorkspaceMenu() {
    const workspaceMenu = document.getElementById('sidebar-workspace-menu');
    if (!workspaceMenu) return;

    let html = '';

    // 显示所有工作空间
    this.workspaces.forEach(workspace => {
      const icon = this.workspaceIcons[workspace.icon] || '📁';
      const isActive = String(workspace.id) === String(window.currentWorkspaceId);
      html += '<div class="sidebar-workspace-menu-item' + (isActive ? ' active' : '') + '" data-workspace-id="' + workspace.id + '">';
      html += '<span class="workspace-icon">' + icon + '</span>';
      html += '<span class="workspace-name">' + this._escapeHtml(workspace.name) + '</span>';
      html += '</div>';
    });

    // 分隔线
    html += '<div class="sidebar-workspace-menu-divider"></div>';

    // 创建工作空间按钮
    html += '<div class="sidebar-workspace-menu-create" id="sidebar-create-workspace-btn">';
    html += '<span>➕</span>';
    html += '<span>创建工作空间</span>';
    html += '</div>';

    workspaceMenu.innerHTML = html;

    // 绑定点击事件
    workspaceMenu.querySelectorAll('.sidebar-workspace-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const workspaceId = item.getAttribute('data-workspace-id');
        this._switchWorkspace(workspaceId);
        this._closeWorkspaceMenu();
      });
    });

    // 创建工作空间按钮
    const createBtn = workspaceMenu.querySelector('#sidebar-create-workspace-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this._closeWorkspaceMenu();
        this._createWorkspace();
      });
    }
  }

  /**
   * 切换工作空间菜单显示/隐藏
   */
  _toggleWorkspaceMenu() {
    const workspaceSelector = document.getElementById('sidebar-workspace-selector');
    const workspaceMenu = document.getElementById('sidebar-workspace-menu');
    if (workspaceMenu && workspaceSelector) {
      const isShow = !workspaceMenu.classList.contains('show');

      if (isShow) {
        // 计算菜单位置：在按钮正下方
        const rect = workspaceSelector.getBoundingClientRect();
        workspaceMenu.style.top = (rect.bottom + 4) + 'px';
        workspaceMenu.style.left = rect.left + 'px';
        workspaceMenu.style.width = rect.width + 'px';
        workspaceMenu.classList.add('show');
      } else {
        workspaceMenu.classList.remove('show');
      }
    }
  }

  /**
   * 关闭工作空间菜单
   */
  _closeWorkspaceMenu() {
    const workspaceMenu = document.getElementById('sidebar-workspace-menu');
    if (workspaceMenu) {
      workspaceMenu.classList.remove('show');
    }
  }

  /**
   * 切换工作空间
   */
  async _switchWorkspace(workspaceId) {
    if (workspaceId === String(window.currentWorkspaceId)) return;

    try {
      await window.deepagents.updateWorkspace(workspaceId, {});
      window.currentWorkspaceId = workspaceId;
      localStorage.setItem('deepagents-current-workspace', workspaceId);

      // 更新 UI
      this._updateWorkspaceSelectorUI();

      // 触发回调
      if (this.callbacks.onWorkspaceChange) {
        this.callbacks.onWorkspaceChange(workspaceId);
      }

      // 清空对话视图
      const messagesDiv = document.getElementById('messages');
      if (messagesDiv) {
        messagesDiv.innerHTML = '';
      }

      console.log('[Sidebar] Switched to workspace:', workspaceId);
    } catch (error) {
      console.error('[Sidebar] Failed to switch workspace:', error);
    }
  }

  /**
   * HTML 转义
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
