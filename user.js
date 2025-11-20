/*
MindWord应用的用户认证系统核心模块，主要功能包括：

## 主要功能
### 1. LeanCloud认证初始化
- 初始化LeanCloud SDK（使用AppID和AppKey）
- 配置服务器地址
- 错误处理和容错机制
### 2. 用户状态管理
- refreshAuthUI() : 刷新用户界面状态
  - 优先使用 AV.User.current() 获取当前用户
  - 如果失败，从localStorage手动恢复用户数据
  - 创建模拟用户对象保持兼容性
  - 更新UI显示（用户名、登录/登出按钮状态）
### 3. 退出登录功能
- 提供三种退出选项：
  - 保存模式 : 只清除用户数据，保留所有文档数据
  - 不保存模式 : 清除所有数据（包括用户和文档数据）
  - 取消 : 取消退出操作
- 自定义对话框界面
- 完整的错误处理和用户反馈
### 4. 智能同步机制
- 登录后根据语言自动选择同步方式：
  - 中文模式 : 使用LeanCloud同步
  - 英文模式 : 使用Cloudflare Worker同步
- 延迟重试机制确保组件完全初始化
### 5. 用户菜单交互
- 下拉菜单系统
- 点击外部区域自动关闭（包括iframe）
- ESC键关闭支持
- 悬停效果和动画
- 菜单项事件处理
*/
(function initAuthArea() {
  // 替换为你的实际 AppID/AppKey（不要使用 Master Key）
  var APP_ID = 'MQ3fZEqOgskJBWGoxOwqG1nT-gzGzoHsz';
  var APP_KEY = 'bhU0peMhrAVKEJ2OQbiFKXwC';

  try {
    if (typeof AV !== 'undefined' && AV && !AV.applicationId) {
      // 从 LeanCloud 控制台复制“API 服务器地址”到 SERVER_URL（必填）
      var SERVER_URL = 'https://mq3fzeqo.lc-cn-n1-shared.com';
      if (!SERVER_URL || SERVER_URL.indexOf('http') !== 0) {
        console.error('[AUTH] LeanCloud SERVER_URL 未设置，请到控制台复制“API 服务器地址”并替换占位符 LEANCLOUD_SERVER_URL');
      }
      AV.init({ appId: APP_ID, appKey: APP_KEY, serverURL: SERVER_URL });
    }
  } catch (e) {
    console.warn('[AUTH] AV init failed', e);
  }

  function refreshAuthUI() {
    var user = null;
    try {
      // 首先尝试AV.User.current()
      user = (typeof AV !== 'undefined' && AV.User && AV.User.current) ? AV.User.current() : null;

      // 如果AV.User.current()返回null，尝试从localStorage手动获取
      if (!user) {
        var appId = 'MQ3fZEqOgskJBWGoxOwqG1nT-gzGzoHsz';
        var localUserKey = 'AV/' + appId + '/currentUser';
        var localUserData = localStorage.getItem(localUserKey);

        if (localUserData) {
          try {
            var userObj = JSON.parse(localUserData);
            if (userObj && userObj.objectId) {
              // 创建模拟用户对象
              user = {
                id: userObj.objectId,
                username: userObj.username,
                email: userObj.email,
                get: function (key) {
                  return userObj[key];
                }
              };
              console.log('[AUTH] 从localStorage恢复用户:', userObj.username);
            }
          } catch (e) {
            console.warn('[AUTH] 解析本地用户数据失败:', e);
          }
        }
      }
    } catch (_) { }

    var link = document.getElementById('auth-link');
    var userBox = document.getElementById('auth-user');
    var nameSpan = document.getElementById('auth-username');

    if (user && userBox && nameSpan) {
      // 修复：优先使用user.username，因为localStorage中的数据username在根对象
      var username = user.username || (user.get && (user.get('username') || user.get('email'))) || '已登录';
      nameSpan.textContent = username;
      // 同时更新菜单中的用户名
      var menuUsername = document.getElementById('menu-username');
      if (menuUsername) menuUsername.textContent = username;
      // 登录后隐藏"注册/登录"按钮，显示用户区域
      if (link) link.style.display = 'none';
      userBox.style.display = 'inline-flex';
      console.log('[AUTH] 用户已登录:', username);
    } else {
      if (link) link.style.display = 'inline-flex';
      if (userBox) userBox.style.display = 'none';
      console.log('[AUTH] 用户未登录或获取失败');
    }
  }

  // 退出登录
  try {
    var logoutBtn = document.getElementById('auth-logout');
    var hiddenLogoutBtn = document.getElementById('auth-logout-menu');
    console.log('[AUTH] 退出登录按钮检查 - 可见按钮:', !!logoutBtn, '隐藏按钮:', !!hiddenLogoutBtn);

    // 优先绑定隐藏按钮的事件，因为可见菜单项是通过onclick触发隐藏按钮的
    if (hiddenLogoutBtn) {
      console.log('[AUTH] 绑定隐藏退出登录按钮事件');
      hiddenLogoutBtn.addEventListener('click', function () {
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
        function handleLogoutChoice(choice) {
          // 移除对话框
          if (dialog) dialog.remove();

          // 如果用户选择取消，直接返回
          if (choice === 'cancel') {
            console.log('[AUTH] 用户取消退出登录');
            return;
          }

          // 执行退出登录
          try {
            if (typeof AV !== 'undefined' && AV && AV.User && AV.User.logOut) {
              AV.User.logOut().then(function () {
                try { showSuccess && showSuccess('已退出登录'); } catch (_) { }

                // 清理用户相关数据
                var appId = 'MQ3fZEqOgskJBWGoxOwqG1nT-gzGzoHsz';
                localStorage.removeItem('AV/' + appId + '/currentUser');
                localStorage.removeItem('AV/' + appId + '/subscriptionId');

                // 根据用户选择处理本地数据
                if (choice === 'nosave') {
                  // 不保存模式：清除所有数据（包括用户数据和文档数据）
                  var keysToKeep = []; // 不保留任何数据
                  var keysToRemove = [];

                  for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    if (keysToKeep.indexOf(key) === -1) {
                      keysToRemove.push(key);
                    }
                  }

                  keysToRemove.forEach(function (key) {
                    localStorage.removeItem(key);
                  });

                  console.log('[AUTH] 已清除所有本地数据（包括文档数据）');
                  try { showSuccess && showSuccess('已清除所有本地数据'); } catch (_) { }
                } else if (choice === 'save') {
                  // 保存模式：只清除用户数据，保留所有文档数据
                  console.log('[AUTH] 保留所有本地文档数据');
                  try { showSuccess && showSuccess('已保留所有本地文档数据'); } catch (_) { }
                }

                refreshAuthUI();
                // 刷新全页，确保 iframe 子页也感知状态
                setTimeout(function () { location.reload(); }, 250);
              }).catch(function (err) {
                console.warn('[AUTH] logout failed', err);
                try { showError && showError('退出失败：' + (err && err.message ? err.message : '未知错误')); } catch (_) { }
              });
            }
          } catch (e) { console.warn('[AUTH] logout error', e); }
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

        console.log('[AUTH] 退出登录对话框已创建并绑定事件');
      });
    }
  } catch (e) { console.warn('[AUTH] 退出登录初始化错误:', e); }

  // 首次渲染
  refreshAuthUI();
  // 刷新云同步UI（如果已加载脚本）
  try { if (typeof window.__mw_initCloudSyncUI === 'function') window.__mw_initCloudSyncUI(); } catch (_) { }

  // 延迟重试，确保LeanCloud SDK完全初始化
  setTimeout(function () {
    console.log('[AUTH] 延迟刷新认证状态');
    refreshAuthUI();
  }, 1000);

  // 如果用户从登录页面返回，可能需要更长时间
  if (document.referrer && document.referrer.includes('auth.html')) {
    setTimeout(function () {
      console.log('[AUTH] 从登录页面返回，再次刷新认证状态');
      refreshAuthUI();
    }, 2000);

    // 登录后根据当前语言自动执行同步
    setTimeout(function () {
      console.log('[AUTH] 登录后自动同步检测');
      try {
        const currentLang = (function () {
          try {
            return localStorage.getItem('mw_lang') || 'zh';
          } catch (_) {
            return 'zh';
          }
        })();

        if (currentLang === 'zh') {
          // 中文模式：使用LeanCloud同步
          if (window.MW_LC_SYNC && typeof window.MW_LC_SYNC.sync === 'function') {
            console.log('[AUTH] 检测到中文模式，执行LeanCloud自动同步');
            window.MW_LC_SYNC.sync();
          } else {
            console.log('[AUTH] LeanCloud同步未准备好，等待初始化');
            // 如果同步功能还没准备好，稍后再试
            setTimeout(function () {
              if (window.MW_LC_SYNC && typeof window.MW_LC_SYNC.sync === 'function') {
                console.log('[AUTH] 重试LeanCloud自动同步');
                window.MW_LC_SYNC.sync();
              }
            }, 3000);
          }
        } else {
          // 英文模式：使用Cloudflare Worker同步
          if (typeof window.bidirectionalSyncLatest === 'function') {
            console.log('[AUTH] 检测到英文模式，执行Cloudflare Worker自动同步');
            window.bidirectionalSyncLatest();
          } else {
            console.log('[AUTH] Cloudflare Worker同步未准备好，等待初始化');
            setTimeout(function () {
              if (typeof window.bidirectionalSyncLatest === 'function') {
                console.log('[AUTH] 重试Cloudflare Worker自动同步');
                window.bidirectionalSyncLatest();
              }
            }, 3000);
          }
        }
      } catch (error) {
        console.error('[AUTH] 自动同步失败:', error);
      }
    }, 4000); // 比认证状态刷新稍晚一些，确保所有组件都初始化完成
  }

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

          // 菜单打开时刷新云同步状态
          setTimeout(() => {
            if (typeof window.updateCloudSyncStatusMenu === 'function') {
              window.updateCloudSyncStatusMenu();
            }
            if (typeof window.MW_LC_SYNC !== 'undefined' && typeof window.MW_LC_SYNC.updateStatus === 'function') {
              window.MW_LC_SYNC.updateStatus();
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
    console.warn('[AUTH] 个人菜单初始化失败:', e);
  }
})();
