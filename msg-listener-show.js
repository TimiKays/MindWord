// ===================================
// 全局通知系统
// ===================================

/**
 * 显示全局通知消息（替代alert）
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型：success, danger, warning, info
 * @param {number} duration - 显示时长（毫秒）
 */
function showNotification(message, type = 'info', duration = 1500) {
  if (typeof $ === 'undefined') {
    // 如果jQuery不可用，回退到alert
    alert(message);
    return;
  }

  // 统一颜色方案
  const typeStyles = {
    success: 'background-color: #28a745; border-color: #28a745; color: white;', // 绿色
    danger: 'background-color: #dc3545; border-color: #dc3545; color: white;',   // 红色
    warning: 'background-color: #ffc107; border-color: #ffc107; color: #212529;', // 黄色
    info: 'background-color: #17a2b8; border-color: #17a2b8; color: white;'     // 蓝色
  };

  // 创建通知容器（如果不存在）——右对齐多条通知，垂直排列
  if ($('#global-notification-container').length === 0) {
    $('body').append('<div id="global-notification-container" style="position: fixed; top: 80px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 6px; align-items: flex-end;"></div>');
  }

  // 创建通知元素
  const notificationId = 'global-notification-' + Date.now();
  const notificationHtml = `
                <div id="${notificationId}" class="alert alert-dismissible fade show" 
                     style="display: inline-flex; align-items: center; height: 24px; line-height: 14px; padding: 0 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.08); margin: 0; white-space: nowrap; ${typeStyles[type] || typeStyles.info}">
                    <span style="font-size:12px; padding-right:16px;">${message}</span>
                    <button type="button" class="close" data-dismiss="alert" aria-label="Close" style="color: inherit; opacity: 0.9; padding:0 6px; height:20px; line-height:20px; background:transparent; border:none; display:inline-flex; align-items:center; justify-content:center;">
                        <span aria-hidden="true" style="font-size:12px; line-height:20px;">&times;</span>
                    </button>
                </div>
            `;

  // 添加到通知容器
  $('#global-notification-container').append(notificationHtml);

  // 自动移除
  setTimeout(() => {
    const $notification = $(`#${notificationId}`);
    $notification.fadeOut(300, function () {
      $notification.remove();
      // 重新排列剩余通知
      rearrangeGlobalNotifications();
    });
  }, duration);

  // 点击关闭按钮时移除
  $(`#${notificationId} .close`).click(() => {
    const $notification = $(`#${notificationId}`);
    $notification.fadeOut(300, function () {
      $notification.remove();
      // 重新排列剩余通知
      rearrangeGlobalNotifications();
    });
  });
}

/**
 * 重新排列全局通知
 */
function rearrangeGlobalNotifications() {
  const $container = $('#global-notification-container');
  const $notifications = $container.children('.alert');

  if ($notifications.length === 0) {
    // 如果没有通知了，移除容器
    $container.remove();
    return;
  }

  // 重新计算位置
  $notifications.each(function (index) {
    const $notification = $(this);
    // 添加平滑过渡效果
    $notification.css('transition', 'transform 0.3s ease');
    $notification.css('transform', `translateY(0)`);
  });
}

/**
 * 显示成功通知
 */
function showSuccess(message, duration = 1500) {
  showNotification(message, 'success', duration);
}

/**
 * 显示错误通知
 */
function showError(message, duration = 3000) {
  showNotification(message, 'danger', duration);
}

/**
 * 显示警告通知
 */
function showWarning(message, duration = 2000) {
  showNotification(message, 'warning', duration);
}

/**
 * 显示信息通知
 */
function showInfo(message, duration = 1500) {
  showNotification(message, 'info', duration);
}


/**
         * 处理来自子页面的通知消息
         * - 新增处理 mw_editing_mode 消息以设置全局抑制标志 window.__mw_global_suppress_toasts
         * - 当全局抑制生效时，对 type==='notification' 的消息仅记录到 console 不展示 UI 通知
         */
