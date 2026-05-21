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

/**
 * 皮肤管理器 - 负责思维导图皮肤的注册、切换和持久化
 * @class SkinManager
 */
class SkinManager {
  constructor() {
    // 皮肤注册表
    this.skins = new Map();
    
    // 当前皮肤
    this.currentSkin = null;
    
    // 存储键名
    this.storageKey = 'mindword_mindmap_skin';
    
    // 已加载的CSS文件
    this.loadedCssFiles = new Set();
    
    // 初始化
    this.init();
  }
  
  /**
   * 注册内置皮肤
   * @private
   */
  registerBuiltInSkins() {
    const builtInSkins = [
      {
        id: 'modern-minimal',
        name: { zh: '现代极简', en: 'Modern Minimal' },
        type: 'built-in',
        cssFile: '/jsmind/themes/modern-minimal.css',
        themeClass: 'modern-minimal',
        color: '#e8eaed',
        description: { zh: '白色背景，简洁清晰', en: 'White background, clean and simple' }
      },
      {
        id: 'primary',
        name: { zh: '经典蓝', en: 'Classic Blue' },
        type: 'built-in',
        cssFile: '/jsmind/themes/primary.css',
        themeClass: 'primary',
        color: '#4285f4',
        description: { zh: '经典蓝色主题，专业稳重', en: 'Classic blue theme, professional' }
      },
      {
        id: 'dark',
        name: { zh: '深色模式', en: 'Dark Mode' },
        type: 'built-in',
        cssFile: '/jsmind/themes/dark.css',
        themeClass: 'dark',
        color: '#2d2d2d',
        description: { zh: '深色背景，护眼舒适', en: 'Dark background, eye-friendly' }
      },
      {
        id: 'colorful',
        name: { zh: '彩虹多彩', en: 'Colorful' },
        type: 'built-in',
        cssFile: '/jsmind/themes/colorful.css',
        themeClass: 'colorful',
        color: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
        description: { zh: '多彩层级，活泼生动', en: 'Colorful levels, lively' }
      },
      {
        id: 'warm',
        name: { zh: '暖色调', en: 'Warm Tone' },
        type: 'built-in',
        cssFile: '/jsmind/themes/warm.css',
        themeClass: 'warm',
        color: '#faf8f5',
        description: { zh: '温暖米色，舒适阅读', en: 'Warm beige, comfortable reading' }
      },
      {
        id: 'forest',
        name: { zh: '森林绿', en: 'Forest Green' },
        type: 'built-in',
        cssFile: '/jsmind/themes/forest.css',
        themeClass: 'forest',
        color: '#4caf50',
        description: { zh: '清新绿色，自然放松', en: 'Fresh green, natural and relaxing' }
      }
    ];
    
    builtInSkins.forEach(skin => this.registerSkin(skin));
  }
  
  /**
   * 注册皮肤
   * @param {Object} skinConfig - 皮肤配置对象
   * @param {string} skinConfig.id - 皮肤唯一标识
   * @param {Object} skinConfig.name - 皮肤名称 { zh: '中文', en: 'English' }
   * @param {string} skinConfig.type - 皮肤类型: 'built-in' | 'custom'
   * @param {string} [skinConfig.cssFile] - CSS文件路径
   * @param {string} skinConfig.themeClass - 主题类名
   * @param {string} skinConfig.color - 预览颜色
   * @param {Object} [skinConfig.description] - 皮肤描述
   */
  registerSkin(skinConfig) {
    if (!skinConfig.id || !skinConfig.themeClass) {
      console.error('[SkinManager] 皮肤注册失败: id 和 themeClass 为必填项');
      return;
    }
    
    this.skins.set(skinConfig.id, skinConfig);
  }
  
  /**
   * 切换皮肤
   * @param {string} skinId - 皮肤ID
   * @returns {Promise<boolean>} - 是否切换成功
   */
  async switchSkin(skinId) {
    const skin = this.skins.get(skinId);
    if (!skin) {
      console.error(`[SkinManager] 皮肤 "${skinId}" 不存在`);
      return false;
    }
    
    if (this.currentSkin && this.currentSkin.id === skinId) {
      this.applyThemeClass(skin.themeClass);
      return true;
    }
    
    try {
      if (skin.cssFile) {
        await this.loadCssFile(skin.cssFile);
      }
      
      this.applyThemeClass(skin.themeClass);
      
      this.currentSkin = skin;
      
      localStorage.setItem(this.storageKey, skinId);
      
      this.updateSkinSelectorUI(skinId);
      
      window.dispatchEvent(new CustomEvent('skinChanged', { 
        detail: { skinId, skin } 
      }));
      
      console.log(`[SkinManager] 皮肤已切换至: ${skin.name.zh}`);
      return true;
      
    } catch (error) {
      console.error('[SkinManager] 切换皮肤失败:', error);
      this.applyThemeClass(skin.themeClass);
      this.currentSkin = skin;
      localStorage.setItem(this.storageKey, skinId);
      this.updateSkinSelectorUI(skinId);
      return false;
    }
  }
  
