/**
 * MindWord 国际化语言管理器
 * 提供全局的语言切换和文案管理功能
 */
class I18nManager {
  constructor() {
    this.currentLanguage = this.getStoredLanguage() || this.detectBrowserLanguage() || 'zh';
    this.locales = {};
    this.listeners = [];
    this.isInitialized = false;
  }

  /**
   * 初始化语言管理器
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // 加载语言配置
      await this.loadLocales();

      // 等待DOM完全加载
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }

      // 应用当前语言
      this.applyLanguage(this.currentLanguage);

      this.isInitialized = true;
      console.log(`[I18nManager] Initialized with language: ${this.currentLanguage}`);
    } catch (error) {
      console.error('[I18nManager] Initialization failed:', error);
      // 回退到中文
      this.currentLanguage = 'zh';
    }
  }

  /**
   * 加载语言配置文件
   */
  async loadLocales() {
    // 如果已经通过script标签加载了语言配置
    if (typeof window !== 'undefined' && window.i18nLocales) {
      this.locales = window.i18nLocales;
      return;
    }

    // 动态加载语言配置文件
    try {
      const script = document.createElement('script');
      script.src = 'i18n/locales.js';
      script.async = true;

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      // 等待全局变量设置
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (window.i18nLocales) {
            clearInterval(checkInterval);
            this.locales = window.i18nLocales;
            resolve();
          }
        }, 50);

