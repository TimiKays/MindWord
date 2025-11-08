/**
 * HTML转Markdown工具函数
 * 提供通用的HTML到Markdown转换功能
 */

/**
 * 将HTML内容转换为Markdown格式
 * @param {string} html - HTML字符串
 * @returns {string} - 转换后的Markdown字符串
 */
function convertHtmlToMarkdown(html) {
    // 简单的HTML转Markdown实现
    let markdown = html;

    // 标题
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

    // 粗体
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');

    // 斜体
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    // 代码
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

    // 链接
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // 图片
    markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
    markdown = markdown.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)');

    // 列表项
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

    // 段落
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // 换行
    markdown = markdown.replace(/<br[^>]*>/gi, '\n');

    // 移除所有其他HTML标签
    markdown = markdown.replace(/<[^>]+>/g, '');

    // 清理多余的空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return markdown.trim();
}

/**
 * 在textarea的光标位置插入文本
 * @param {HTMLTextAreaElement} textarea - 目标文本框
 * @param {string} text - 要插入的文本
 */
function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = textarea.value;
    
    // 在光标位置插入文本
    textarea.value = currentValue.substring(0, start) + text + currentValue.substring(end);
    
    // 重新设置光标位置
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    
    // 触发input事件以更新相关状态
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 聚焦文本框
    textarea.focus();
}

/**
 * 处理粘贴事件，支持富文本转Markdown
 * @param {ClipboardEvent} e - 粘贴事件对象
 * @param {HTMLTextAreaElement} textarea - 目标文本框
 * @param {Function} showMessage - 显示消息的函数
 */
function handlePasteForMarkdown(e, textarea, showMessage) {
    const items = e.clipboardData.items;
    const types = e.clipboardData.types;

    // 首先检查是否有图片
    let hasImage = false;
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            showMessage('warn', '不支持直接粘贴图片，请使用markdown图片语法');
            hasImage = true;
            break;
        }
    }

    // 如果没有图片，检查是否有富文本内容（HTML）
    if (!hasImage) {
        // 检查是否有HTML内容
        const htmlData = e.clipboardData.getData('text/html');
        if (htmlData) {
            // 有HTML内容，转换为Markdown
            e.preventDefault();
            const markdownText = convertHtmlToMarkdown(htmlData);
            insertAtCursor(textarea, markdownText);
            showMessage('success', '富文本已转换为markdown格式');
        }
        // 只有纯文本，允许默认处理
    }
}

// 导出函数供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        convertHtmlToMarkdown,
        insertAtCursor,
        handlePasteForMarkdown
    };
}

// 全局暴露函数
window.HtmlMarkdownUtils = {
    convertHtmlToMarkdown,
    insertAtCursor,
    handlePasteForMarkdown
};