function handleNotificationMessage(event) {
  // 验证消息来源
  if (!event.data || !event.data.type) return;

  // 先处理编辑模式开关消息（由子 iframe 广播）
  try {
    if (event.data.type === 'mw_editing_mode') {
      try {
        window.__mw_global_suppress_toasts = !!event.data.editing;
        console.log('[INDEX] mw_editing_mode ->', window.__mw_global_suppress_toasts);
      } catch (e) { /* ignore */ }
      return;
    }
  } catch (e) { /* ignore */ }

  // 转发来自思维导图的节点选中消息到 editor iframe（用于滚动/高亮）
  try {
    if (event.data.type === 'mindmap-node-selected') {
      // 找到 editor 面板 iframe（基于 PAGE_CONFIG 或常见选择器）
      var editorIframe = document.querySelector('iframe[data-panel="editor"], iframe#panel-editor, iframe[src*="editor/editor.html"]');
      // 找到 preview/md2word 面板 iframe
      var previewIframe = document.querySelector('iframe[data-panel="preview"], iframe#panel-preview, iframe[src*="md2word/md2word.html"], iframe[src*="preview"]');
      var payload = event.data;
      var forwardEditor = {
        type: 'editor-scroll-to',
        nodeid: payload.nodeid,
        raw: payload.raw,
        parentPath: payload.parentPath
      };
      var forwardPreview = {
        type: 'preview-scroll-to',
        nodeid: payload.nodeid,
        raw: payload.raw,
        parentPath: payload.parentPath
      };

      // 转发到 editor iframe
      if (editorIframe && editorIframe.contentWindow) {
        try {
          editorIframe.contentWindow.postMessage(forwardEditor, '*');
          console.log('[INDEX FORWARD] -> editor', { nodeid: payload.nodeid });
        } catch (e) {
          console.warn('[INDEX FORWARD] editor postMessage failed', e);
        }
      } else {
        // 如果 editor iframe 尚未就绪，缓存最后一条消息，init 时可重发
        window.__mw__pendingEditorMessage = forwardEditor;
        console.log('[INDEX FORWARD] editor iframe not ready, cached');
      }

      // 转发到 preview/md2word iframe（如果存在）
      if (previewIframe && previewIframe.contentWindow) {
        try {
          previewIframe.contentWindow.postMessage(forwardPreview, '*');
          console.log('[INDEX FORWARD PREVIEW] -> preview', { nodeid: payload.nodeid });
        } catch (e) {
          console.warn('[INDEX FORWARD PREVIEW] preview postMessage failed', e);
        }
      } else {
        // 缓存以便在 iframe 初始化时重发
        window.__mw__pendingPreviewMessage = forwardPreview;
        console.log('[INDEX FORWARD PREVIEW] preview iframe not ready, cached');
      }
      return;
    }
  } catch (e) {
    console.warn('forwarding mindmap message failed', e);
  }

  // 只处理通知相关的消息
  if (event.data.type === 'notification') {
    const { message, notificationType, duration } = event.data;

    // 若父页处于全局抑制状态，则跳过可视通知，仅写 console（避免编辑时打断）
    if (window.__mw_global_suppress_toasts) {
      try {
        console.log('[INDEX] notification suppressed ->', notificationType, message);
      } catch (e) { }
      return;
    }

    switch (notificationType) {
      case 'success':
        showSuccess(message, duration);
        break;
      case 'error':
        showError(message, duration);
        break;
      case 'warning':
        showWarning(message, duration);
        break;
      case 'info':
        showInfo(message, duration);
        break;
      default:
        showNotification(message, notificationType, duration);
    }
  }
}


// 来自 editor 的刷新请求：由顶层执行整页刷新
window.addEventListener('message', function (e) {
  try {
    var d = e && e.data;
    if (!d || d.type !== 'editor-reload-request') return;
    // 可选：检查来源或 requestId 等以增加安全性
    try {
      if (top && top.location && top !== window) {
        top.location.reload();
      } else {
        window.location.reload();
      }
    } catch (err) {
      try { window.location.reload(); } catch (e) { /* ignore */ }
    }
  } catch (err) { }
}, { passive: true });