// desktop/src/renderer/sidebar/menu-group.js

/**
 * MenuGroup 类 - 管理单个菜单分组
 */
class MenuGroup {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.id - 分组 ID
   * @param {string} options.title - 分组标题
   * @param {string} options.icon - 分组图标（emoji）
   * @param {boolean} options.isExpanded - 是否展开
   * @param {HTMLElement} options.container - 分组容器元素
   */
  constructor(options = {}) {
    this.id = options.id;
    this.title = options.title;
    this.icon = options.icon || '📁';
    this.isExpanded = options.isExpanded !== false;
    this.container = options.container || document.getElementById(`${this.id}-group`);

    if (!this.container) {
      console.error(`[MenuGroup] Container not found for: ${this.id}`);
      return;
    }

    this.contentElement = this.container.querySelector('.menu-group-content');
    this._init();
  }

  /**
   * 初始化分组
   */
  _init() {
    this._updateExpandedState();
  }

  /**
   * 更新展开状态
   */
  _updateExpandedState() {
    if (this.isExpanded) {
      this.container.classList.remove('collapsed');
    } else {
      this.container.classList.add('collapsed');
    }
  }

  /**
   * 展开
   */
  expand() {
    this.isExpanded = true;
    this._updateExpandedState();
  }

  /**
   * 折叠
   */
  collapse() {
    this.isExpanded = false;
    this._updateExpandedState();
  }

  /**
   * 切换展开/折叠
   */
  toggle() {
    this.isExpanded = !this.isExpanded;
    this._updateExpandedState();
  }

  /**
   * 清空内容
   */
  clear() {
    if (this.contentElement) {
      this.contentElement.innerHTML = '';
    }
  }

  /**
   * 添加菜单项
   */
  addItem(config) {
    if (!this.contentElement) return;

    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.action = config.action || '';

    // 添加 data-* 属性
    if (config.data) {
      Object.keys(config.data).forEach(key => {
        item.dataset[key] = config.data[key];
      });
    }

    // 添加 tooltip（折叠状态使用）
    if (config.tooltip) {
      item.dataset.tooltip = config.tooltip;
    }

    // 构建菜单项内容
    let html = '';
    if (config.icon) {
      html += `<span class="menu-item-icon">${config.icon}</span>`;
    }
    if (config.text) {
      html += `<span class="menu-item-text">${this._escapeHtml(config.text)}</span>`;
    }
    if (config.actionIcon) {
      html += `<button class="menu-item-action" data-action="${config.actionAction || 'delete'}" data-tooltip="${config.actionTooltip || '删除'}">${config.actionIcon}</button>`;
    }

    item.innerHTML = html;
    this.contentElement.appendChild(item);

    return item;
  }

  /**
   * 添加分隔符
   */
  addDivider() {
    if (!this.contentElement) return;

    const divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: var(--divider-color); margin: 4px 0;';
    this.contentElement.appendChild(divider);
  }

  /**
   * 添加子分组标题
   */
  addSubgroupTitle(title) {
    if (!this.contentElement) return;

    const header = document.createElement('div');
    header.className = 'subgroup-header';
    header.textContent = title;
    this.contentElement.appendChild(header);
  }

  /**
   * HTML 转义
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 导出到全局
window.MenuGroup = MenuGroup;
