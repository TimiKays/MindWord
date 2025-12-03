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

// 验证右键菜单国际化的调试脚本
(function() {
    console.log('=== 右键菜单国际化调试开始 ===');
    
    // 检查i18n管理器是否可用
    if (window.i18nManager) {
        console.log('✓ i18nManager 已加载');
        console.log('当前语言:', window.i18nManager.getCurrentLanguage());
        console.log('可用语言:', window.i18nManager.getAvailableLanguages());
        
        // 检查翻译方法是否存在
        if (typeof window.i18nManager.updateContextMenuTranslations === 'function') {
            console.log('✓ updateContextMenuTranslations 方法存在');
        } else {
            console.log('✗ updateContextMenuTranslations 方法不存在');
        }
    } else {
        console.log('✗ i18nManager 未加载');
    }
    
    // 检查右键菜单元素是否存在
    const contextMenu = document.getElementById('nodeContextMenu');
    if (contextMenu) {
        console.log('✓ 右键菜单元素存在');
        
        // 检查菜单项的data-i18n属性
        const menuItems = contextMenu.querySelectorAll('[data-i18n]');
        console.log('找到 ' + menuItems.length + ' 个带 data-i18n 属性的菜单项');
        
        menuItems.forEach((item, index) => {
            console.log(`菜单项 ${index + 1}: data-i18n="${item.getAttribute('data-i18n')}", 当前文本: "${item.textContent}"`);
        });
    } else {
        console.log('✗ 右键菜单元素不存在');
    }
    
    // 检查翻译配置
    if (window.locales && window.locales.zh && window.locales.en) {
        console.log('✓ 翻译配置已加载');
        
        // 检查contextMenu配置
        const zhContextMenu = window.locales.zh.app?.contextMenu;
        const enContextMenu = window.locales.en.app?.contextMenu;
        
        if (zhContextMenu && enContextMenu) {
            console.log('✓ contextMenu 翻译配置存在');
            console.log('中文配置:', zhContextMenu);
            console.log('英文配置:', enContextMenu);
        } else {
            console.log('✗ contextMenu 翻译配置缺失');
            console.log('中文配置:', zhContextMenu);
            console.log('英文配置:', enContextMenu);
        }
    } else {
        console.log('✗ 翻译配置未加载');
    }
    
    console.log('=== 右键菜单国际化调试结束 ===');
})();