  /**
   * 加载 CSS 文件
   * @param {string} url - CSS文件URL
   * @returns {Promise<void>}
   * @private
   */
  loadCssFile(url) {
    return new Promise((resolve, reject) => {
      if (this.loadedCssFiles.has(url) || document.querySelector(`link[href="${url}"]`)) {
        this.loadedCssFiles.add(url);
        resolve();
        return;
      }
      
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = url;
      
      let settled = false;
      
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.warn(`[SkinManager] CSS 加载超时，强制继续: ${url}`);
          resolve();
        }
      }, 3000);
      
      link.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.loadedCssFiles.add(url);
          resolve();
        }
      };
      
      link.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`加载 CSS 文件失败: ${url}`));
        }
      };
      
      document.head.appendChild(link);
    });
  }
  
  /**
   * 卸载当前皮肤
   * @private
   */
  unloadCurrentSkin() {
    // 移除动态加载的 CSS（可选，保留缓存以提高性能）
    // 注意：这里我们选择保留已加载的CSS，只是切换类名
  }
  
  /**
   * 应用主题类名
   * @param {string} themeClass - 主题类名
   * @private
   */
  applyThemeClass(themeClass) {
    const jmContainer = document.querySelector('jmnodes');
    if (jmContainer) {
      // 移除所有主题类
      const classes = jmContainer.className.split(' ');
      const newClasses = classes.filter(c => !c.startsWith('theme-'));
      
      // 添加新主题类
      newClasses.push(`theme-${themeClass}`);
      jmContainer.className = newClasses.join(' ');
    }
    
    // 同时更新 body 的 data-theme 属性，用于全局样式
    document.body.setAttribute('data-mindmap-theme', themeClass);
  }
  
  /**
   * 更新皮肤选择器 UI
   * @param {string} skinId - 当前皮肤ID
   * @private
   */
  updateSkinSelectorUI(skinId) {
    // 更新下拉菜单中的选中状态
    document.querySelectorAll('.skin-item').forEach(item => {
      const itemSkinId = item.getAttribute('data-skin');
      const checkIcon = item.querySelector('.skin-check');
      
      if (itemSkinId === skinId) {
        item.classList.add('active');
        if (checkIcon) checkIcon.style.display = 'inline-block';
      } else {
        item.classList.remove('active');
        if (checkIcon) checkIcon.style.display = 'none';
      }
    });
    
    // 更新按钮上的显示
    const skin = this.skins.get(skinId);
    if (skin) {
      const btnDot = document.querySelector('.skin-selector .skin-color-dot');
      const btnText = document.querySelector('.skin-selector .skin-name');
      
      if (btnDot) {
        btnDot.style.background = skin.color;
      }
      if (btnText) {
        // 根据当前语言获取名称
        const lang = window.i18nManager ? window.i18nManager.getCurrentLanguage() : 'zh';
        btnText.textContent = skin.name[lang] || skin.name.zh;
      }
    }
  }
  
  /**
   * 获取所有可用皮肤
   * @returns {Array<Object>} - 皮肤配置数组
   */
  getAllSkins() {
    return Array.from(this.skins.values());
  }
  
  /**
   * 获取当前皮肤
   * @returns {Object|null} - 当前皮肤配置
   */
  getCurrentSkin() {
    return this.currentSkin;
  }
  
  /**
   * 获取当前皮肤ID
   * @returns {string|null} - 当前皮肤ID
   */
  getCurrentSkinId() {
    return this.currentSkin ? this.currentSkin.id : null;
  }
  
  /**
   * 根据ID获取皮肤
   * @param {string} skinId - 皮肤ID
   * @returns {Object|undefined} - 皮肤配置
   */
  getSkin(skinId) {
    return this.skins.get(skinId);
  }
  
  /**
   * 获取皮肤显示名称
   * @param {string} skinId - 皮肤ID
   * @param {string} [lang] - 语言代码
   * @returns {string} - 皮肤名称
   */
  getSkinName(skinId, lang) {
    const skin = this.skins.get(skinId);
    if (!skin) return skinId;
    
    const currentLang = lang || (window.i18nManager ? window.i18nManager.getCurrentLanguage() : 'zh');
    return skin.name[currentLang] || skin.name.zh || skinId;
  }
  
  /**
   * 生成皮肤选择器 HTML
   * @returns {string} - HTML字符串
   */
  generateSkinSelectorHTML() {
    const skins = this.getAllSkins();
    const currentLang = window.i18nManager ? window.i18nManager.getCurrentLanguage() : 'zh';
    
    let html = `
      <div class="skin-selector dropdown">
        <button class="btn btn-sm btn-outline-secondary dropdown-toggle skin-selector-btn" 
                type="button" id="skinSelectorBtn" data-toggle="dropdown" 
                aria-haspopup="true" aria-expanded="false"
                title="${currentLang === 'zh' ? '切换主题' : 'Switch Theme'}">
          <span class="skin-color-dot"></span>
          <span class="skin-name">${currentLang === 'zh' ? '主题' : 'Theme'}</span>
        </button>
        <div class="skin-dropdown" aria-labelledby="skinSelectorBtn">
          <h6 class="dropdown-header">${currentLang === 'zh' ? '选择主题' : 'Select Theme'}</h6>
    `;
    
    skins.forEach(skin => {
      const name = skin.name[currentLang] || skin.name.zh;
      const desc = skin.description ? (skin.description[currentLang] || skin.description.zh) : '';
      const isActive = this.currentSkin && this.currentSkin.id === skin.id;
      
      html += `
        <a class="dropdown-item skin-item ${isActive ? 'active' : ''}" href="#" data-skin="${skin.id}" title="${desc}">
          <span class="skin-color-preview" style="background: ${skin.color}"></span>
          <span class="skin-label">${name}</span>
          <i class="skin-check fa fa-check" style="display: ${isActive ? 'inline-block' : 'none'}"></i>
        </a>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
    
    return html;
  }
  
  /**
   * 绑定皮肤选择器事件
   * @param {HTMLElement} [container] - 容器元素
   */
  bindSkinSelectorEvents(container) {
    const selectorContainer = container || document;
    
    // 获取按钮和下拉菜单
    const btn = selectorContainer.querySelector('#skinSelectorBtn');
    const dropdown = selectorContainer.querySelector('.skin-dropdown');
    
    if (btn && dropdown) {
      // 点击按钮时计算并设置下拉菜单位置
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = btn.getBoundingClientRect();
        const dropdownWidth = 180; // 最小宽度
        
        // 计算下拉菜单应该显示的位置
        let left = rect.left;
        let top = rect.bottom + 4;
        
        // 确保下拉菜单不会超出屏幕右侧
        if (left + dropdownWidth > window.innerWidth) {
          left = window.innerWidth - dropdownWidth - 10;
        }
        
        // 确保下拉菜单不会超出屏幕底部
        const dropdownHeight = dropdown.offsetHeight || 250;
        if (top + dropdownHeight > window.innerHeight) {
          top = rect.top - dropdownHeight - 4;
        }
        
        dropdown.style.top = top + 'px';
        dropdown.style.left = left + 'px';
        dropdown.style.right = 'auto';
        dropdown.classList.toggle('show');
      });
      
      // 点击其他地方关闭下拉菜单
      document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
          dropdown.classList.remove('show');
        }
      });
    }
    
    // 绑定皮肤项点击事件
    selectorContainer.querySelectorAll('.skin-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const skinId = item.getAttribute('data-skin');
        if (skinId) {
          this.switchSkin(skinId);
          // 关闭下拉菜单
          if (dropdown) {
            dropdown.classList.remove('show');
          }
        }
      });
    });
  }
  
  /**
   * 监听语言变化，更新皮肤名称显示
   * @private
   */
  setupLanguageListener() {
    window.addEventListener('languageChanged', () => {
      if (this.currentSkin) {
        this.updateSkinSelectorUI(this.currentSkin.id);
      }
    });
  }
  
  /**
   * 初始化
   * @private
   */
  init() {
    // 注册内置皮肤
    this.registerBuiltInSkins();
    
    // 设置语言监听
    this.setupLanguageListener();
    
    // 读取本地存储的皮肤设置
    const savedSkin = localStorage.getItem(this.storageKey);
    
    // 延迟加载皮肤，确保 DOM 已准备好
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.loadInitialSkin(savedSkin);
      });
    } else {
      this.loadInitialSkin(savedSkin);
    }
  }
  
  /**
   * 加载初始皮肤
   * @param {string} [savedSkin] - 保存的皮肤ID
   * @private
   */
  loadInitialSkin(savedSkin) {
    if (savedSkin && this.skins.has(savedSkin)) {
      this.switchSkin(savedSkin);
    } else {
      // 使用默认皮肤：现代极简
      this.switchSkin('modern-minimal');
    }
  }
}

// 创建全局单例
window.skinManager = new SkinManager();

// 导出模块（如果支持模块化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SkinManager;
}
