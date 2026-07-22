/**
 * MindWord data safety reminder.
 * Cloud sync and local ZIP export are independent, explicit backup actions.
 */
(function () {
  'use strict';

  const NOTICE_KEY = 'mw_data_safety_notice_v1_until';
  const RECOVERY_URL = 'https://mindword.dpdns.org/recovery/';
  const DAY_MS = 24 * 60 * 60 * 1000;

  const COPY = {
    zh: {
      title: '请为重要数据留一份备份',
      lead: 'MindWord 不会自动同步。无论是否登录，只有主动完成云端同步或导出文件后，才算拥有一份独立备份。',
      risk: '尚未备份的内容只保存在当前浏览器。清理网站数据、更换浏览器或设备、使用无痕模式，以及网站地址迁移，都可能让这些内容无法访问。',
      cloudTitle: '云端备份',
      cloudTag: '需要登录并手动同步',
      cloudDesc: '登录不会自动上传文档。完成重要修改后，请再次点击手动同步。',
      cloudLoggedIn: '立即手动同步',
      cloudLoggedOut: '登录后同步',
      localTitle: '本地 ZIP 备份',
      localTag: '无需登录',
      localDesc: 'Markdown 编辑器可导出当前文档；点击左上角的三根横线图标，进入“我的文档”，可一次导出或导入全部文档的 ZIP。',
      exportAll: '导出全部 ZIP',
      recoveryTitle: '旧地址数据恢复',
      recoveryDesc: '域名迁移后看不到文档？请在原设备、原浏览器打开旧地址恢复页，导出后再到新地址导入。',
      openRecovery: '打开恢复页',
      snooze: '7 天内不再提醒',
      close: '关闭',
      syncing: '正在打开同步...',
      exporting: '正在准备 ZIP...'
    },
    en: {
      title: 'Keep a backup of important work',
      lead: 'MindWord does not sync automatically. Whether or not you are signed in, you only have an independent backup after manually syncing or exporting a file.',
      risk: 'Work that has not been backed up exists only in this browser. Clearing site data, changing browsers or devices, private browsing, or a site address migration can make it inaccessible.',
      cloudTitle: 'Cloud backup',
      cloudTag: 'Sign-in and manual sync required',
      cloudDesc: 'Signing in does not upload documents automatically. Sync again after important changes.',
      cloudLoggedIn: 'Sync now',
      cloudLoggedOut: 'Sign in to sync',
      localTitle: 'Local ZIP backup',
      localTag: 'No sign-in required',
      localDesc: 'Export the current document from the Markdown editor, or export every document as ZIP from My Documents.',
      exportAll: 'Export all ZIP',
      recoveryTitle: 'Recover data from the old address',
      recoveryDesc: 'Missing documents after the address migration? Open the recovery page in the original browser and device, export them, then import them at the new address.',
      openRecovery: 'Open recovery page',
      snooze: 'Remind me in 7 days',
      close: 'Close',
      syncing: 'Opening sync...',
      exporting: 'Preparing ZIP...'
    },
    es: {
      title: 'Guarda una copia de tus datos importantes',
      lead: 'MindWord no sincroniza automaticamente. Inicies sesion o no, solo existe una copia independiente despues de sincronizar manualmente o exportar un archivo.',
      risk: 'Los cambios sin copia solo existen en este navegador. Limpiar los datos del sitio, cambiar de navegador o dispositivo, usar el modo privado o migrar el dominio puede impedir el acceso.',
      cloudTitle: 'Copia en la nube',
      cloudTag: 'Requiere inicio de sesion y sincronizacion manual',
      cloudDesc: 'Iniciar sesion no sube documentos automaticamente. Sincroniza de nuevo despues de cambios importantes.',
      cloudLoggedIn: 'Sincronizar ahora',
      cloudLoggedOut: 'Iniciar sesion para sincronizar',
      localTitle: 'Copia ZIP local',
      localTag: 'No requiere inicio de sesion',
      localDesc: 'Exporta el documento actual desde el editor Markdown o todos los documentos como ZIP desde Mis documentos.',
      exportAll: 'Exportar todo en ZIP',
      recoveryTitle: 'Recuperar datos de la direccion anterior',
      recoveryDesc: 'Si faltan documentos tras la migracion, abre la pagina de recuperacion en el navegador y dispositivo originales, exporta e importa en la nueva direccion.',
      openRecovery: 'Abrir recuperacion',
      snooze: 'Recordar en 7 dias',
      close: 'Cerrar',
      syncing: 'Abriendo sincronizacion...',
      exporting: 'Preparando ZIP...'
    }
  };

  let overlay = null;
  let previousFocus = null;
  let previousOverflow = '';

  function currentLanguage() {
    let language = 'zh';
    try {
      language = localStorage.getItem('mw_lang') || document.documentElement.lang || 'zh';
    } catch (_) { }
    language = String(language).toLowerCase();
    if (language.startsWith('en')) return 'en';
    if (language.startsWith('es')) return 'es';
    return 'zh';
  }

  function copy() {
    return COPY[currentLanguage()] || COPY.zh;
  }

  function isLoggedInLocally() {
    const authUser = document.getElementById('auth-user');
    if (!authUser) return false;
    const display = authUser.style.display || window.getComputedStyle(authUser).display;
    return display !== 'none';
  }

  function shouldAutoOpen(now) {
    const current = Number(now || Date.now());
    try {
      const snoozeUntil = Number(localStorage.getItem(NOTICE_KEY) || 0);
      return !snoozeUntil || current >= snoozeUntil;
    } catch (_) {
      return true;
    }
  }

  function snooze(days) {
    try {
      localStorage.setItem(NOTICE_KEY, String(Date.now() + Number(days || 1) * DAY_MS));
    } catch (_) { }
  }

  function hasBlockingDialog() {
    const ids = [
      'sync-preview-dialog',
      'logout-dialog',
      'delete-confirm-dialog',
      'new-doc-dialog'
    ];
    return ids.some(function (id) {
      const element = document.getElementById(id);
      if (!element) return false;
      const display = element.style.display || window.getComputedStyle(element).display;
      return display !== 'none';
    });
  }

  function styles() {
    if (document.getElementById('mw-data-safety-style')) return;
    const style = document.createElement('style');
    style.id = 'mw-data-safety-style';
    style.textContent = `
      .mw-data-safety-overlay {
        position: fixed;
        inset: 0;
        z-index: 12000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(15, 23, 42, 0.58);
      }
      .mw-data-safety-dialog {
        width: min(680px, 100%);
        max-height: min(760px, calc(100vh - 32px));
        overflow-y: auto;
        border: 1px solid #dbe2ea;
        border-radius: 8px;
        background: #ffffff;
        color: #172033;
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.24);
      }
      .mw-data-safety-head {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        padding: 22px 22px 18px;
        border-bottom: 1px solid #e8edf3;
      }
      .mw-data-safety-mark {
        flex: 0 0 38px;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        border: 1px solid #d6e6ff;
        background: #eaf3ff;
        color: #2563eb;
      }
      .mw-data-safety-mark span {
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        box-sizing: border-box;
        border: 2px solid currentColor;
        border-radius: 50%;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-style: normal;
        font-weight: 700;
        line-height: 1;
      }
      .mw-data-safety-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.35;
        font-weight: 700;
        letter-spacing: 0;
      }
      .mw-data-safety-close {
        flex: 0 0 34px;
        width: 34px;
        height: 34px;
        margin: -6px -6px 0 auto;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #64748b;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }
      .mw-data-safety-close:hover,
      .mw-data-safety-close:focus-visible {
        background: #f1f5f9;
        color: #1e293b;
        outline: none;
      }
      .mw-data-safety-body { padding: 20px 22px 22px; }
      .mw-data-safety-lead,
      .mw-data-safety-risk {
        margin: 0;
        font-size: 14px;
        line-height: 1.72;
      }
      .mw-data-safety-lead { color: #334155; }
      .mw-data-safety-risk {
        margin-top: 10px;
        padding: 11px 12px;
        border-left: 3px solid #d97706;
        background: #fff8e8;
        color: #704b12;
      }
      .mw-data-safety-options {
        margin-top: 18px;
        border-top: 1px solid #e8edf3;
      }
      .mw-data-safety-option {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        padding: 16px 0;
        border-bottom: 1px solid #e8edf3;
      }
      .mw-data-safety-option h3 {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin: 0 0 5px;
        font-size: 15px;
        line-height: 1.4;
        letter-spacing: 0;
      }
      .mw-data-safety-option p {
        margin: 0;
        max-width: 470px;
        color: #64748b;
        font-size: 13px;
        line-height: 1.58;
      }
      .mw-data-safety-tag {
        padding: 2px 7px;
        border-radius: 999px;
        background: #eef2f7;
        color: #526176;
        font-size: 11px;
        font-weight: 500;
      }
      .mw-data-safety-action,
      .mw-data-safety-snooze {
        min-height: 36px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .mw-data-safety-action {
        min-width: 132px;
        padding: 8px 12px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #26364d;
      }
      .mw-data-safety-action:hover,
      .mw-data-safety-action:focus-visible {
        border-color: #27856f;
        background: #f0faf7;
        outline: none;
      }
      .mw-data-safety-action.primary {
        border-color: #087f5b;
        background: #087f5b;
        color: #ffffff;
      }
      .mw-data-safety-action.primary:hover,
      .mw-data-safety-action.primary:focus-visible { background: #06664a; }
      .mw-data-safety-action:disabled { opacity: 0.66; cursor: wait; }
      .mw-data-safety-foot {
        display: flex;
        justify-content: flex-end;
        padding-top: 18px;
      }
      .mw-data-safety-snooze {
        padding: 8px 14px;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        color: #475569;
      }
      .mw-data-safety-snooze:hover,
      .mw-data-safety-snooze:focus-visible {
        background: #eef2f7;
        outline: none;
      }
      @media (max-width: 640px) {
        .mw-data-safety-overlay { align-items: flex-end; padding: 0; }
        .mw-data-safety-dialog {
          width: 100%;
          max-height: 92vh;
          border-radius: 8px 8px 0 0;
          border-bottom: 0;
        }
        .mw-data-safety-head { padding: 18px 16px 15px; }
        .mw-data-safety-body { padding: 17px 16px 20px; }
        .mw-data-safety-option { grid-template-columns: 1fr; gap: 10px; }
        .mw-data-safety-action { width: 100%; }
        .mw-data-safety-foot { justify-content: stretch; }
        .mw-data-safety-snooze { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderDialog() {
    const text = copy();
    const loggedIn = isLoggedInLocally();
    const cloudLabel = loggedIn ? text.cloudLoggedIn : text.cloudLoggedOut;

    overlay = document.createElement('div');
    overlay.className = 'mw-data-safety-overlay';
    overlay.innerHTML = `
      <section class="mw-data-safety-dialog" role="dialog" aria-modal="true" aria-labelledby="mw-data-safety-title" aria-describedby="mw-data-safety-lead">
        <header class="mw-data-safety-head">
          <div class="mw-data-safety-mark" aria-hidden="true"><span>i</span></div>
          <div>
            <h2 class="mw-data-safety-title" id="mw-data-safety-title">${text.title}</h2>
          </div>
          <button type="button" class="mw-data-safety-close" id="mw-data-safety-close" title="${text.close}" aria-label="${text.close}">&times;</button>
        </header>
        <div class="mw-data-safety-body">
          <p class="mw-data-safety-lead" id="mw-data-safety-lead">${text.lead}</p>
          <p class="mw-data-safety-risk">${text.risk}</p>
          <div class="mw-data-safety-options">
            <section class="mw-data-safety-option">
              <div>
                <h3>${text.cloudTitle}<span class="mw-data-safety-tag">${text.cloudTag}</span></h3>
                <p>${text.cloudDesc}</p>
              </div>
              <button type="button" class="mw-data-safety-action primary" id="mw-data-safety-cloud">${cloudLabel}</button>
            </section>
            <section class="mw-data-safety-option">
              <div>
                <h3>${text.localTitle}<span class="mw-data-safety-tag">${text.localTag}</span></h3>
                <p>${text.localDesc}</p>
              </div>
              <button type="button" class="mw-data-safety-action" id="mw-data-safety-export">${text.exportAll}</button>
            </section>
            <section class="mw-data-safety-option">
              <div>
                <h3>${text.recoveryTitle}</h3>
                <p>${text.recoveryDesc}</p>
              </div>
              <button type="button" class="mw-data-safety-action" id="mw-data-safety-recovery">${text.openRecovery}</button>
            </section>
          </div>
          <footer class="mw-data-safety-foot">
            <button type="button" class="mw-data-safety-snooze" id="mw-data-safety-snooze">${text.snooze}</button>
          </footer>
        </div>
      </section>
    `;
    return overlay;
  }

  function close(options) {
    if (!overlay) return;
    const settings = options || {};
    if (settings.snoozeDays) snooze(settings.snoozeDays);
    overlay.remove();
    overlay = null;
    document.body.style.overflow = previousOverflow;
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  }

  function onKeyDown(event) {
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ snoozeDays: 1 });
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]), a[href]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showError(message) {
    if (typeof window.showError === 'function') {
      window.showError(message);
    } else {
      alert(message);
    }
  }

  async function startCloudAction(button) {
    const text = copy();
    button.disabled = true;
    button.textContent = text.syncing;

    if (!isLoggedInLocally()) {
      snooze(7);
      close();
      const loginLink = document.getElementById('auth-link');
      window.location.href = loginLink && loginLink.href
        ? loginLink.href
        : 'https://timikays.us.kg/auth.html?redirect=https%3A%2F%2Fmindword.timikays.us.kg%2Fapp.html';
      return;
    }

    snooze(7);
    close();
    const syncButton = document.getElementById('lc-sync-btn-menu');
    if (syncButton) {
      syncButton.click();
      return;
    }
    try {
      if (window.MW_SPB_SYNC && typeof window.MW_SPB_SYNC.sync === 'function') {
        await window.MW_SPB_SYNC.sync();
      }
    } catch (error) {
      showError('同步失败: ' + (error && error.message ? error.message : '未知错误'));
    }
  }

  async function exportAll(button) {
    const text = copy();
    const original = button.textContent;
    button.disabled = true;
    button.textContent = text.exporting;
    try {
      if (typeof window.mw_exportAllZip === 'function') {
        await window.mw_exportAllZip();
      } else {
        const exportButton = document.getElementById('btn-export-all');
        if (!exportButton) throw new Error('导出功能尚未加载');
        exportButton.click();
      }
      snooze(7);
      close();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      showError('导出失败: ' + (error && error.message ? error.message : '未知错误'));
    }
  }

  function bindDialogEvents() {
    const cloudButton = document.getElementById('mw-data-safety-cloud');
    const exportButton = document.getElementById('mw-data-safety-export');
    const recoveryButton = document.getElementById('mw-data-safety-recovery');
    const closeButton = document.getElementById('mw-data-safety-close');
    const snoozeButton = document.getElementById('mw-data-safety-snooze');

    cloudButton.addEventListener('click', function () { startCloudAction(cloudButton); });
    exportButton.addEventListener('click', function () { exportAll(exportButton); });
    recoveryButton.addEventListener('click', function () {
      snooze(7);
      window.open(RECOVERY_URL, '_blank', 'noopener');
      close();
    });
    closeButton.addEventListener('click', function () { close({ snoozeDays: 1 }); });
    snoozeButton.addEventListener('click', function () { close({ snoozeDays: 7 }); });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close({ snoozeDays: 1 });
    });
  }

  function open(options) {
    const settings = options || {};
    if (overlay || (!settings.manual && !shouldAutoOpen())) return false;
    styles();
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(renderDialog());
    bindDialogEvents();
    document.addEventListener('keydown', onKeyDown);
    const closeButton = document.getElementById('mw-data-safety-close');
    if (closeButton) closeButton.focus();
    return true;
  }

  function scheduleAutoOpen(attempt) {
    if (!shouldAutoOpen()) return;
    const currentAttempt = Number(attempt || 0);
    if (hasBlockingDialog()) {
      if (currentAttempt < 12) {
        setTimeout(function () { scheduleAutoOpen(currentAttempt + 1); }, 2000);
      }
      return;
    }
    open();
  }

  window.MW_DATA_SAFETY = {
    open: function () { return open({ manual: true }); },
    close: close,
    shouldAutoOpen: shouldAutoOpen,
    recoveryUrl: RECOVERY_URL,
    noticeKey: NOTICE_KEY
  };

  function init() {
    setTimeout(function () { scheduleAutoOpen(0); }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
