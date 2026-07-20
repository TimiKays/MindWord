/**
 * MindWord 内部统一账户试用开关。
 *
 * 仅当前标签页访问 app.html?account_mode=unified 时启用；
 * app.html?account_mode=legacy 可立即退回现有 Supabase 链路。
 */
(function initMindWordAccountMode() {
    'use strict';

    const SESSION_KEY = 'mw_internal_account_mode';
    const QUERY_KEY = 'account_mode';
    const UNIFIED_VALUE = 'unified';
    const LEGACY_VALUE = 'legacy';
    const SDK_URLS = {
        auth: 'https://api.timikays.us.kg/sdk/auth-sdk.js?v=1.2.2',
        cloud: 'https://api.timikays.us.kg/sdk/cloud-sync-v2.js?v=1.2.0'
    };

    let requestedMode = '';
    try {
        requestedMode = new URLSearchParams(window.location.search).get(QUERY_KEY) || '';
        if (requestedMode === UNIFIED_VALUE) {
            window.sessionStorage.setItem(SESSION_KEY, UNIFIED_VALUE);
        } else if (requestedMode === LEGACY_VALUE) {
            window.sessionStorage.removeItem(SESSION_KEY);
        }
    } catch (error) {
        console.warn('[MindWord-AccountMode] 无法读取内部试用开关，继续使用现有账户。', error);
    }

    let unified = false;
    try {
        unified = window.sessionStorage.getItem(SESSION_KEY) === UNIFIED_VALUE;
    } catch (_) {
        unified = requestedMode === UNIFIED_VALUE;
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

    const ready = unified
        ? Promise.all([
            loadScript(SDK_URLS.auth, 'TimiAuth'),
            loadScript(SDK_URLS.cloud, 'TimiCloud')
        ]).then(function () {
            window.TimiAuth.init({ product: 'mindword' });
            window.TimiCloud.init({ product: 'mindword' });
            return true;
        }).catch(function (error) {
            console.error('[MindWord-AccountMode] 统一账户组件加载失败，本地编辑仍可使用。', error);
            throw error;
        })
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
        buildLoginUrl: buildLoginUrl
    });

    console.log('[MindWord-AccountMode] 当前账户模式:', unified ? '统一账户（内部试用）' : '现有账户');
})();
