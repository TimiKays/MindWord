/**
 * MindWord Service Worker 注册和更新管理
 * 核心策略：发现新版本立即自动刷新，不弹窗不询问
 * 
 * 更新检查策略（v2 - 优化请求量）：
 * - 轮询间隔：30分钟（原30秒，过于激进导致version.json日均7k+请求）
 * - 用户切回页面时检查，但有5分钟节流，避免频繁切换标签页导致重复请求
 * - 启动时检查一次
 */

(function () {
    'use strict';

    // 30分钟检查一次，工具型PWA不需要秒级更新感知
    const SW_UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;
    // 用户切回页面时的最小检查间隔（5分钟节流）
    const SW_RESUME_THROTTLE_MS = 5 * 60 * 1000;
    const SW_LAST_VERSION_KEY = 'mw_sw_last_version';
    const SW_LAST_CHECK_KEY = 'mw_sw_last_check_time';
    const VERSION_FILE = '/version.json';

    let swRegistration = null;
    let updateAvailable = false;
    let currentVersion = null;

    function initServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[SW] 浏览器不支持Service Worker');
            return;
        }

        navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none'
        })
            .then(function (registration) {
                swRegistration = registration;
                console.log('[SW] Service Worker 注册成功');

                registration.onupdatefound = function () {
                    const installingWorker = registration.installing;
                    installingWorker.onstatechange = function () {
                        if (installingWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                console.log('[SW] 新版本已安装，立即激活');
                                installingWorker.postMessage({ type: 'SKIP_WAITING' });
                            } else {
                                console.log('[SW] Service Worker 首次安装成功');
                            }
                        }
                    };
                };

                checkVersionFile();
                setInterval(throttledCheck, SW_UPDATE_CHECK_INTERVAL);
            })
            .catch(function (error) {
                console.error('[SW] Service Worker 注册失败:', error);
            });

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            console.log('[SW] Service Worker 已更新，刷新页面');
            window.location.reload();
        });
    }

    /**
     * 带节流的版本检查：距离上次检查不足 SW_RESUME_THROTTLE_MS 则跳过
     */
    function throttledCheck() {
        var now = Date.now();
        var lastCheck = parseInt(localStorage.getItem(SW_LAST_CHECK_KEY) || '0', 10);
        if (now - lastCheck < SW_RESUME_THROTTLE_MS) {
            return;
        }
        checkVersionFile();
    }

    function checkVersionFile() {
        // 记录本次检查时间（用于节流判断）
        localStorage.setItem(SW_LAST_CHECK_KEY, String(Date.now()));

        var url = VERSION_FILE + '?t=' + Date.now();
        fetch(url, { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function (data) {
                if (!data || !data.version) return;

                const lastVersion = localStorage.getItem(SW_LAST_VERSION_KEY);
                console.log('[SW] 版本检测 - 线上:', data.version, '本地:', lastVersion);

                if (lastVersion && lastVersion !== data.version) {
                    console.log('[SW] 检测到新版本，立即触发更新');
                    localStorage.setItem(SW_LAST_VERSION_KEY, data.version);
                    if (swRegistration) {
                        swRegistration.update().then(function () {
                            if (swRegistration.waiting) {
                                swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    }
                } else if (!lastVersion) {
                    localStorage.setItem(SW_LAST_VERSION_KEY, data.version);
                }
            })
            .catch(function (err) {
                console.warn('[SW] 版本文件检测失败:', err);
            });
    }

    function querySWVersion() {
        return new Promise(function (resolve, reject) {
            if (!navigator.serviceWorker.controller) {
                console.log('[SW] Service Worker 还未激活');
                resolve(null);
                return;
            }

            const messageChannel = new MessageChannel();
            messageChannel.port1.onmessage = function (event) {
                currentVersion = event.data;
                console.log('[SW] 当前版本:', event.data);
                resolve(event.data);
            };

            navigator.serviceWorker.controller.postMessage(
                { type: 'GET_VERSION' },
                [messageChannel.port2]
            );

            setTimeout(function () {
                reject(new Error('版本查询超时'));
            }, 5000);
        });
    }

    function getCurrentVersion() {
        return currentVersion;
    }

    window.MindWordSW = {
        checkForUpdate: checkVersionFile,
        isUpdateAvailable: function () {
            return updateAvailable;
        },
        getVersion: querySWVersion,
        getCurrentVersion: getCurrentVersion
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initServiceWorker);
    } else {
        initServiceWorker();
    }

    // 用户切回页面时检查更新，但有节流保护
    window.addEventListener('focus', throttledCheck);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            throttledCheck();
        }
    });
})();
