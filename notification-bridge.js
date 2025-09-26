/**
 * 通知桥接器 - 用于子页面向父框架发送通知
 * 替代alert，使用框架的全局通知系统
 */

/**
 * 向父框架发送通知消息
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型：success, danger, warning, info
 * @param {number} duration - 显示时长（毫秒）
 */
function sendNotification(message, type = 'info', duration = 1500) {
    if (window.parent && window.parent !== window) {
        // 如果在iframe中，向父框架发送消息
        window.parent.postMessage({
            type: 'notification',
            message: message,
            notificationType: type,
            duration: duration
        }, '*');
    } else {
        // 如果不是在iframe中，使用本地通知
        showLocalNotification(message, type, duration);
    }
}

/**
 * 显示本地通知（当不在iframe中时）
 */
function showLocalNotification(message, type = 'info', duration = 1500) {
    if (typeof $ === 'undefined') {
        // 如果jQuery不可用，回退到alert
        alert(message);
        return;
    }

    // 统一颜色方案
    const typeStyles = {
        success: 'background-color: #28a745; border-color: #28a745; color: white;', // 绿色
        danger: 'background-color: #dc3545; border-color: #dc3545; color: white;',   // 红色
        warning: 'background-color:rgb(255, 235, 173); border-color: #ffc107; color:rgb(192, 143, 7);', // 黄色
        info: 'background-color: #17a2b8; border-color: #17a2b8; color: white;'     // 蓝色
    };

    // 创建通知容器（如果不存在）
    if ($('#notification-container').length === 0) {
        $('body').append('<div id="notification-container" style="position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;"></div>');
    }

    // 创建通知元素
    const notificationId = 'local-notification-' + Date.now();
    const notificationHtml = `
        <div id="${notificationId}" class="alert alert-dismissible fade show" 
             style="min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: 0; ${typeStyles[type] || typeStyles.info}">
            ${message}
            <button type="button" class="close" data-dismiss="alert" aria-label="Close" style="color: inherit; opacity: 0.8;">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>
    `;

    // 添加到通知容器
    $('#notification-container').append(notificationHtml);

    // 自动移除
    setTimeout(() => {
        const $notification = $(`#${notificationId}`);
        $notification.fadeOut(300, function () {
            $notification.remove();
            // 重新排列剩余通知
            rearrangeNotifications();
        });
    }, duration);

    // 点击关闭按钮时移除
    $(`#${notificationId} .close`).click(() => {
        const $notification = $(`#${notificationId}`);
        $notification.fadeOut(300, function () {
            $notification.remove();
            // 重新排列剩余通知
            rearrangeNotifications();
        });
    });
}

/**
 * 重新排列通知
 */
function rearrangeNotifications() {
    const $container = $('#notification-container');
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
function showSuccess(message, duration = 3000) {
    sendNotification(message, 'success', duration);
}

/**
 * 显示错误通知
 */
function showError(message, duration = 5000) {
    sendNotification(message, 'danger', duration);
}

/**
 * 显示警告通知
 */
function showWarning(message, duration = 4000) {
    sendNotification(message, 'warning', duration);
}

/**
 * 显示信息通知
 */
function showInfo(message, duration = 3000) {
    sendNotification(message, 'info', duration);
}

/**
 * 重写window.alert以使用通知系统
 */
function overrideAlert() {
    const originalAlert = window.alert;
    window.alert = function (message) {
        // 尝试使用通知系统，失败时回退到原始alert
        try {
            sendNotification(message, 'info', 3000);
        } catch (error) {
            originalAlert.call(window, message);
        }
    };
}

// 自动重写alert（如果不需要可以手动调用overrideAlert()）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', overrideAlert);
} else {
    overrideAlert();
}

// 导出函数供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendNotification,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        overrideAlert
    };
} else {
    // 全局导出
    window.NotificationBridge = {
        sendNotification,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        overrideAlert
    };
}