        // 超时处理
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 2000);
      });
    } catch (error) {
      console.error('[I18nManager] Failed to load locales:', error);
      throw error;
    }
  }

  /**
   * 检测浏览器语言
   */
  detectBrowserLanguage() {
    if (typeof navigator === 'undefined') return null;

    const languages = navigator.languages || [navigator.language || navigator.userLanguage];

    for (const lang of languages) {
      const languageCode = lang.toLowerCase().split('-')[0];
      if (languageCode === 'zh') return 'zh';
      if (languageCode === 'en') return 'en';
    }

    return null;
  }

  /**
   * 获取存储的语言设置
   */
  getStoredLanguage() {
    try {
      return localStorage.getItem('mindword-language');
    } catch (error) {
      console.warn('[I18nManager] Failed to get stored language:', error);
      return null;
    }
  }

  /**
   * 存储语言设置
   */
  storeLanguage(language) {
    try {
      localStorage.setItem('mindword-language', language);
    } catch (error) {
      console.warn('[I18nManager] Failed to store language:', error);
    }
  }

  /**
   * 切换语言
   */
  async setLanguage(language) {
    if (!this.isInitialized) {
      console.warn('[I18nManager] Not initialized yet');
      return;
    }

    if (!this.locales[language]) {
      console.error(`[I18nManager] Language ${language} not found`);
      return;
    }

    if (this.currentLanguage === language) return;

    this.currentLanguage = language;
    this.storeLanguage(language);

    await this.applyLanguage(language);

    // 通知所有监听器
    this.notifyListeners(language);

    console.log(`[I18nManager] Language changed to: ${language}`);
  }

  /**
   * 应用语言到页面
   */
  async applyLanguage(language) {
    if (!this.locales[language]) return;

    // 更新HTML lang属性
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';

    // 等待DOM完全加载后再更新翻译
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve);
        }
      });
    }

    // 延迟一下确保所有动态内容都加载完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 更新页面上的所有翻译元素
    this.updatePageTranslations();

    // 更新页面标题
    this.updatePageTitle();

    // 更新所有语言按钮的状态
    this.updateLanguageButtons();
  }

  /**
   * 获取翻译文本
   */
  t(key, fallback = '') {
    if (!this.isInitialized) {
      return fallback || key;
    }

    const keys = key.split('.');
    let value = this.locales[this.currentLanguage];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return fallback || key;
      }
    }

    return typeof value === 'string' ? value : (fallback || key);
  }

  /**
   * 获取当前语言
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  /**
   * 获取可用语言列表
   */
  getAvailableLanguages() {
    return Object.keys(this.locales).map(lang => ({
      code: lang,
      name: lang === 'zh' ? '中文' : 'EN'
    }));
  }

  /**
   * 添加语言变化监听器
   */
  addLanguageChangeListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * 移除语言变化监听器
   */
  removeLanguageChangeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器
   */
  notifyListeners(newLanguage) {
    this.listeners.forEach(callback => {
      try {
        callback(newLanguage);
      } catch (error) {
        console.error('[I18nManager] Error in language change listener:', error);
      }
    });
  }

  /**
   * 更新页面上的所有翻译元素
   */
  updatePageTranslations() {
    // 更新所有带有 data-i18n 属性的元素
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.t(key);

      if (element.tagName === 'INPUT' && element.type === 'text') {
        element.placeholder = translation;
      } else {
        element.textContent = translation;
      }
    });

    // 更新所有带有 data-i18n-placeholder 属性的输入元素
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      element.placeholder = this.t(key);
    });

    // 更新所有带有 data-i18n-title 属性的元素
    const titleElements = document.querySelectorAll('[data-i18n-title]');
    titleElements.forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      element.title = this.t(key);
    });

    // 更新所有带有 data-i18n-value 属性的元素
    const valueElements = document.querySelectorAll('[data-i18n-value]');
    valueElements.forEach(element => {
      const key = element.getAttribute('data-i18n-value');
      element.value = this.t(key);
    });
  }

  /**
   * 更新页面标题
   */
  updatePageTitle() {
    const titleElement = document.querySelector('title');
    if (titleElement && titleElement.hasAttribute('data-i18n')) {
      const key = titleElement.getAttribute('data-i18n');
      document.title = this.t(key);
    }
  }

  /**
   * 更新所有语言按钮的状态
   */
  updateLanguageButtons() {
    // 更新桌面端语言按钮
    const desktopButtons = document.querySelectorAll('.language-btn');
    desktopButtons.forEach(button => {
      const lang = button.getAttribute('data-lang');
      if (lang === this.currentLanguage) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    // 更新下拉框语言选择器（PC端）
    const langSelect = document.getElementById('lang-switch');
    if (langSelect) {
      langSelect.value = this.currentLanguage;
    }

    // 更新移动端下拉框语言选择器
    const langSelectMobile = document.getElementById('lang-switch-mobile');
    if (langSelectMobile) {
      langSelectMobile.value = this.currentLanguage;
    }

    // 更新移动端语言按钮（兼容旧版按钮模式）
    const mobileZhButton = document.querySelector('.language-btn-zh');
    const mobileEnButton = document.querySelector('.language-btn-en');

    if (mobileZhButton && mobileEnButton) {
      if (this.currentLanguage === 'zh') {
        mobileZhButton.classList.add('bg-primary', 'text-white');
        mobileZhButton.classList.remove('text-dark', 'hover:bg-gray-200');
        mobileEnButton.classList.remove('bg-primary', 'text-white');
        mobileEnButton.classList.add('text-dark', 'hover:bg-gray-200');
      } else {
        mobileEnButton.classList.add('bg-primary', 'text-white');
        mobileEnButton.classList.remove('text-dark', 'hover:bg-gray-200');
        mobileZhButton.classList.remove('bg-primary', 'text-white');
        mobileZhButton.classList.add('text-dark', 'hover:bg-gray-200');
      }
    }
  }

  /**
   * 创建语言切换按钮
   */
  createLanguageSelector(options = {}) {
    const {
      className = 'language-selector',
      showText = true,
      showFlags = false
    } = options;

    const container = document.createElement('div');
    container.className = className;

    const languages = this.getAvailableLanguages();

    languages.forEach(lang => {
      const button = document.createElement('button');
      button.className = `language-btn ${this.currentLanguage === lang.code ? 'active' : ''}`;
      button.setAttribute('data-lang', lang.code);

      if (showFlags) {
        const flag = document.createElement('span');
        flag.className = 'flag';
        flag.textContent = lang.code === 'zh' ? '🇨🇳' : '🇬🇧';
        button.appendChild(flag);
      }

      if (showText) {
        const text = document.createElement('span');
        text.textContent = lang.name;
        button.appendChild(text);
      }

      button.addEventListener('click', () => {
        this.setLanguage(lang.code);
      });

      container.appendChild(button);
    });

    return container;
  }
}

// 创建全局语言管理器实例
window.i18nManager = new I18nManager();

// 初始化语言管理器
async function initializeI18n() {
  try {
    await window.i18nManager.init();
    console.log('[I18nManager] Successfully initialized');

    // 额外保险：在页面完全加载后再次应用翻译
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        console.log('[I18nManager] Applying translations after page load');
        window.i18nManager.updatePageTranslations();
        window.i18nManager.updatePageTitle();
        window.i18nManager.updateLanguageButtons();
      });
    }

    // 再添加一个延迟保险机制
    setTimeout(() => {
      console.log('[I18nManager] Applying translations after delay');
      window.i18nManager.updatePageTranslations();
      window.i18nManager.updatePageTitle();
      window.i18nManager.updateLanguageButtons();
    }, 500);

  } catch (error) {
    console.error('[I18nManager] Initialization failed:', error);
  }
}

// 确保在页面完全加载后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeI18n);
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
  // 如果DOM已经加载，延迟一下确保所有资源都加载完成
  setTimeout(initializeI18n, 100);
} else {
  // 备用方案
  window.addEventListener('load', initializeI18n);
}