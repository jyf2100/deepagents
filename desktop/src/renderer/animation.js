/**
 * 动画控制器
 *
 * 管理温暖自然 UI 的所有动画效果，包括：
 * - 自动检测用户的动画偏好（prefers-reduced-motion）
 * - 启用/禁用所有 CSS 过渡动画
 * - 为特定元素添加动画类
 *
 * @class AnimationController
 * @example
 * const controller = new AnimationController();
 * controller.animateMessage(messageElement);
 */
class AnimationController {
  constructor() {
    this.animationsEnabled = true;
    this.reducedMotion = false;
    this.init();
  }

  /**
   * 初始化动画控制器
   * 检测用户的系统动画偏好，并监听偏好变化
   */
  init() {
    // 检测用户是否偏好减少动画
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.reducedMotion = true;
      this.disableAnimations();
    }

    // 监听系统动画偏好变化
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      if (e.matches) {
        this.disableAnimations();
      } else {
        this.enableAnimations();
      }
    });
  }

  /**
   * 禁用所有动画效果
   * 通过将 CSS 过渡时间设置为 0s 来实现
   */
  disableAnimations() {
    // 禁用所有动画
    document.documentElement.style.setProperty('--transition-fast', '0s');
    document.documentElement.style.setProperty('--transition-normal', '0s');
    document.documentElement.style.setProperty('--transition-slow', '0s');
    this.animationsEnabled = false;
    console.log('[AnimationController] Animations disabled');
  }

  /**
   * 启用所有动画效果
   * 恢复默认的 CSS 过渡时间
   */
  enableAnimations() {
    // 恢复动画
    document.documentElement.style.setProperty('--transition-fast', '0.15s var(--ease-out)');
    document.documentElement.style.setProperty('--transition-normal', '0.2s var(--ease-in-out)');
    document.documentElement.style.setProperty('--transition-slow', '0.3s var(--ease-in-out)');
    this.animationsEnabled = true;
    console.log('[AnimationController] Animations enabled');
  }

  /**
   * 为消息添加进入动画
   * @param {HTMLElement} messageElement - 消息元素
   */
  animateMessage(messageElement) {
    if (!this.animationsEnabled) return;
    messageElement.classList.add('message-animating');
    setTimeout(() => {
      messageElement.classList.remove('message-animating');
    }, 500);
  }

  /**
   * 为卡片添加悬停动画效果
   * @param {HTMLElement} cardElement - 卡片元素
   * @param {boolean} isHovering - 是否悬停
   */
  animateCardHover(cardElement, isHovering) {
    if (!this.animationsEnabled) return;
    if (isHovering) {
      cardElement.style.transform = 'translateY(-4px) scale(1.02)';
    } else {
      cardElement.style.transform = '';
    }
  }
}

// 导出全局实例
window.animationController = new AnimationController();
