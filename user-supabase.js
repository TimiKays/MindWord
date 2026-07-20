/**
 * MindWord - Supabase 用户认证模块
 * 
 * 说明：
 * 1. 此文件是 user.js 的 Supabase 版本
 * 2. 与原 user.js 保持 API 兼容
 * 3. 图片存储逻辑保持不变
 * 4. 原 user.js 保留，可随时切换回 LeanCloud
 */

(function initSupabaseAuthArea() {
  'use strict';

  const UNIFIED_MODE = !!(window.MW_ACCOUNT_MODE && window.MW_ACCOUNT_MODE.isUnified());
  const MODULE_NAME = UNIFIED_MODE ? '[TimiAuth-Internal]' : '[Supabase-Auth]';

  // 初始化 Supabase
  let supabase = null;

  function initSupabase() {
    if (supabase) return supabase;

    if (typeof window.getSupabase !== 'function') {
      console.error(MODULE_NAME, 'supabase-config.js 未加载');
      return null;
    }

    supabase = window.getSupabase();
    return supabase;
  }

  /**
   * 获取当前用户
   */
  async function getCurrentUser() {
    if (UNIFIED_MODE) {
      if (!window.MW_TIMI_CLOUD) return null;
      return window.MW_TIMI_CLOUD.getCurrentUser();
    }
    const client = initSupabase();
    if (!client) return null;

    const { data: { user }, error } = await client.auth.getUser();
    if (error) {
      console.error(MODULE_NAME, '获取用户失败:', error);
      return null;
    }
    return user;
  }

  /**
   * 刷新认证 UI（不请求API，只根据UI状态判断）
   */
  function getSupabaseSessionKey() {
    if (typeof window.getSupabaseConfig === 'function') {
      const config = window.getSupabaseConfig();
      if (config && config.storageKey) return config.storageKey;
    }
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return key;
    }
    return 'sb-ohvsfqdbcelmokkslqlw-auth-token';
  }

  function renderAuthUI(user, isLoggedIn) {
    var link = document.getElementById('auth-link');
    var userBox = document.getElementById('auth-user');
    var nameSpan = document.getElementById('auth-username');

    if (UNIFIED_MODE && link && window.MW_ACCOUNT_MODE) {
      link.href = window.MW_ACCOUNT_MODE.buildLoginUrl(window.location.href);
    }

    if (isLoggedIn && userBox && nameSpan) {
      var username = user && (user.nickname || user.email) || '已登录';
      var ownedBadge = UNIFIED_MODE
        ? nameSpan.querySelector('[data-timikays-badge-owned="true"]')
        : null;
      nameSpan.textContent = username;
      if (ownedBadge) nameSpan.appendChild(ownedBadge);
      var menuUsername = document.getElementById('menu-username');
      if (menuUsername) menuUsername.textContent = username;
      var menuEmail = document.getElementById('menu-email');
      if (menuEmail && user && user.email) menuEmail.textContent = user.email;
      if (link) link.style.display = 'none';
      userBox.style.display = 'inline-flex';
      console.log(MODULE_NAME, '用户已登录');
    } else {
      if (link) link.style.display = 'inline-flex';
      if (userBox) userBox.style.display = 'none';
      console.log(MODULE_NAME, '用户未登录');
    }

    if (typeof window.__mw_refreshSyncLangUI === 'function') {
      setTimeout(function () {
        window.__mw_refreshSyncLangUI();
        console.log(MODULE_NAME, '已刷新同步控制区域显示');
      }, 100);
    }
  }

  function refreshAuthUI() {
    if (UNIFIED_MODE) {
      var cachedUser = window.TimiAuth && typeof window.TimiAuth.getCurrentUser === 'function'
        ? window.TimiAuth.getCurrentUser()
        : null;
      renderAuthUI(cachedUser, !!cachedUser);
      Promise.resolve(window.MW_ACCOUNT_MODE.ready)
        .then(function () { return getCurrentUser(); })
        .then(function (user) { renderAuthUI(user, !!user); })
        .catch(function (error) {
          console.warn(MODULE_NAME, '账户状态暂时无法确认，本地编辑仍可使用:', error.message);
          renderAuthUI(cachedUser, !!cachedUser);
        });
      return;
    }

    var sessionKey = getSupabaseSessionKey();
    var supabaseSession = localStorage.getItem(sessionKey);
    const isLoggedIn = !!supabaseSession;
    var user = null;

    if (isLoggedIn) {
      try {
        const session = JSON.parse(supabaseSession);
        user = session.user || null;
      } catch (_) { }
    }
    renderAuthUI(user, isLoggedIn);
  }

  // 首次渲染（不请求API）
  refreshAuthUI();

  // 退出登录事件绑定 - 确保在DOM准备好之后执行
  document.addEventListener('DOMContentLoaded', function () {
    initLogoutHandler();
  });

  // 如果DOM已经加载完成，立即初始化
  if (document.readyState === 'loading') {
    // DOM还在加载中，等待DOMContentLoaded事件
  } else {
    // DOM已经加载完成，立即初始化
    initLogoutHandler();
  }

  function initLogoutHandler() {
    try {
      var logoutBtn = document.getElementById('auth-logout');
      var hiddenLogoutBtn = document.getElementById('auth-logout-menu');
      console.log(MODULE_NAME, '退出登录按钮检查 - 可见按钮:', !!logoutBtn, '隐藏按钮:', !!hiddenLogoutBtn);

      // 优先绑定隐藏按钮的事件，因为可见菜单项是通过onclick触发隐藏按钮的
      if (hiddenLogoutBtn) {
        console.log(MODULE_NAME, '绑定隐藏退出登录按钮事件');

        // 直接使用原按钮绑定事件，不替换元素（避免ID引用问题）
        // 先移除可能存在的旧事件监听器（通过克隆替换自身）
        const parent = hiddenLogoutBtn.parentNode;
        if (parent) {
          const newBtn = hiddenLogoutBtn.cloneNode(true);
          parent.replaceChild(newBtn, hiddenLogoutBtn);
          // 更新引用到新按钮
          hiddenLogoutBtn = newBtn;
        }

        hiddenLogoutBtn.addEventListener('click', async function () {
          // 创建自定义对话框
          var dialogHtml = `
            <div id="logout-dialog" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
              <div style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 400px; text-align: center;">
                <h3 style="margin: 0 0 16px 0; color: #333;">确认退出登录</h3>
                <p style="margin: 0 0 24px 0; color: #666;">请选择对本地数据的处理方式：</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                  <button id="logout-save" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                  <button id="logout-nosave" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">不保存</button>
                  <button id="logout-cancel" style="padding: 8px 16px; background: #9e9e9e; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
                </div>
              </div>
            </div>
          `;

          // 添加对话框到页面
          document.body.insertAdjacentHTML('beforeend', dialogHtml);
          var dialog = document.getElementById('logout-dialog');

          // 处理按钮点击
          async function handleLogoutChoice(choice) {
            // 移除对话框
            if (dialog) dialog.remove();

            // 如果用户选择取消，直接返回
            if (choice === 'cancel') {
              console.log(MODULE_NAME, '用户取消退出登录');
              return;
            }

            // 执行退出登录
            try {
              // 显示处理中提示
              try { showInfo && showInfo('正在处理，请稍候...'); } catch (_) { }

              const client = UNIFIED_MODE ? null : initSupabase();
              if (UNIFIED_MODE) {
                await window.MW_ACCOUNT_MODE.ready;
                await window.TimiAuth.logout();
                console.log(MODULE_NAME, '统一账户退出登录成功');
              } else if (client) {
                // 尝试调用Supabase退出，但不阻塞本地清理
                try {
                  const { error } = await client.auth.signOut();
                  if (error) {
                    console.warn(MODULE_NAME, 'Supabase退出登录返回错误（继续清理本地状态）:', error);
                  } else {
                    console.log(MODULE_NAME, 'Supabase退出登录成功');
                  }
                } catch (signOutError) {
                  console.warn(MODULE_NAME, 'Supabase退出登录调用失败（继续清理本地状态）:', signOutError);
                }
              } else {
                console.warn(MODULE_NAME, 'Supabase客户端未初始化，跳过服务端退出，直接清理本地状态');
              }

              // 根据用户选择处理本地数据
              if (choice === 'nosave') {
                // 不保存模式：清除所有数据（包括用户数据和文档数据）
                console.log(MODULE_NAME, '开始清除本地数据...');

                // 先立即清除 localStorage（同步操作，很快）
                var keysToRemove = [];
                for (var i = 0; i < localStorage.length; i++) {
                  var key = localStorage.key(i);
                  if (key) keysToRemove.push(key);
                }
                keysToRemove.forEach(function (key) {
                  localStorage.removeItem(key);
                });
                console.log(MODULE_NAME, '已清除 localStorage 数据，共', keysToRemove.length, '项');

                // IndexedDB 清理改为异步不阻塞，设置超时
                var indexedDBPromise = Promise.resolve();
                if (window.imageStorage && typeof window.imageStorage.clearAllImages === 'function') {
                  indexedDBPromise = Promise.race([
                    window.imageStorage.clearAllImages(),
                    new Promise(function (_, reject) {
                      setTimeout(function () { reject(new Error('IndexedDB清理超时')); }, 2000);
                    })
                  ]).then(function () {
                    console.log(MODULE_NAME, '已清除IndexedDB中的图片数据');
                  }).catch(function (error) {
                    console.warn(MODULE_NAME, '清除IndexedDB图片数据失败或超时:', error);
                  });
                }

                // 等待最多2秒后刷新页面，不无限等待
                await indexedDBPromise;
                console.log(MODULE_NAME, '已清除所有本地数据（包括文档数据）');
              } else if (choice === 'save') {
                // 保存模式：只清除用户数据，保留所有文档数据
                console.log(MODULE_NAME, '保留所有本地文档数据');
              }

              // 刷新全页，确保 iframe 子页也感知状态
              console.log(MODULE_NAME, '准备刷新页面...');
              location.reload();
            } catch (e) {
              console.warn(MODULE_NAME, 'logout error', e);
              try { showError && showError('退出失败：' + (e && e.message ? e.message : '未知错误')); } catch (_) { }
            }
          }

          // 绑定按钮事件
          document.getElementById('logout-save').addEventListener('click', function () { handleLogoutChoice('save'); });
          document.getElementById('logout-nosave').addEventListener('click', function () { handleLogoutChoice('nosave'); });
          document.getElementById('logout-cancel').addEventListener('click', function () { handleLogoutChoice('cancel'); });

          // 点击背景也可以取消
          dialog.addEventListener('click', function (e) {
            if (e.target === dialog) {
              handleLogoutChoice('cancel');
            }
          });

          console.log(MODULE_NAME, '退出登录对话框已创建并绑定事件');
        });

        console.log(MODULE_NAME, '退出登录按钮事件绑定成功');
      } else {
        console.warn(MODULE_NAME, '未找到退出登录按钮 auth-logout-menu');
      }
    } catch (e) {
      console.error(MODULE_NAME, '退出登录初始化错误:', e);
    }
  }

  // 刷新云同步UI（统一使用Supabase方案）
  try {
    if (typeof window.MW_SPB_SYNC !== 'undefined' && typeof window.MW_SPB_SYNC.updateStatus === 'function') {
      window.MW_SPB_SYNC.updateStatus();
    }
  } catch (_) { }

  // 延迟重试，确保Supabase SDK完全初始化
  setTimeout(function () {
    console.log(MODULE_NAME, '延迟刷新认证状态');
    refreshAuthUI();
  }, 1000);

  // 如果用户从登录页面返回，可能需要更长时间
  if (document.referrer && (document.referrer.includes('auth.html') || document.referrer.includes('auth-supabase.html'))) {
    setTimeout(function () {
      console.log(MODULE_NAME, '从登录页面返回，再次刷新认证状态');
      refreshAuthUI();
    }, 2000);

    // 登录后执行Supabase同步（每次登录都触发）
    // 立即设置登录标记，确保页面加载时的检查能识别到这是刚登录的状态
    localStorage.setItem('mw_just_logged_in', 'true');
    console.log(MODULE_NAME, '已设置登录标记，准备执行自动同步');

    setTimeout(function () {
      console.log(MODULE_NAME, '登录后自动同步检测');

      // 检查Supabase认证状态是否准备好
      async function checkAndSync() {
        try {
          let user;
          if (UNIFIED_MODE) {
            user = await getCurrentUser();
          } else {
            const client = initSupabase();
            if (!client) {
              console.log(MODULE_NAME, 'Supabase未初始化，等待...');
              return false;
            }
            const result = await client.auth.getUser();
            user = result.data && result.data.user;
          }
          if (!user || !user.id) {
            console.log(MODULE_NAME, '用户未登录，等待...');
            return false;
          }

          // 检查同步功能是否准备好
          if (!window.MW_SPB_SYNC || typeof window.MW_SPB_SYNC.sync !== 'function') {
            console.log(MODULE_NAME, 'Supabase同步功能未准备好，等待...');
            return false;
          }

          console.log(MODULE_NAME, '所有条件已满足，执行登录后自动同步');
          try {
            await window.MW_SPB_SYNC.sync();
            return true;
          } catch (syncError) {
            console.error(MODULE_NAME, '同步执行失败:', syncError);
            setTimeout(() => {
              if (window.showError) {
                window.showError(`登录后自动同步失败: ${syncError.message || '未知错误'}`);
              } else {
                alert(`登录后自动同步失败: ${syncError.message || '未知错误'}`);
              }
            }, 100);
            return false;
          }
        } catch (error) {
          console.error(MODULE_NAME, '检查同步条件时出错:', error);
          return false;
        }
      }

      // 立即尝试一次
      checkAndSync().then(success => {
        if (!success) {
          console.log(MODULE_NAME, '登录后自动同步失败，建议用户手动重试');
          if (window.showInfo) {
            window.showInfo('同步失败，请检查网络后手动点击同步按钮重试');
          }
        }
      });
    }, 1500); // 1.5秒延迟，平衡用户体验和组件初始化时间
  }

  // 页面加载时检查是否需要自动同步（非登录情况，带时间间隔限制）
  // 延迟必须比登录后同步的延迟(1.5s) + 重试时间更长，确保登录同步先执行
  setTimeout(function () {
    // 如果是刚刚登录，则跳过这次检查（让登录后的同步来处理）
    if (localStorage.getItem('mw_just_logged_in') === 'true') {
      console.log(MODULE_NAME, '检测到刚登录状态，跳过页面加载时的自动同步检查');
      localStorage.removeItem('mw_just_logged_in'); // 清除标记
      return;
    }

    console.log(MODULE_NAME, '页面加载自动同步检测');

    // 检查是否需要显示同步对话框
    const lastSyncTime = Number(localStorage.getItem('mw_last_auto_sync_time') || 0);
    const lastDailyReminderTime = Number(localStorage.getItem('mw_last_daily_reminder_time') || 0);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // 距离上次自动同步超过24小时，或者今天还没提醒过
    const shouldShowSync = (now - lastSyncTime > oneDay) || (now - lastDailyReminderTime > oneDay);

    if (shouldShowSync) {
      // 不再自动请求用户状态和同步
      // 只在用户点击同步按钮时才进行同步
      console.log(MODULE_NAME, '超过24小时未同步，建议用户手动同步');
      // 可以在这里显示一个提示，但不自动请求
      localStorage.setItem('mw_last_daily_reminder_time', now);
    } else {
      console.log(MODULE_NAME, '距离上次同步不足24小时，跳过自动同步');
    }
  }, 5000); // 稍晚一些，确保登录后的同步已经处理完毕


  // 个人菜单下拉功能（增强版，支持点击外部区域自动关闭，包括iframe）
  try {
    const userDropdown = document.querySelector('.user-dropdown');
    const userMenuDropdown = document.querySelector('.user-menu-dropdown');
    const dropdownArrow = document.querySelector('.dropdown-arrow');

    if (userDropdown && userMenuDropdown) {
      // 点击用户名或箭头展开/收起菜单
      userDropdown.addEventListener('click', function (e) {
        e.stopPropagation();
        const isVisible = userMenuDropdown.style.display === 'block';
        userMenuDropdown.style.display = isVisible ? 'none' : 'block';
        if (dropdownArrow) {
          dropdownArrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        }

        // 如果菜单打开，设置点击外部关闭处理
        if (!isVisible) {
          setupUserMenuClickOutsideHandler();

          // 菜单打开时只刷新本地状态显示（不请求云端）
          setTimeout(() => {
            if (typeof window.MW_SPB_SYNC !== 'undefined' && typeof window.MW_SPB_SYNC.displayLocalStatus === 'function') {
              window.MW_SPB_SYNC.displayLocalStatus();
            }
          }, 100);
        } else {
          removeUserMenuClickOutsideHandler();
        }
      });

      // 点击菜单内部不关闭菜单
      userMenuDropdown.addEventListener('click', function (e) {
        e.stopPropagation();
      });

      // 菜单项悬停效果
      const menuItems = userMenuDropdown.querySelectorAll('.menu-item');
      menuItems.forEach(item => {
        item.addEventListener('mouseenter', function () {
          this.style.backgroundColor = '#f8fafc';
        });
        item.addEventListener('mouseleave', function () {
          this.style.backgroundColor = 'transparent';
        });
      });

      // 点击外部区域自动关闭菜单（增强版，支持iframe）
      let userMenuClickOutsideHandler = null;
      let userMenuWindowBlurHandler = null;

      function setupUserMenuClickOutsideHandler() {
        if (userMenuClickOutsideHandler) return; // 避免重复绑定

        let isProcessingClick = false;

        // 处理点击事件
        userMenuClickOutsideHandler = function (event) {
          if (isProcessingClick) return;

          // 检查点击是否在菜单内部或触发按钮上
          const isClickInsideMenu = userMenuDropdown.contains(event.target);
          const isClickOnDropdown = userDropdown.contains(event.target);

          if (!isClickInsideMenu && !isClickOnDropdown) {
            isProcessingClick = true;
            closeUserMenu();
            setTimeout(() => { isProcessingClick = false; }, 100);
          }
        };

        // 处理窗口失焦事件（处理iframe点击）
        userMenuWindowBlurHandler = function () {
          // 延迟检查，确保iframe点击被捕获
          setTimeout(() => {
            closeUserMenu();
          }, 50);
        };

        // 绑定事件（使用捕获阶段确保优先处理）
        document.addEventListener('click', userMenuClickOutsideHandler, true);
        window.addEventListener('blur', userMenuWindowBlurHandler);
      }

      function removeUserMenuClickOutsideHandler() {
        if (userMenuClickOutsideHandler) {
          document.removeEventListener('click', userMenuClickOutsideHandler, true);
          userMenuClickOutsideHandler = null;
        }
        if (userMenuWindowBlurHandler) {
          window.removeEventListener('blur', userMenuWindowBlurHandler);
          userMenuWindowBlurHandler = null;
        }
      }

      function closeUserMenu() {
        userMenuDropdown.style.display = 'none';
        if (dropdownArrow) {
          dropdownArrow.style.transform = 'rotate(0deg)';
        }
        removeUserMenuClickOutsideHandler();
      }

      // 添加ESC键关闭菜单支持
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && userMenuDropdown.style.display === 'block') {
          closeUserMenu();
        }
      });
    }
  } catch (e) {
    console.warn(MODULE_NAME, '个人菜单初始化失败:', e);
  }

  // 暴露全局函数供其他模块使用
  window.MW_SPB_AUTH = {
    getCurrentUser: getCurrentUser,
    refreshAuthUI: refreshAuthUI,
    isLoggedIn: async function () {
      const user = await getCurrentUser();
      return !!user;
    }
  };

  if (UNIFIED_MODE) {
    Promise.resolve(window.MW_ACCOUNT_MODE.ready).then(function () {
      window.TimiAuth.onAuthChange(function () {
        refreshAuthUI();
      });
    }).catch(function () {
      // SDK 加载失败时保留登录入口和本地编辑能力。
    });
  }

  console.log(MODULE_NAME, '模块已加载');
})();
