// === 主题管理器 ===
// 管理暗色/亮色主题切换和强调色设置

class ThemeManager {
  constructor() {
    this.currentTheme = 'auto';
    this.accentColor = 'sand';  // 改为默认使用大地色
    this.accentColors = {
      // 温暖自然的强调色系统
      sand: {
        light: '#D4A574',   // 浅金棕（大地色）
        dark: '#E8B87D'     // 浅金棕（深色模式更亮）
      },
      rose: {
        light: '#FF8FAB',   // 玫瑰粉
        dark: '#FFB5BA'
      },
      wood: {
        light: '#BC8F5F',   // 温暖木调
        dark: '#DEB887'
      },
      sunset: {
        light: '#FF6B6B',   // 日落红
        dark: '#FF8FAB'
      },
      mint: {
        light: '#6BCF7F',   // 薄荷绿
        dark: '#8FD99E'
      },
      sky: {
        light: '#87CEEB',   // 天空蓝
        dark: '#A8D8EA'
      }
    };
  }

  /**
   * 初始化主题管理器
   * 从配置加载主题设置并应用
   */
  async init() {
    console.log('[ThemeManager] Initializing...');

    try {
      // 从配置加载主题设置
      const config = await window.deepagents.getConfig();
      this.currentTheme = config.theme || 'auto';
      this.accentColor = config.accentColor || 'sand';

      console.log('[ThemeManager] Loaded config:', { theme: this.currentTheme, accentColor: this.accentColor });

      // 监听系统主题变化
      window.deepagents.onThemeChanged((data) => {
        console.log('[ThemeManager] System theme changed:', data);
        this.applyTheme(data.theme);
      });

      // 监听强调色变化
      window.deepagents.onAccentColorChanged((data) => {
        console.log('[ThemeManager] Accent color changed:', data);
        this.accentColor = data.colorName;
        this.applyAccentColor();
      });

      // 应用初始主题
      await this.applyTheme(await this.getEffectiveTheme());

      console.log('[ThemeManager] Initialized successfully');
    } catch (error) {
      console.error('[ThemeManager] Failed to initialize:', error);
      // 使用默认主题
      this.applyTheme('light');
    }
  }

  /**
   * 获取有效的主题（处理 'auto' 模式）
   */
  async getEffectiveTheme() {
    if (this.currentTheme === 'auto') {
      const themeInfo = await window.deepagents.getTheme();
      return themeInfo.systemTheme;
    }
    return this.currentTheme;
  }

  /**
   * 应用主题到 DOM
   */
  applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(`theme-${theme}`);

    // 应用强调色
    this.applyAccentColor();

    console.log('[ThemeManager] Applied theme:', theme);
  }

  /**
   * 应用强调色
   */
  applyAccentColor() {
    const root = document.documentElement;
    const theme = document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light';
    const colors = this.accentColors[this.accentColor];
    const colorValue = theme === 'dark' ? colors.dark : colors.light;

    root.style.setProperty('--accent-color', colorValue);

    // 更新悬停颜色（稍微亮一点或暗一点）
    const hoverColor = theme === 'dark' ? this.adjustBrightness(colors.dark, 20) : this.adjustBrightness(colors.light, -20);
    root.style.setProperty('--accent-hover', hoverColor);

    console.log('[ThemeManager] Applied accent color:', this.accentColor, colorValue);
  }

  /**
   * 调整颜色亮度
   * @param {string} color - 十六进制颜色值
   * @param {number} amount - 调整量（正数变亮，负数变暗）
   */
  adjustBrightness(color, amount) {
    let usePound = false;
    if (color[0] === '#') {
      color = color.slice(1);
      usePound = true;
    }

    const num = parseInt(color, 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;

    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;

    const result = (g | (b << 8) | (r << 16)).toString(16);
    while (result.length < 6) {
      return (usePound ? '#' : '') + '0' + result;
    }
    return (usePound ? '#' : '') + result;
  }

  /**
   * 设置主题
   */
  async setTheme(theme) {
    console.log('[ThemeManager] Setting theme:', theme);
    this.currentTheme = theme;
    await window.deepagents.setTheme(theme);
    await this.applyTheme(await this.getEffectiveTheme());
  }

  /**
   * 设置强调色
   */
  async setAccentColor(colorName) {
    console.log('[ThemeManager] Setting accent color:', colorName);
    this.accentColor = colorName;
    await window.deepagents.setAccentColor(colorName);
    this.applyAccentColor();
  }

  /**
   * 获取当前主题信息
   */
  async getThemeInfo() {
    const themeInfo = await window.deepagents.getTheme();
    return {
      current: this.currentTheme,
      system: themeInfo.systemTheme,
      effective: await this.getEffectiveTheme(),
      accentColor: this.accentColor
    };
  }
}

// 导出全局实例
window.themeManager = new ThemeManager();
