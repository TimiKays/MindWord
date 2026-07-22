/**
 * MindWord 旧认证入口过渡到统一账号中心。
 *
 * 旧 Supabase 页面保留为可访问地址，避免旧书签直接失效；
 * 但不再在这些页面执行旧认证操作。
 */
(function redirectLegacyMindWordAuth() {
    'use strict';

    const CENTRAL_ORIGIN = 'https://timikays.us.kg';
    const DEFAULT_RETURN_URL = 'https://mindword.timikays.us.kg/app.html';
    const mode = document.documentElement.dataset.mwLegacyAuthRedirect || 'auth';
    const params = new URLSearchParams(window.location.search);

    function getSafeReturnUrl() {
        const requested = params.get('redirect');
        if (!requested) return DEFAULT_RETURN_URL;

        try {
            const target = new URL(requested, window.location.href);
            if (target.protocol === 'https:' && target.hostname === 'mindword.timikays.us.kg') {
                return target.href;
            }
        } catch (_) {
            // 非法地址使用 MindWord 默认工作台，避免旧入口成为开放跳转点。
        }
        return DEFAULT_RETURN_URL;
    }

    const target = new URL(
        mode === 'reset' ? '/reset-password.html' : '/auth.html',
        CENTRAL_ORIGIN
    );
    target.searchParams.set('redirect', getSafeReturnUrl());

    if (mode === 'auth' && params.get('action') === 'register') {
        target.searchParams.set('action', 'register');
    }

    window.location.replace(target.href);
})();
