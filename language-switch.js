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

const LANG_KEY = 'mw_lang';
function getLang() { try { return localStorage.getItem(LANG_KEY) || 'zh'; } catch (_) { return 'zh'; } }
function applyLangToUI() {
  const authUser = document.getElementById('auth-user');
  const zhCtrls = document.getElementById('lc-sync-controls');
  const zhMenuCtrls = document.getElementById('lc-sync-controls-menu');
  if (!authUser || authUser.style.display === 'none') return;
  // 始终显示中文同步控制区域，不受语言设置影响
  if (zhCtrls) zhCtrls.style.display = 'inline-flex';
  if (zhMenuCtrls) zhMenuCtrls.style.display = 'flex';
}
document.addEventListener('DOMContentLoaded', function () {
  var sel = document.getElementById('lang-switch');
  var selCompact = document.getElementById('lang-switch-compact');

  if (sel) {
    try { sel.value = getLang(); } catch (_) { }
    sel.addEventListener('change', function () {
      try { localStorage.setItem(LANG_KEY, sel.value); } catch (_) { }
      // 使用i18n管理器切换语言，这会触发所有监听器
      if (window.i18nManager && window.i18nManager.setLanguage) {
        window.i18nManager.setLanguage(sel.value);
      }
      applyLangToUI();
    });
  }

  if (selCompact) {
    try { selCompact.value = getLang(); } catch (_) { }
    selCompact.addEventListener('change', function () {
      try { localStorage.setItem(LANG_KEY, selCompact.value); } catch (_) { }
      // 使用i18n管理器切换语言，这会触发所有监听器
      if (window.i18nManager && window.i18nManager.setLanguage) {
        window.i18nManager.setLanguage(selCompact.value);
      }
      applyLangToUI();
    });
  }

  applyLangToUI();
  window.addEventListener('storage', function (e) { if (e.key && e.key.startsWith('AV/')) setTimeout(applyLangToUI, 200); });
  window.__mw_applyLangToUI = applyLangToUI;

  // 同步语言选择器状态（i18n管理器已在脚本加载时自动初始化）
  if (window.i18nManager && window.i18nManager.isInitialized) {
    const currentLang = window.i18nManager.getCurrentLanguage();
    if (sel) sel.value = currentLang;
    if (selCompact) selCompact.value = currentLang;
  }
});