// desktop/src/renderer/sidebar/skill-list.js

/**
 * SkillList 类 - 管理技能列表
 */
class SkillList extends MenuGroup {
  /**
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super({
      id: 'skills',
      title: '技能管理',
      icon: '⚡',
      ...options
    });

    this.skills = [];
    this.enabledSkills = [];

    // 加载数据
    this.load();
  }

  /**
   * 加载技能列表
   */
  async load() {
    try {
      // 加载所有可用技能
      const skillsResult = await window.deepagents.listSkills();
      if (skillsResult.status === 'success') {
        // 数据结构可能是 result.data.skills 或 result.skills
        this.skills = skillsResult.data?.skills || skillsResult.skills || skillsResult.data || [];
      }

      // 获取当前工作空间的启用的技能
      if (window.currentWorkspaceId) {
        const workspaceResult = await window.deepagents.listWorkspaces();
        if (workspaceResult.status === 'success') {
          const workspaces = workspaceResult.data?.workspaces || workspaceResult.data || [];
          const currentWorkspace = workspaces.find(
            ws => String(ws.id) === String(window.currentWorkspaceId)
          );
          if (currentWorkspace) {
            this.enabledSkills = currentWorkspace.enabled_skills || [];
          }
        }
      }

      this._render();
    } catch (error) {
      console.error('[SkillList] Failed to load:', error);
    }
  }

  /**
   * 刷新数据
   */
  async refresh() {
    await this.load();
  }

  /**
   * 渲染技能列表
   */
  _render() {
    this.clear();

    // 渲染技能列表
    if (this.skills.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'menu-item';
      emptyItem.style.cssText = 'cursor: default; opacity: 0.5;';
      emptyItem.innerHTML = '<span class="menu-item-text" style="font-size: 12px;">暂无技能</span>';
      this.contentElement.appendChild(emptyItem);
    } else {
      this.skills.forEach(skill => {
        const isEnabled = this._isSkillEnabled(skill.name);
        this.addItem({
          icon: isEnabled ? '✓' : '○',
          text: skill.name,
          action: 'toggle-skill',
          data: { skillName: skill.name },
          tooltip: skill.name
        });
      });
    }

    // 添加分隔符
    this.addDivider();

    // 添加"添加技能"按钮
    this.addItem({
      icon: '➕',
      text: '添加技能',
      action: 'open-add-skill-dialog',
      tooltip: '添加新技能'
    });

    // 添加"技能配置"按钮
    this.addItem({
      icon: '⚙️',
      text: '技能配置',
      action: 'open-skills-dialog',
      tooltip: '打开技能配置面板'
    });
  }

  /**
   * 检查技能是否启用
   */
  _isSkillEnabled(skillName) {
    if (this.enabledSkills.includes('*')) return true;
    return this.enabledSkills.includes(skillName);
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
window.SkillList = SkillList;
