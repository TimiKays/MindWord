/**
 * MindWord Service Worker 注册和更新管理
 * 解决PWA桌面应用不更新的问题
 */

(function () {
    'use strict';

    const SW_UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次（更频繁）更新
    const SW_FORCE_UPDATE_KEY = 'mw_sw_force_update';
    const SW_LAST_UPDATE_KEY = 'mw_sw_last_update';

    let swRegistration = null;
    let updateAvailable = false;
    let currentVersion = null;

    function initServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[SW] 浏览器不支持Service Worker');
            return;
        }

        navigator.serviceWorker.register('/sw.js', {
            scope: '/'
        })
            .then(function (registration) {
                swRegistration = registration;
                console.log('[SW] Service Worker 注册成功，作用域:', registration.scope);

                // 查询当前版本
                querySWVersion();

                registration.onupdatefound = function () {
                    const installingWorker = registration.installing;
                    installingWorker.onstatechange = function () {
                        if (installingWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                console.log('[SW] 发现新版本，立即自动更新');
                                updateAvailable = true;
                                // 自动更新：不显示提示，直接发送 SKIP_WAITING
                                if (registration.waiting) {
                                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                                }
                            } else {
                                console.log('[SW] Service Worker 首次安装成功');
                                localStorage.setItem(SW_LAST_UPDATE_KEY, Date.now().toString());
                            }
                        }
                    };
                };

                checkForUpdate();

                setInterval(checkForUpdate, SW_UPDATE_CHECK_INTERVAL);

                checkForceUpdate();
            })
            .catch(function (error) {
                console.error('[SW] Service Worker 注册失败:', error);
            });

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            console.log('[SW] Service Worker 已更新，5秒后自动刷新页面');
            // 延迟刷新，给用户时间完成当前操作
            setTimeout(function () {
                window.location.reload();
            }, 5000);
        });
    }

    function checkForUpdate() {
        if (!swRegistration) {
            return;
        }

        swRegistration.update()
            .then(function () {
                console.log('[SW] 已检查Service Worker更新');
            })
            .catch(function (error) {
                console.error('[SW] 检查更新失败:', error);
            });
    }

    function checkForceUpdate() {
        const forceUpdateVersion = localStorage.getItem(SW_FORCE_UPDATE_KEY);
        const currentVersion = 'v49';

        if (forceUpdateVersion && forceUpdateVersion !== currentVersion) {
            console.log('[SW] 检测到强制更新标志，立即检查更新');
            checkForUpdate();
            localStorage.removeItem(SW_FORCE_UPDATE_KEY);
        }
    }

    function showUpdateNotification() {
        const existingNotification = document.getElementById('sw-update-notification');
        if (existingNotification) {
            return;
        }

        const notification = document.createElement('div');
        notification.id = 'sw-update-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #ffffff;
            color: #1f2937;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
            border: 1px solid #e5e7eb;
            z-index: 99999;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            max-width: 360px;
            animation: slideInRight 0.3s ease-out;
        `;

        notification.innerHTML = `
            <div style="flex-shrink: 0; width: 40px; height: 40px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1f2937" stroke-width="2">
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    <path d="M9 12l2 2 4-4"/>
                </svg>
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">发现新版本 🎉</div>
                <div style="color: #6b7280; font-size: 13px;">点击更新按钮立即体验最新功能</div>
            </div>
            <button id="sw-update-btn" style="
                background: #1f2937;
                color: #ffffff;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            " onmouseover="this.style.background='#374151'" onmouseout="this.style.background='#1f2937'">
                更新
            </button>
            <button id="sw-close-btn" style="
                background: transparent;
                color: #6b7280;
                border: none;
                padding: 4px;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
            " onmouseover="this.style.color='#1f2937'" onmouseout="this.style.color='#6b7280'">×</button>
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        document.getElementById('sw-update-btn').addEventListener('click', function () {
            if (swRegistration && swRegistration.waiting) {
                swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            notification.remove();
        });

        document.getElementById('sw-close-btn').addEventListener('click', function () {
            notification.remove();
        });

        setTimeout(function () {
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                setTimeout(function () {
                    notification.remove();
                }, 300);
            }
        }, 30000);
    }

    function forceUpdateSW(newVersion) {
        localStorage.setItem(SW_FORCE_UPDATE_KEY, newVersion);
        if (swRegistration) {
            swRegistration.update();
        }
    }

    // 显示带保存提示的更新通知
    function showUpdateNotificationWithSave() {
        const existingNotification = document.getElementById('sw-update-notification');
        if (existingNotification) {
            return;
        }

        const notification = document.createElement('div');
        notification.id = 'sw-update-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fef3c7;
            color: #92400e;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
            border: 2px solid #f59e0b;
            z-index: 99999;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            max-width: 400px;
            animation: slideInRight 0.3s ease-out;
        `;

        notification.innerHTML = `
            <div style="flex-shrink: 0; width: 40px; height: 40px; background: #fbbf24; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#92400e" stroke-width="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">⚠️ 发现新版本</div>
                <div style="color: #78350f; font-size: 13px;">您有未保存的数据，请先保存后再更新</div>
            </div>
            <button id="sw-save-update-btn" style="
                background: #f59e0b;
                color: #ffffff;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            " onmouseover="this.style.background='#d97706'" onmouseout="this.style.background='#f59e0b'">
                保存并更新
            </button>
            <button id="sw-close-btn" style="
                background: transparent;
                color: #92400e;
                border: none;
                padding: 4px;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
            " onmouseover="this.style.color='#78350f'" onmouseout="this.style.color='#92400e'">×</button>
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        document.getElementById('sw-save-update-btn').addEventListener('click', function () {
            // 触发保存操作
            if (typeof saveToLocalStorage === 'function') {
                saveToLocalStorage();
            }
            if (typeof debouncedSave === 'function') {
                debouncedSave();
            }
            // 等待保存完成后刷新
            setTimeout(function () {
                window.location.reload();
            }, 1000);
            notification.remove();
        });

        document.getElementById('sw-close-btn').addEventListener('click', function () {
            notification.remove();
        });

        // 60秒后自动刷新（即使用户没操作）
        setTimeout(function () {
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                setTimeout(function () {
                    notification.remove();
                    window.location.reload();
                }, 300);
            }
        }, 60000);
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

            // 超时处理
            setTimeout(function () {
                reject(new Error('版本查询超时'));
            }, 5000);
        });
    }

    function getCurrentVersion() {
        return currentVersion;
    }

    window.MindWordSW = {
        checkForUpdate: checkForUpdate,
        forceUpdate: forceUpdateSW,
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

    window.addEventListener('load', function () {
        setTimeout(function () {
            if (swRegistration) {
                swRegistration.update();
            }
        }, 5000);
    });

    // 页面获得焦点时立即检查更新（用户切换回应用时）
    window.addEventListener('focus', function () {
        console.log('[SW] 页面获得焦点，立即检查更新');
        checkForUpdate();
        localStorage.setItem(SW_LAST_UPDATE_KEY, Date.now().toString());
    });

    // 页面重新可见时立即检查更新（从后台恢复时）
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            console.log('[SW] 页面重新可见，立即检查更新');
            checkForUpdate();
        }
    });
})();
