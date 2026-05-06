/**
 * MindWord Service Worker 注册和更新管理 - 强制尽早更新版
 * 核心策略：发现新版本立即自动刷新，不弹窗不询问
 */

(function () {
    'use strict';

    const SW_UPDATE_CHECK_INTERVAL = 30 * 1000;
    const SW_LAST_VERSION_KEY = 'mw_sw_last_version';
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
                setInterval(checkVersionFile, SW_UPDATE_CHECK_INTERVAL);
            })
            .catch(function (error) {
                console.error('[SW] Service Worker 注册失败:', error);
            });

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            console.log('[SW] Service Worker 已更新，刷新页面');
            window.location.reload();
        });
    }

    function checkVersionFile() {
        const url = VERSION_FILE + '?t=' + Date.now();
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

    window.addEventListener('focus', function () {
        checkVersionFile();
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            checkVersionFile();
        }
    });
})();
