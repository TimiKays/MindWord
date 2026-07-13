/**
 * MindWord - 树心 | 像画图一样写文档的思维导图写作工具
 * GitHub: https://github.com/TimiKays/MindWord
 * 
 * Copyright 2025 Timi Kays
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var MW_ORIGIN = window.location.origin;

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
   * 初始化语言管理器（同步版本）
   */
  init() {
    if (this.isInitialized) return;

    try {
      // 同步加载语言配置
      this.loadLocalesSync();

      // 立即应用当前语言（无需等待DOM加载）
      this.applyLanguageSync(this.currentLanguage);

      this.isInitialized = true;
      console.log(`[I18nManager] Initialized with language: ${this.currentLanguage}`);
    } catch (error) {
      console.error('[I18nManager] Initialization failed:', error);
      // 回退到中文
      this.currentLanguage = 'zh';
    }
  }

  /**
   * 同步加载语言配置文件
   */
  loadLocalesSync() {
    // 直接使用已加载的语言配置（locales.js已在head中同步加载）
    if (typeof window !== 'undefined' && window.i18nLocales) {
      this.locales = window.i18nLocales;
      return;
    }

    // 如果未找到语言配置，抛出错误
    throw new Error('Language locales not found. Please ensure i18n/locales.js is loaded before i18n-manager.js');
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
      if (languageCode === 'es') return 'es';
    }

    return null;
  }

  /**
   * 获取存储的语言设置
   */
  getStoredLanguage() {
    try {
      return localStorage.getItem('mw_lang');
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
      localStorage.setItem('mw_lang', language);
    } catch (error) {
      console.warn('[I18nManager] Failed to store language:', error);
    }
  }

  /**
   * 切换语言（同步版本）
   */
  setLanguage(language) {
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

    // 同步应用语言
    this.applyLanguageSync(language);

    // 通知所有监听器
    this.notifyListeners(language);

    // 向所有iframe发送语言变化通知
    this.notifyIframes(language);

    console.log(`[I18nManager] Language changed to: ${language}`);
  }

  /**
   * 同步应用语言到页面（无延迟版本）
   */
  applyLanguageSync(language) {
    if (!this.locales[language]) return;

    // 更新HTML lang属性
    const langMap = {
      'zh': 'zh-CN',
      'en': 'en',
      'es': 'es'
    };
    document.documentElement.lang = langMap[language] || 'en';

    // 立即更新页面上的所有翻译元素（无需等待DOM加载）
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
      name: lang === 'zh' ? '中文' : (lang === 'en' ? 'EN' : 'ES')
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

    // 专门更新右键菜单的翻译（即使菜单是隐藏的）
    this.updateContextMenuTranslations();
  }

  /**
   * 更新右键菜单的翻译
   */
  updateContextMenuTranslations() {
    const contextMenu = document.getElementById('nodeContextMenu');
    if (!contextMenu) return;

    // 获取菜单中所有带有 data-i18n 属性的元素
    const menuElements = contextMenu.querySelectorAll('[data-i18n]');
    menuElements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.t(key);

      if (translation && translation !== key) {
        element.textContent = translation;
      }
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

    // 更新app页面的紧凑语言选择器
    const langSelectCompact = document.getElementById('lang-switch-compact');
    if (langSelectCompact) {
      langSelectCompact.value = this.currentLanguage;
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

  /**
   * 向所有iframe发送语言变化通知
   */
  notifyIframes(language) {
    try {
      // 获取所有iframe元素
      const iframes = document.querySelectorAll('iframe');

      iframes.forEach(iframe => {
        try {
          // 检查iframe是否加载完成
          if (iframe.contentWindow) {
            // 发送语言变化消息到iframe
            iframe.contentWindow.postMessage({
              type: 'languageChange',
              language: language,
              source: 'parent'
            }, MW_ORIGIN);
            console.log(`[I18nManager] Sent language change notification to iframe: ${language}`);
          }
        } catch (error) {
          console.warn('[I18nManager] Failed to send message to iframe:', error);
        }
      });
    } catch (error) {
      console.error('[I18nManager] Error notifying iframes:', error);
    }
  }
}

// 创建全局语言管理器实例
window.i18nManager = new I18nManager();

// 简化初始化函数
function initializeI18n() {
  try {
    // 立即初始化（同步执行）
    window.i18nManager.init();
    console.log('[I18nManager] Successfully initialized');
  } catch (error) {
    console.error('[I18nManager] Initialization failed:', error);
  }
}

// 立即执行初始化（无需等待任何事件）
initializeI18n();

// 创建全局 i18n 对象，兼容使用 i18n.t() 的代码
window.i18n = {
  t: function (key) {
    if (window.i18nManager && window.i18nManager.isInitialized) {
      return window.i18nManager.t(key);
    }
    // 如果 i18nManager 未初始化，返回 key 本身作为后备
    return key;
  }
};