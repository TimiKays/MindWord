/**
 * MindWord 统一账户入口。
 *
 * 使用 TimiAuth / TimiCloud；
 * SDK 不可用时显示升级提示，不回退 Supabase。
 */
(function initMindWordAccountMode() {
    'use strict';

    const SESSION_KEY = 'mw_account_mode_v2';
    const QUERY_KEY = 'account_mode';
    const UNIFIED_VALUE = 'unified';
    const LEGACY_VALUE = 'legacy';
    const DEFAULT_MODE = UNIFIED_VALUE;
    const CLOUD_TIMEOUT_MS = 30000;
    const SDK_URLS = {
        auth: 'https://api.timikays.us.kg/sdk/auth-sdk.js?v=1.2.2',
        cloud: 'https://api.timikays.us.kg/sdk/cloud-sync-v2.js?v=1.2.0',
        topbar: 'https://api.timikays.us.kg/sdk/topbar.js?v=2.2.0',
        topbarStyles: 'https://api.timikays.us.kg/sdk/topbar.css?v=2.2.0'
    };

    let requestedMode = '';
    try {
        requestedMode = new URLSearchParams(window.location.search).get(QUERY_KEY) || '';
        if (requestedMode === UNIFIED_VALUE || requestedMode === LEGACY_VALUE) {
            window.sessionStorage.setItem(SESSION_KEY, requestedMode);
        }
    } catch (error) {
        console.warn('[MindWord-AccountMode] 无法读取账户模式开关，继续使用统一账户。', error);
    }

    let unified = DEFAULT_MODE === UNIFIED_VALUE;
    try {
        const storedMode = window.sessionStorage.getItem(SESSION_KEY);
        const selectedMode = storedMode === UNIFIED_VALUE || storedMode === LEGACY_VALUE
            ? storedMode
            : DEFAULT_MODE;
        unified = selectedMode === UNIFIED_VALUE;
    } catch (_) {
        unified = requestedMode !== LEGACY_VALUE;
    }

    function loadScript(src, globalName) {
        if (window[globalName]) return Promise.resolve(window[globalName]);
        return new Promise(function (resolve, reject) {
            const existing = document.querySelector(`script[data-mw-sdk="${globalName}"]`);
            if (existing) {
                existing.addEventListener('load', function () { resolve(window[globalName]); }, { once: true });
                existing.addEventListener('error', function () { reject(new Error(`${globalName} 加载失败`)); }, { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.dataset.mwSdk = globalName;
            script.onload = function () {
                if (window[globalName]) resolve(window[globalName]);
                else reject(new Error(`${globalName} 加载后未初始化`));
            };
            script.onerror = function () { reject(new Error(`${globalName} 加载失败`)); };
            document.head.appendChild(script);
        });
    }

    function loadStylesheet(href, marker) {
        const selector = `link[data-mw-sdk="${marker}"]`;
        const existing = document.querySelector(selector);
        if (existing && existing.sheet) return Promise.resolve(existing);
        return new Promise(function (resolve, reject) {
            const link = existing || document.createElement('link');
            link.addEventListener('load', function () { resolve(link); }, { once: true });
            link.addEventListener('error', function () { reject(new Error(`${marker} 加载失败`)); }, { once: true });
            if (!existing) {
                link.rel = 'stylesheet';
                link.href = href;
                link.dataset.mwSdk = marker;
                document.head.appendChild(link);
            }
        });
    }

    function waitForDom() {
        if (document.readyState !== 'loading') return Promise.resolve();
        return new Promise(function (resolve) {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    function closeSharedAccountMenu(mount) {
        const trigger = mount && mount.querySelector('.tk-user-trigger');
        if (trigger && trigger.getAttribute('aria-expanded') === 'true') trigger.click();
    }

    function triggerMindWordAction(mount, buttonId) {
        closeSharedAccountMenu(mount);
        const button = document.getElementById(buttonId);
        if (button) button.click();
    }

    function bindMindWordMenuActions(mount) {
        if (!mount || mount.dataset.mwAccountActionsBound === 'true') return;
        mount.dataset.mwAccountActionsBound = 'true';
        mount.addEventListener('click', function (event) {
            if (!event.target || typeof event.target.closest !== 'function') return;
            const action = event.target.closest('a[href="#mw-cloud-sync"], a[href="#mw-cloud-clear"]');
            if (!action) return;
            event.preventDefault();
            triggerMindWordAction(
                mount,
                action.getAttribute('href') === '#mw-cloud-sync' ? 'lc-sync-btn-menu' : 'lc-clear-btn-menu'
            );
        });
    }

    function handleMindWordLogout(mount) {
        triggerMindWordAction(mount, 'auth-logout-menu');
        return Promise.resolve();
    }

    function formatDataSize(bytes) {
        const value = Math.max(0, Number(bytes) || 0);
        if (value < 1024) return `${Math.round(value)}B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
        return `${(value / 1024 / 1024).toFixed(1)}MB`;
    }

    function formatBackupTime(timestamp) {
        const value = Number(timestamp) || 0;
        if (!value) return '尚未备份';
        const diffMs = Math.max(0, Date.now() - value);
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        const hours = Math.floor(diffMs / 3600000);
        if (hours < 24) return `${hours}小时前`;
        const days = Math.floor(diffMs / 86400000);
        if (days < 7) return `${days}天前`;
        return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }

    function readLocalStatus() {
        if (window.MW_SPB_SYNC && typeof window.MW_SPB_SYNC.getLocalStatus === 'function') {
            return window.MW_SPB_SYNC.getLocalStatus();
        }
        let docs = [];
        try {
            const saved = window.localStorage && window.localStorage.getItem('mw_documents');
            if (saved) docs = JSON.parse(saved);
        } catch (_) { }
        const validDocs = Array.isArray(docs) ? docs.filter(function (doc) { return doc && !doc.deletedAt; }) : [];
        let sizeBytes = 0;
        try {
            const serialized = JSON.stringify(validDocs);
            sizeBytes = typeof TextEncoder === 'function'
                ? new TextEncoder().encode(serialized).byteLength
                : serialized.length;
        } catch (_) { }
        return { docCount: validDocs.length, sizeBytes: sizeBytes };
    }

    async function loadMindWordStatus(options) {
        const local = readLocalStatus();
        const localText = `${Number(local.docCount) || 0} 个 · ${formatDataSize(local.sizeBytes)}`;
        try {
            let waited = 0;
            while ((!window.MW_TIMI_CLOUD || typeof window.MW_TIMI_CLOUD.getCloudStatus !== 'function') && waited < 3000) {
                await new Promise(function (r) { setTimeout(r, 100); });
                waited += 100;
            }
            if (!window.MW_TIMI_CLOUD || typeof window.MW_TIMI_CLOUD.getCloudStatus !== 'function') {
                throw new Error('云同步模块尚未就绪');
            }
            const cloud = await window.MW_TIMI_CLOUD.getCloudStatus(options);
            const cloudText = cloud.exists
                ? `${Number(cloud.docCount) || 0} 个 · ${formatDataSize(cloud.sizeBytes)}`
                : '暂无备份';
            return {
                rows: [
                    { label: '本地文档', value: localText },
                    { label: '云端文档', value: cloudText },
                    { label: '最近备份', value: formatBackupTime(cloud.updatedAt) }
                ],
                progress: {
                    label: '备份容量',
                    value: Number(cloud.sizeBytes) || 0,
                    max: Number(cloud.limitBytes) || (10 * 1024 * 1024),
                    text: `${formatDataSize(cloud.sizeBytes)} / 10MB`
                }
            };
        } catch (error) {
            console.warn('[MindWord-AccountMode] 云端状态读取失败:', error);
            const errDetail = error && error.message ? error.message : '未知错误';
            return {
                rows: [
                    { label: '本地文档', value: localText },
                    { label: '云端文档', value: '读取失败', tone: 'warning' },
                    { label: '最近备份', value: '暂不可用' }
                ],
                note: errDetail,
                tone: 'warning'
            };
        }
    }

    function showServiceUpgradeNotice() {
        var mount = document.getElementById('mw-unified-account-mount');
        if (!mount) return;
        mount.style.display = 'inline-flex';
        mount.style.alignItems = 'center';
        mount.style.gap = '4px';
        mount.style.height = '30px';
        mount.style.padding = '0 8px';
        mount.style.border = '1px solid #e2e8f0';
        mount.style.borderRadius = '6px';
        mount.style.background = '#fffbeb';
        mount.style.color = '#92400e';
        mount.style.fontSize = '12px';
        mount.style.cursor = 'default';
        mount.textContent = '服务升级中，请稍后重试';
    }

    function initializeAccountMenu() {
        return Promise.all([
            loadScript(SDK_URLS.topbar, 'TimiTopBar'),
            loadStylesheet(SDK_URLS.topbarStyles, 'TimiTopBarStyles'),
            waitForDom()
        ]).then(function () {
            const mount = document.getElementById('mw-unified-account-mount');
            if (!mount) throw new Error('统一账户菜单挂载点不存在');
            bindMindWordMenuActions(mount);

            const result = window.TimiTopBar.renderAuth({
                container: '#mw-unified-account-mount',
                currentProduct: 'mindword',
                theme: 'light',
                membershipScope: 'product',
                auth: { requireLogin: false },
                menu: {
                    showAccount: true,
                    showMembership: true,
                    showInvite: false,
                    showLogout: true,
                    statusSection: {
                        title: '数据同步',
                        loadingText: '正在读取本地与云端状态...',
                        errorText: '数据状态读取失败，请重试',
                        refreshIntervalMs: 0,
                        load: loadMindWordStatus
                    },
                    extraItems: [
                        { icon: '☁', label: '立即同步', href: '#mw-cloud-sync' },
                        { icon: '⌫', label: '清空云数据', href: '#mw-cloud-clear' }
                    ]
                },
                onLogout: function () { return handleMindWordLogout(mount); }
            });
            document.documentElement.classList.add('mw-shared-account-ready');
            return Promise.resolve(result).then(function () { return true; });
        }).catch(function (error) {
            if (document.documentElement && document.documentElement.classList) {
                document.documentElement.classList.remove('mw-shared-account-ready');
            }
            showServiceUpgradeNotice();
            console.warn('[MindWord-AccountMode] 账户服务暂时不可用，本地编辑不受影响。', error);
            return false;
        });
    }

    const ready = unified
        ? Promise.all([
            loadScript(SDK_URLS.auth, 'TimiAuth'),
            loadScript(SDK_URLS.cloud, 'TimiCloud')
        ]).then(function () {
            window.TimiAuth.init({ product: 'mindword' });
            window.TimiCloud.init({ product: 'mindword', timeoutMs: CLOUD_TIMEOUT_MS });
            return true;
        }).catch(function (error) {
            console.error('[MindWord-AccountMode] 统一账户组件加载失败，本地编辑仍可使用。', error);
            throw error;
        })
        : Promise.resolve(false);

    const accountMenuReady = unified
        ? ready.then(
            function () { return initializeAccountMenu(); },
            function () {
                showServiceUpgradeNotice();
                return false;
            }
        )
        : Promise.resolve(false);

    function buildLoginUrl(redirectUrl) {
        return 'https://timikays.us.kg/auth.html?redirect=' + encodeURIComponent(
            redirectUrl || window.location.href
        );
    }

    window.MW_ACCOUNT_MODE = Object.freeze({
        mode: unified ? UNIFIED_VALUE : LEGACY_VALUE,
        isUnified: function () { return unified; },
        ready: ready,
        accountMenuReady: accountMenuReady,
        buildLoginUrl: buildLoginUrl
    });

    console.log('[MindWord-AccountMode] 当前账户模式:', unified ? '统一账户' : 'Supabase 回退模式');
})();
