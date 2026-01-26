// desktop/src/renderer/sidebar/settings-list.js

/**
 * SettingsList 类 - 管理系统设置菜单
 */
class SettingsList extends MenuGroup {
  /**
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super({
      id: 'settings',
      title: '系统设置',
      icon: '⚙️',
      ...options
    });

    this.currentTheme = 'light';

    // 加载当前主题
    this._loadTheme();

    // 渲染菜单
    this._render();
  }

  /**
   * 加载当前主题
   */
  async _loadTheme() {
    try {
      const result = await window.deepagents.getTheme();
      if (result.status === 'success') {
        this.currentTheme = result.data.theme || 'light';
      }
    } catch (error) {
      console.error('[SettingsList] Failed to load theme:', error);
    }
  }

  /**
   * 渲染设置菜单
   */
  _render() {
    this.clear();

    // 主题切换
    this.addItem({
      icon: '🌓',
      text: '主题设置',
      action: 'toggle-theme',
      tooltip: '切换主题'
    });

    // 模型设置
    this.addItem({
      icon: '🤖',
      text: '模型设置',
      action: 'open-settings',
      tooltip: '配置 AI 模型和 API'
    });

    // 分隔符
    this.addDivider();

    // 关于
    this.addItem({
      icon: 'ℹ️',
      text: '关于 Cowork',
      action: 'open-about',
      tooltip: '版本信息'
    });
  }

  /**
   * 更新主题状态
   */
  updateTheme(theme) {
    this.currentTheme = theme;
    this._render();
  }
}

// 导出到全局
window.SettingsList = SettingsList;
