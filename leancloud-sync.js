/**
 * LeanCloud Data 同步（中文模式）
 * 仅在语言为中文时启用 UI；提供：一键同步（增量双向）、清空云数据
 * 约定：把所有文档数组（含图片 dataURL/base64）存到一个 Class=MWData 的一条记录里（per user）
 * 字段：docs(json), updatedAt(number, ms)，按时间做冲突解决：谁新用谁；同时做增量 merge
 */
(function () {
  const LANG_KEY = 'mw_lang';
  const CLASS_NAME = 'MWData';

  function getLang() {
    try { return localStorage.getItem(LANG_KEY) || 'zh'; } catch (_) { return 'zh'; }
  }
  function isLoggedIn() {
    try { return !!(window.AV && AV.User && AV.User.current()); } catch (_) { return false; }
  }

  function getLocalDocs() { try { return (typeof mw_loadDocs === 'function') ? mw_loadDocs() : []; } catch (_) { return []; } }
  function saveLocalDocs(docs) { try { return (typeof mw_saveDocs === 'function') ? mw_saveDocs(docs) : null; } catch (_) { return null; } }

  function showInfo(msg) { try { window.showInfo && window.showInfo(msg); } catch (_) { } }
  function showSuccess(msg) { try { window.showSuccess && window.showSuccess(msg); } catch (_) { } }
  function showError(msg) { try { window.showError && window.showError(msg); } catch (_) { alert(msg); } }
  function applyLangUIOnce() { try { if (typeof window.__mw_applyLangToUI === 'function') window.__mw_applyLangToUI(); } catch (_) { } }

  async function fetchOrCreateRecord() {
    const user = AV.User.current();
    if (!user) throw new Error('未登录');
    const MWData = AV.Object.extend(CLASS_NAME);
    try {
      const query = new AV.Query(MWData);
      // 使用字符串 ownerId，避免 Pointer schema 依赖；若 Class 不存在，可能抛 404/101
      query.equalTo('ownerId', user.id);
      const list = await query.find();
      if (list && list.length > 0) return list[0];
    } catch (e) {
      // Class 尚未创建或无 schema：忽略查询错误，直接创建
    }
    const obj = new MWData();
    obj.set('ownerId', user.id);
    obj.set('docs', []);
    obj.set('updatedAtMs', Date.now());
    return await obj.save();
  }

  function toIdMap(arr) {
    const map = new Map();
    for (const d of (arr || [])) { if (d && d.id) map.set(d.id, d); }
    return map;
  }

  function mergeIncremental(localDocs, cloudDocs) {
    const localMap = toIdMap(localDocs);
    const cloudMap = toIdMap(cloudDocs);
    const merged = new Map();

    // 收集所有 id
    const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
    const now = Date.now();
    for (const id of allIds) {
      const L = localMap.get(id) || null;
      const C = cloudMap.get(id) || null;
      if (L && C) {
        const lts = Number(L.updatedAt || 0);
        const cts = Number(C.updatedAt || 0);
        // 谁新用谁；并保留基础字段
        if (cts > lts) {
          merged.set(id, Object.assign({}, C));
        } else {
          merged.set(id, Object.assign({}, L));
        }
      } else if (L) {
        merged.set(id, Object.assign({}, L));
      } else if (C) {
        merged.set(id, Object.assign({}, C));
      }
    }

    return Array.from(merged.values());
  }

  async function downloadCloud() {
    const obj = await fetchOrCreateRecord();
    const docs = obj.get('docs') || [];
    return { obj, docs };
  }

  async function uploadCloud(obj, docs) {
    obj.set('docs', docs);
    obj.set('updatedAtMs', Date.now());
    return await obj.save();
  }

  async function bidirectionalSync() {
    try {
      if (getLang() !== 'zh') { showInfo('当前为英文模式，已使用 Cloudflare Worker 同步'); return; }
      if (!isLoggedIn()) { throw new Error('未登录'); }
      showInfo('正在同步...');

      const localDocs = getLocalDocs();
      const { obj, docs: cloudDocs } = await downloadCloud();

      const merged = mergeIncremental(localDocs, cloudDocs);

      // 判定方向：若云端比本地“整体更新更晚”，则以本地为准，否则以云为准；
      // 但无论如何，都先以 merged 写本地，再写云（完成双向一致）
      saveLocalDocs(merged);
      await uploadCloud(obj, merged);

      // 刷新列表与当前文档视图
      try {
        if (typeof mw_renderList === 'function') mw_renderList();
        if (typeof mw_getActive === 'function') {
          const activeId = mw_getActive();
          if (activeId) {
            const docsNow = (typeof mw_loadDocs === 'function') ? mw_loadDocs() : merged;
            const activeDoc = (docsNow || []).find(d => d.id === activeId) || null;
            if (activeDoc) {
              if (typeof mw_notifyEditorLoad === 'function') mw_notifyEditorLoad(activeDoc);
              if (typeof mw_notifyPreviewLoad === 'function') mw_notifyPreviewLoad(activeDoc);
              if (typeof mw_notifyMindmapLoad === 'function') mw_notifyMindmapLoad(activeDoc);
            }
          }
        }
      } catch (_) { }

      showSuccess('已完成一键同步');
    } catch (e) {
      showError(e.message || '同步失败');
    }
  }

  async function clearCloud() {
    try {
      if (getLang() !== 'zh') { showInfo('当前为英文模式，请用“清空备份”按钮'); return; }
      if (!isLoggedIn()) { throw new Error('未登录'); }
      if (!confirm('确认清空云端数据？此操作不可撤销')) return;
      const { obj } = await downloadCloud();
      await uploadCloud(obj, []);
      showSuccess('云端数据已清空');
    } catch (e) {
      showError(e.message || '清空失败');
    }
  }

  function initUIBindings() {
    const zhCtrls = document.getElementById('lc-sync-controls');
    const syncBtn = document.getElementById('lc-sync-btn');
    const clearBtn = document.getElementById('lc-clear-btn');
    if (syncBtn) syncBtn.onclick = () => bidirectionalSync();
    if (clearBtn) clearBtn.onclick = () => clearCloud();

    // 登录状态或语言变化时切换显示
    function refreshVisible() {
      const authUser = document.getElementById('auth-user');
      const enCtrls = document.getElementById('cloud-sync-controls');
      // 未登录：两组隐藏，避免初次闪现
      if (!authUser || authUser.style.display === 'none') {
        if (enCtrls) enCtrls.style.display = 'none';
        if (zhCtrls) zhCtrls.style.display = 'none';
        return;
      }
      if (getLang() === 'zh') {
        if (enCtrls) enCtrls.style.display = 'none';
        if (zhCtrls) zhCtrls.style.display = 'inline-flex';
      } else {
        if (enCtrls) enCtrls.style.display = 'inline-flex';
        if (zhCtrls) zhCtrls.style.display = 'none';
      }
    }

    document.addEventListener('DOMContentLoaded', refreshVisible);
    window.addEventListener('storage', function (e) {
      if (e.key === LANG_KEY || (e.key && e.key.startsWith('AV/'))) setTimeout(refreshVisible, 50);
    });
    // 提供给外部在认证区变化后刷新
    window.__mw_refreshSyncLangUI = refreshVisible;
  }

  // 页面就绪后初始化
  document.addEventListener('DOMContentLoaded', function () {
    initUIBindings();
    // 尝试在认证区刷新后应用一次
    setTimeout(applyLangUIOnce, 300);
  });

  // 暴露手动入口（如需）
  window.MW_LC_SYNC = { sync: bidirectionalSync, clear: clearCloud };
  
})();
