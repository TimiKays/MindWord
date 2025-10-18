/**
 * Cloud Sync (R2 via Worker) - 整包双向同步，仅保留最新
 * - 入口挂在 app.html 的认证区下方按钮：同步 & 更多
 * - 仅实现：上传/下载 latest.zip、查询 latest.json、清空备份、容量上限 10MB
 * - 依赖：AV(User), JSZip, 现有 mw_exportAllZip/mw_importZip 的打包与导入结构
 */
(function () {
    const WORKER_BASE = (window.MW_SYNC_WORKER_BASE || 'https://mindword-cloud.timikays.workers.dev');
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB

    // 简易工具
    function fmtBytes(n) {
        if (!Number.isFinite(n)) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(2) + ' MB';
    }
    function fmtTime(iso) {
        if (!iso) return '—';
        try { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return '—'; }
    }
    function getSessionToken() {
        try {
            const u = (typeof AV !== 'undefined' && AV.User && AV.User.current) ? AV.User.current() : null;
            if (u && typeof u.getSessionToken === 'function') {
                const t = u.getSessionToken();
                if (t) return t;
            }
        } catch (_) { }
        // 兜底：从 localStorage 中读取 LeanCloud currentUser 的 sessionToken（兼容项目中两个可能的 AppID 键名）
        try {
            const appIds = [
                'MQ3fZEqOgskJBWGoxOwqG1nT-gzGzoHsz'

            ];
            for (const appId of appIds) {
                const key = 'AV/' + appId + '/currentUser';
                const val = localStorage.getItem(key);
                if (val) {
                    try {
                        const obj = JSON.parse(val);
                        if (obj && obj.sessionToken) return obj.sessionToken;
                    } catch (_) { }
                }
            }
        } catch (_) { }
        return null;
    }
    async function fetchLatestMeta() {
        const token = getSessionToken();
        if (!token) throw new Error('未登录或会话失效');
        const resp = await fetch(`${WORKER_BASE}/sync/latest-meta`, {
            method: 'GET',
            headers: { 'Authorization': `LeanCloud ${token}` }
        });
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error(`获取云端信息失败(${resp.status})`);
        return await resp.json();
    }
    async function downloadLatestZip() {
        const token = getSessionToken();
        if (!token) throw new Error('未登录或会话失效');
        const resp = await fetch(`${WORKER_BASE}/sync/download-latest`, {
            method: 'POST',
            headers: { 'Authorization': `LeanCloud ${token}` }
        });
        if (!resp.ok) throw new Error(`下载失败(${resp.status})`);
        return await resp.blob();
    }
    async function uploadLatestZip(zipBlob) {
        const token = getSessionToken();
        if (!token) throw new Error('未登录或会话失效');
        if (!zipBlob) throw new Error('无可上传内容');
        if (zipBlob.size > MAX_BYTES) throw new Error('超过10MB容量上限，请清理后再试');
        const resp = await fetch(`${WORKER_BASE}/sync/upload-latest`, {
            method: 'POST',
            headers: { 'Authorization': `LeanCloud ${token}`, 'Content-Type': 'application/zip' },
            body: zipBlob
        });
        if (!resp.ok) throw new Error(`上传失败(${resp.status})`);
        return await resp.json();
    }
    async function clearLatest() {
        const token = getSessionToken();
        if (!token) throw new Error('未登录或会话失效');
        const resp = await fetch(`${WORKER_BASE}/sync/clear`, {
            method: 'POST',
            headers: { 'Authorization': `LeanCloud ${token}` }
        });
        if (!resp.ok) throw new Error(`清空失败(${resp.status})`);
        return await resp.json();
    }

    // 生成整包 ZIP Blob（复用现有导出逻辑，但不saveAs）
    async function generateAllZipBlob() {
        const docs = (typeof mw_loadDocs === 'function') ? mw_loadDocs() : [];
        if (!docs || !docs.length) throw new Error('没有文档可导出');

        const zip = new JSZip();
        const aiFolder = zip.folder('ai');
        try {
            const aiCfg = (typeof mw_fetchAIPlatformConfigsSnapshot === 'function') ? mw_fetchAIPlatformConfigsSnapshot() : null;
            if (aiCfg) aiFolder.file('platform-configs.json', JSON.stringify(aiCfg, null, 2));
            const tpl = (typeof mw_fetchAIPromptTemplatesSnapshot === 'function') ? mw_fetchAIPromptTemplatesSnapshot() : null;
            if (tpl) aiFolder.file('prompt-templates.json', JSON.stringify(tpl, null, 2));
        } catch (_) { }

        for (const doc of docs) {
            const safeName = (doc.name || 'document').replace(/[\\/:*?"<>|]+/g, '_');
            const root = zip.folder(safeName);
            root.file('index.md', doc.md || '');
            if (doc.images && doc.images.length) {
                const imgFolder = root.folder('images');
                for (const img of doc.images) {
                    const fname = img.name || ('img_' + Date.now() + '.png');
                    const blob = await mw_dataUrlToBlob(img.dataUrl || '', img.mime || 'image/png');
                    const ab = await blob.arrayBuffer();
                    imgFolder.file(fname, ab);
                }
            }
            root.file('meta.json', JSON.stringify({ id: doc.id, name: doc.name, version: doc.version || 1 }, null, 2));
        }
        return await zip.generateAsync({ type: 'blob' });
    }

    // 双向同步为最新：策略——若云端较新则下载覆盖，否则上传本地最新
    async function bidirectionalSyncLatest() {
        try {
            showInfo && showInfo('正在检查云端备份...');
            const cloud = await fetchLatestMeta(); // 可能为 null

            // 本地最近时间：优先使用自维护标记，其次用当前时刻作为上传基准
            let localTs = null;
            try { localTs = Number(localStorage.getItem('mw_last_change_time')) || null; } catch (_) { }

            if (cloud && cloud.updatedAt) {
                const cloudTs = Date.parse(cloud.updatedAt);
                if (!Number.isNaN(cloudTs) && localTs && cloudTs > localTs) {
                    // 云端较新 -> 下载并导入
                    const zipBlob = await downloadLatestZip();
                    await mw_importZip(zipBlob);
                    try { localStorage.setItem('mw_last_change_time', Date.now().toString()); } catch (_) { }
                    showSuccess && showSuccess('已从云端恢复为最新');
                    return { action: 'download', cloud };
                }
            }

            // 否则本地较新或云端为空 -> 上传
            const zipBlob = await generateAllZipBlob();
            if (zipBlob.size > MAX_BYTES) {
                showError && showError('整包超过10MB上限，请清理图片或拆分后再试');
                return { action: 'abort_oversize' };
            }
            const res = await uploadLatestZip(zipBlob);
            try { localStorage.setItem('mw_last_change_time', Date.now().toString()); } catch (_) { }
            showSuccess && showSuccess('已上传云端最新备份');
            return { action: 'upload', meta: res };
        } catch (e) {
            console.warn('[CloudSync] bidirectional failed', e);
            showError && showError(e.message || '同步失败');
            return { action: 'error', error: e };
        }
    }

    // 更新弹窗信息
    async function refreshModalInfo() {
        const timeEl = document.getElementById('cloud-sync-latest-time');
        const countEl = document.getElementById('cloud-sync-file-count');
        const sizeEl = document.getElementById('cloud-sync-total-size');
        try {
            const meta = await fetchLatestMeta();
            if (!meta) {
                timeEl.textContent = '暂无备份';
                countEl.textContent = '0';
                sizeEl.textContent = '0 B';
                return;
            }
            timeEl.textContent = fmtTime(meta.updatedAt);
            countEl.textContent = String(meta.fileCount ?? '—');
            sizeEl.textContent = fmtBytes(meta.sizeBytes);
        } catch (e) {
            timeEl.textContent = '获取失败';
            countEl.textContent = '—';
            sizeEl.textContent = '—';
        }
    }

    // 事件绑定与显示控制
    function initCloudSyncUI() {
        const userBox = document.getElementById('auth-user');
        const controls = document.getElementById('cloud-sync-controls');
        const syncBtn = document.getElementById('cloud-sync-sync-btn');
        const moreBtn = document.getElementById('cloud-sync-more-btn');
        const modal = document.getElementById('cloud-sync-modal');
        const modalSync = document.getElementById('cloud-sync-modal-sync');
        const modalClear = document.getElementById('cloud-sync-modal-clear');
        const modalClose = document.getElementById('cloud-sync-modal-close');

        // 显示控制：仅在已登录时显示
        try {
            const token = getSessionToken();
            if (token && userBox && controls) {
                controls.style.display = 'inline-flex';
            } else if (controls) {
                controls.style.display = 'none';
            }
        } catch (_) { }

        if (syncBtn) {
            syncBtn.onclick = () => { bidirectionalSyncLatest(); };
        }
        if (moreBtn && modal) {
            moreBtn.onclick = async () => {
                modal.style.display = 'flex';
                await refreshModalInfo();
            };
        }
        if (modalClose && modal) {
            modalClose.onclick = () => { modal.style.display = 'none'; };
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }
        if (modalSync) {
            modalSync.onclick = async () => { await bidirectionalSyncLatest(); await refreshModalInfo(); };
        }
        if (modalClear) {
            modalClear.onclick = async () => {
                try { await clearLatest(); showSuccess && showSuccess('已清空云端备份'); } catch (e) { showError && showError(e.message || '清空失败'); }
                await refreshModalInfo();
            };
        }
    }

    // 初始化时机：DOM 就绪后执行一次；并在认证区刷新后再次尝试
    document.addEventListener('DOMContentLoaded', () => { initCloudSyncUI(); });
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('AV/')) { setTimeout(initCloudSyncUI, 300); }
    });
    // 暴露手动刷新入口供现有 refreshAuthUI 调用（如需）
    window.__mw_initCloudSyncUI = initCloudSyncUI;
})();
