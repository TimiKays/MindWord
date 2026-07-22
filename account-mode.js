/**
 * MindWord 统一账户正式入口与旧链路回退开关。
 *
 * 默认使用 TimiAuth / TimiCloud；
 * app.html?account_mode=legacy 可在当前浏览器会话内临时退回 Supabase。
 */
(function initMindWordAccountMode() {
    'use strict';

    // 使用新 key，避免内部试用阶段留下的 sessionStorage 继续影响正式入口。
    const SESSION_KEY = 'mw_account_mode_v2';
    const QUERY_KEY = 'account_mode';
    const UNIFIED_VALUE = 'unified';
    const LEGACY_VALUE = 'legacy';
    const DEFAULT_MODE = UNIFIED_VALUE;
    const CLOUD_TIMEOUT_MS = 30000;
    const SDK_URLS = {
        auth: 'https://api.timikays.us.kg/sdk/auth-sdk.js?v=1.2.2',
        cloud: 'https://api.timikays.us.kg/sdk/cloud-sync-v2.js?v=1.2.0',
        topbar: 'https://api.timikays.us.kg/sdk/topbar.js?v=2.0.3',
        topbarStyles: 'https://api.timikays.us.kg/sdk/topbar.css?v=2.0.3'
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

    function initializeAccountMenu() {
        return Promise.all([
            loadScript(SDK_URLS.topbar, 'TimiTopBar'),
            loadStylesheet(SDK_URLS.topbarStyles, 'TimiTopBarStyles'),
            waitForDom()
        ]).then(function () {
            const mount = document.getElementById('mw-unified-account-mount');
            if (!mount) throw new Error('统一账户菜单挂载点不存在');
            bindMindWordMenuActions(mount);
            var authLink = document.getElementById('auth-link');
            if (authLink) authLink.style.display = 'none';
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
                    extraItems: [
                        { icon: '☁', label: '云备份', href: '#mw-cloud-sync' },
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
            var authLink = document.getElementById('auth-link');
            if (authLink) authLink.style.display = '';
            console.warn('[MindWord-AccountMode] 账户菜单加载失败，云同步仍可使用。', error);
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
            function () { return false; }
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
