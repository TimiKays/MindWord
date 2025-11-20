const LANG_KEY = 'mw_lang';
function getLang() { try { return localStorage.getItem(LANG_KEY) || 'zh'; } catch (_) { return 'zh'; } }
function applyLangToUI() {
  const lang = getLang();
  const authUser = document.getElementById('auth-user');
  const enCtrls = document.getElementById('cloud-sync-controls');
  const zhCtrls = document.getElementById('lc-sync-controls');
  const enMenuCtrls = document.getElementById('cloud-sync-controls-menu');
  const zhMenuCtrls = document.getElementById('lc-sync-controls-menu');
  if (!authUser || authUser.style.display === 'none') return;
  if (lang === 'zh') {
    if (enCtrls) enCtrls.style.display = 'none';
    if (zhCtrls) zhCtrls.style.display = 'inline-flex';
    if (enMenuCtrls) enMenuCtrls.style.display = 'none';
    if (zhMenuCtrls) zhMenuCtrls.style.display = 'flex';
  }
  else {
    if (enCtrls) enCtrls.style.display = 'inline-flex';
    if (zhCtrls) zhCtrls.style.display = 'none';
    if (enMenuCtrls) enMenuCtrls.style.display = 'flex';
    if (zhMenuCtrls) zhMenuCtrls.style.display = 'none';
  }
}
document.addEventListener('DOMContentLoaded', function () {
  var sel = document.getElementById('lang-switch');
  if (sel) {
    try { sel.value = getLang(); } catch (_) { }
    sel.addEventListener('change', function () {
      try { localStorage.setItem(LANG_KEY, sel.value); } catch (_) { }
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