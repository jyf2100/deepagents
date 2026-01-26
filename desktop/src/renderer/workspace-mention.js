// desktop/src/renderer/workspace-mention.js

/**
 * WorkspaceMention 类 - 管理 @工作空间 快速切换功能
 */
class WorkspaceMention {
  /**
   * @param {Array} workspaces - 工作空间列表
   * @param {string} currentWorkspaceId - 当前工作空间 ID
   * @param {Function} onWorkspaceSelect - 选择工作空间时的回调
   */
  constructor(workspaces, currentWorkspaceId, onWorkspaceSelect) {
    this.workspaces = workspaces;
    this.currentWorkspaceId = currentWorkspaceId;
    this.onWorkspaceSelect = onWorkspaceSelect;
    this.selectedIndex = 0;
    this.isVisible = false;
    this.dropdown = null;

    this._createDropdown();
    this._bindEvents();
  }

  /**
   * 创建下拉列表 DOM 元素
   */
  _createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'workspace-mention-dropdown';
    this.dropdown.style.display = 'none';
    document.body.appendChild(this.dropdown);
  }

  /**
   * 绑定事件监听
   */
  _bindEvents() {
    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (this.isVisible && !this.dropdown.contains(e.target)) {
        this.hide();
      }
    });
  }

  /**
   * 显示工作空间列表
   * @param {DOMRect} rect - 输入框的位置信息
   */
  show(rect) {
    this.selectedIndex = 0;
    this._render();
    this._position(rect);
    this.dropdown.style.display = 'block';
    this.isVisible = true;
  }

  /**
   * 隐藏工作空间列表
   */
  hide() {
    this.dropdown.style.display = 'none';
    this.isVisible = false;
  }

  /**
   * 检查列表是否可见
   */
  isDropdownVisible() {
    return this.isVisible;
  }

  /**
   * 选择下一个工作空间
   */
  selectNext() {
    if (!this.isVisible) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.workspaces.length;
    this._render();
  }

  /**
   * 选择上一个工作空间
   */
  selectPrevious() {
    if (!this.isVisible) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.workspaces.length) % this.workspaces.length;
    this._render();
  }

  /**
   * 确认选择当前工作空间
   */
  confirmSelection() {
    if (!this.isVisible || !this.workspaces[this.selectedIndex]) return;
    const workspace = this.workspaces[this.selectedIndex];
    this.onWorkspaceSelect(workspace);
    this.hide();
  }

  /**
   * 更新工作空间列表
   */
  updateWorkspaces(workspaces, currentWorkspaceId) {
    this.workspaces = workspaces;
    this.currentWorkspaceId = currentWorkspaceId;
    if (this.isVisible) {
      this._render();
    }
  }

  /**
   * 定位下拉列表
   */
  _position(rect) {
    this.dropdown.style.left = `${rect.left}px`;
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.minWidth = `${rect.width}px`;
  }

  /**
   * 渲染工作空间列表
   */
  _render() {
    const icons = {
      'folder': '📁',
      'code': '💻',
      'book': '📚',
      'briefcase': '💼',
      'lightbulb': '💡'
    };

    let html = '';
    this.workspaces.forEach((workspace, index) => {
      const icon = icons[workspace.icon] || '📁';
      const isSelected = index === this.selectedIndex;
      const isCurrent = workspace.id === this.currentWorkspaceId;

      html += `
        <div class="workspace-mention-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}"
             data-index="${index}">
          <span class="workspace-icon">${icon}</span>
          <span class="workspace-name">${this._escapeHtml(workspace.name)}</span>
          ${isCurrent ? '<span class="current-badge">当前</span>' : ''}
        </div>
      `;
    });

    this.dropdown.innerHTML = html;

    // 绑定点击事件
    this.dropdown.querySelectorAll('.workspace-mention-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedIndex = parseInt(item.getAttribute('data-index'));
        this.confirmSelection();
      });
    });

    // 确保选中项可见
    this._scrollIntoView();
  }

  /**
   * 滚动到选中项
   */
  _scrollIntoView() {
    const selected = this.dropdown.querySelector('.workspace-mention-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
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
   * 销毁实例
   */
  destroy() {
    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
  }
}

// 导出到全局
window.WorkspaceMention = WorkspaceMention;
