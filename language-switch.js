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
  applyLangToUI();
  window.addEventListener('storage', function (e) { if (e.key && e.key.startsWith('AV/')) setTimeout(applyLangToUI, 200); });
  window.__mw_applyLangToUI = applyLangToUI;

  // 同步语言选择器状态（i18n管理器已在脚本加载时自动初始化）
  if (window.i18nManager && window.i18nManager.isInitialized) {
    const currentLang = window.i18nManager.getCurrentLanguage();
    if (sel) sel.value = currentLang;
  }
});