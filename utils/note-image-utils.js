/**
 * MindWord - 节点备注图片工具
 * 用于解析节点备注中的图片并从IndexedDB获取图片数据
 */

/**
 * 从备注文本中提取图片ID
 * @param {string} noteText - 备注文本
 * @returns {Array<string>} 图片ID数组
 */
function extractImageIdsFromNote(noteText) {
    if (!noteText || typeof noteText !== 'string') {
        return [];
    }

    // 匹配Markdown图片语法 ![图片名称](图片ID)
    const imageRegex = /!\[([^\]]*)\]\((img_[^)]+)\)/g;
    const imageIds = [];
    let match;

    while ((match = imageRegex.exec(noteText)) !== null) {
        const imageId = match[2];
        if (imageId && imageId.startsWith('img_')) {
            imageIds.push(imageId);
        }
    }

    return imageIds;
}

/**
 * 从IndexedDB获取图片数据
 * @param {string} imageId - 图片ID
 * @returns {Promise<string|null>} 图片的DataURL，如果获取失败返回null
 */
async function getImageDataUrl(imageId) {
    try {
        if (!window.imageStorage || !window.imageStorage.getImage) {
            console.error('[NoteImageUtils] ImageStorage not available');
            return null;
        }

        const imageData = await window.imageStorage.getImage(imageId);
        if (!imageData || !imageData.blob) {
            console.warn(`[NoteImageUtils] Image not found: ${imageId}`);
            return null;
        }

        // 将Blob转换为DataURL
        return await window.imageStorage.blobToDataUrl(imageData.blob);
    } catch (error) {
        console.error(`[NoteImageUtils] Failed to get image ${imageId}:`, error);
        return null;
    }
}

/**
 * 获取备注中的第一张图片
 * @param {string} noteText - 备注文本
 * @returns {Promise<string|null>} 第一张图片的DataURL，如果没有图片或获取失败返回null
 */
async function getFirstImageFromNote(noteText) {
    const imageIds = extractImageIdsFromNote(noteText);
    if (imageIds.length === 0) {
        return null;
    }

    // 尝试获取第一张图片
    return await getImageDataUrl(imageIds[0]);
}

/**
 * 获取备注中的所有图片
 * @param {string} noteText - 备注文本
 * @returns {Promise<Array<string>>} 所有图片的DataURL数组
 */
async function getAllImagesFromNote(noteText) {
    const imageIds = extractImageIdsFromNote(noteText);
    if (imageIds.length === 0) {
        return [];
    }

    const imageDataUrls = [];
    for (const imageId of imageIds) {
        const dataUrl = await getImageDataUrl(imageId);
        if (dataUrl) {
            imageDataUrls.push(dataUrl);
        }
    }

    return imageDataUrls;
}

/**
 * 创建图片元素
 * @param {string} dataUrl - 图片的DataURL
 * @param {string} alt - 图片的alt文本
 * @param {string} imageId - 图片ID，用于点击预览
 * @returns {HTMLImageElement} 图片元素
 */
function createImageElement(dataUrl, alt = '', imageId = '') {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = alt;
    // 不设置maxWidth，让图片保持原始尺寸，只设置最大高度限制
    img.style.maxHeight = '180px';
    img.style.width = 'auto';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '4px';
    img.style.cursor = 'pointer';
    img.style.transition = 'transform 0.2s ease';

    // 图片加载完成后，确保小图片不会被放大
    img.addEventListener('load', function () {
        // 如果图片原始宽度小于容器宽度(300px)，保持原始尺寸
        if (img.naturalWidth < 300) {
            img.style.width = img.naturalWidth + 'px';
            img.style.height = 'auto';
        }
    });

    // 添加点击事件，用于图片预览
    img.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.NoteImageUtils && window.NoteImageUtils.showImagePreview) {
            window.NoteImageUtils.showImagePreview(dataUrl, alt, imageId);
        }
    });

    // 添加悬停效果
    img.addEventListener('mouseenter', function () {
        img.style.transform = 'scale(1.02)';
    });

    img.addEventListener('mouseleave', function () {
        img.style.transform = 'scale(1)';
    });

    return img;
}

/**
 * 创建tooltip元素
 * @param {string} noteText - 备注文本
 * @param {HTMLElement} targetElement - 目标元素
 * @returns {Promise<HTMLElement|null>} tooltip元素，如果没有内容返回null
 */
async function createImageTooltip(noteText, targetElement) {
    if (!noteText || noteText.trim() === '') {
        return null;
    }

    // 创建tooltip容器
    const tooltip = document.createElement('div');
    tooltip.className = 'jm-node-tooltip';

    // 创建内容容器，用于按顺序混排图文内容
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.gap = '6px';

    // 解析Markdown，按顺序渲染文本和图片
    await renderMarkdownContent(noteText, contentContainer);

    // 检查是否有内容
    if (contentContainer.children.length === 0) {
        return null;
    }

    // 将内容容器添加到tooltip
    tooltip.appendChild(contentContainer);

    return tooltip;
}

/**
 * 渲染Markdown格式的文本
 * @param {string} text - 原始文本
 * @returns {HTMLElement} 渲染后的HTML元素
 */
function renderMarkdownText(text) {
    const container = document.createElement('div');
    container.className = 'tooltip-text';
    container.style.marginBottom = '4px';

    // 处理Markdown格式
    let html = text;

    // 处理表格
    html = html.replace(/((?:\|.*\|\n?)+)/g, function (tableMatch) {
        let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 0 0 8px 0; font-size: 12px;">';
        const rows = tableMatch.trim().split('\n');

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i].trim();
            if (!row || !row.startsWith('|')) continue;

            // 移除首尾的|字符并分割单元格
            const cells = row.slice(1, -1).split('|').map(cell => cell.trim());

            // 处理表头行
            if (i === 0) {
                tableHtml += '<thead><tr>';
                cells.forEach(cell => {
                    tableHtml += `<th style="border: 1px solid #ddd; padding: 4px 6px; background-color: #f5f5f5; text-align: left; font-weight: bold;">${cell}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
            }
            // 跳过分隔行
            else if (i === 1 && cells.every(cell => cell.match(/^-+$/))) {
                continue;
            }
            // 处理数据行
            else {
                tableHtml += '<tr>';
                cells.forEach(cell => {
                    tableHtml += `<td style="border: 1px solid #ddd; padding: 4px 6px; text-align: left;">${cell}</td>`;
                });
                tableHtml += '</tr>';
            }
        }

        tableHtml += '</tbody></table>';
        return tableHtml;
    });

    // 处理加粗 **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 处理斜体 *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 处理行内代码 `code`
    html = html.replace(/`([^`]+)`/g, '<code style="background-color: #f0f0f0; padding: 1px 3px; border-radius: 2px; font-family: monospace;">$1</code>');

    // 处理链接 [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #0066cc;">$1</a>');

    // 处理表格外的换行
    // 使用更精确的正则表达式，避免在表格内部添加<br>标签
    html = html.replace(/\n(?![^<]*<\/table>)/g, '<br>');
    // 移除表格前后多余的<br>标签
    html = html.replace(/(<br>\s*)+<table/g, '<table');
    html = html.replace(/<\/table>(\s*<br>)+/g, '</table>');

    container.innerHTML = html;
    return container;
}

/**
 * 按顺序渲染Markdown内容（文本和图片）
 * @param {string} markdownText - Markdown文本
 * @param {HTMLElement} container - 容器元素
 */
async function renderMarkdownContent(markdownText, container) {
    // 匹配Markdown图片语法和普通文本
    const parts = [];
    let lastIndex = 0;
    const imageRegex = /!\[([^\]]*)\]\((img_[^)]+)\)/g;
    let match;

    // 分离文本和图片部分，保持原始顺序
    while ((match = imageRegex.exec(markdownText)) !== null) {
        // 添加图片前的文本
        if (match.index > lastIndex) {
            const textPart = markdownText.substring(lastIndex, match.index).trim();
            if (textPart) {
                parts.push({ type: 'text', content: textPart });
            }
        }

        // 添加图片部分
        parts.push({
            type: 'image',
            content: match[2], // 图片ID
            alt: match[1] // 图片alt文本
        });

        lastIndex = match.index + match[0].length;
    }

    // 添加最后剩余的文本
    if (lastIndex < markdownText.length) {
        const textPart = markdownText.substring(lastIndex).trim();
        if (textPart) {
            parts.push({ type: 'text', content: textPart });
        }
    }

    // 如果没有找到任何图片，但有文本，则添加整个文本
    if (parts.length === 0 && markdownText.trim()) {
        parts.push({ type: 'text', content: markdownText.trim() });
    }

    // 渲染各部分内容
    let totalLength = 0;
    const maxTextLength = 1000000; // 最大文本长度限制
    const maxImages = 50; // 最大图片数量限制

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (part.type === 'text') {
            // 处理文本部分
            let textContent = part.content;

            // 如果总长度已超过限制，截断文本
            if (totalLength + textContent.length > maxTextLength) {
                textContent = textContent.substring(0, maxTextLength - totalLength) + '...';
                totalLength = maxTextLength;
            } else {
                totalLength += textContent.length;
            }

            // 使用Markdown文本渲染函数
            const textElement = renderMarkdownText(textContent);
            container.appendChild(textElement);

            // 如果已达到长度限制，停止处理
            if (totalLength >= maxTextLength) {
                break;
            }
        } else if (part.type === 'image') {
            // 处理图片部分
            const imageDataUrl = await getImageDataUrl(part.content);
            if (imageDataUrl) {
                const img = createImageElement(imageDataUrl, part.alt || 'Note image', part.content);
                container.appendChild(img);

                // 如果已达到图片数量限制，停止处理
                if (container.querySelectorAll('img').length >= maxImages) {
                    break;
                }
            }
        }
    }
}

/**
 * 显示图片预览
 * @param {string} dataUrl - 图片的DataURL
 * @param {string} alt - 图片的alt文本
 * @param {string} imageId - 图片ID
 */
function showImagePreview(dataUrl, alt, imageId) {
    // 创建预览容器
    const previewContainer = document.createElement('div');
    previewContainer.className = 'image-preview-container';
    previewContainer.style.position = 'fixed';
    previewContainer.style.top = '0';
    previewContainer.style.left = '0';
    previewContainer.style.width = '100%';
    previewContainer.style.height = '100%';
    previewContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    previewContainer.style.zIndex = '20000'; // 提高层级以确保覆盖节点详情组件
    previewContainer.style.display = 'flex';
    previewContainer.style.justifyContent = 'center';
    previewContainer.style.alignItems = 'center';
    previewContainer.style.cursor = 'zoom-out';

    // 创建图片容器 - 可拖拽
    const imageContainer = document.createElement('div');
    imageContainer.style.position = 'absolute';
    imageContainer.style.top = '50%';
    imageContainer.style.left = '50%';
    imageContainer.style.transform = 'translate(-50%, -50%)';
    imageContainer.style.maxWidth = '90%';
    imageContainer.style.maxHeight = '90%';
    imageContainer.style.display = 'flex';
    imageContainer.style.flexDirection = 'column';
    imageContainer.style.alignItems = 'center';
    imageContainer.style.cursor = 'move';

    // 创建预览图片
    const previewImg = document.createElement('img');
    previewImg.src = dataUrl;
    previewImg.alt = alt || 'Preview image';
    previewImg.style.maxWidth = '100%';
    previewImg.style.maxHeight = '80vh';
    previewImg.style.objectFit = 'contain';
    previewImg.style.borderRadius = '4px';
    previewImg.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    // 移除缓动效果，确保拖拽时图片立即跟随鼠标移动
    // previewImg.style.transition = 'transform 0.3s ease';
    previewImg.style.cursor = 'zoom-in';
    previewImg.style.userSelect = 'none';

    // 创建信息栏
    const infoBar = document.createElement('div');
    infoBar.style.position = 'fixed';
    infoBar.style.top = '10px';
    infoBar.style.left = '10px';
    infoBar.style.color = 'white';
    infoBar.style.fontSize = '14px';
    infoBar.style.textAlign = 'left';
    infoBar.style.fontFamily = 'Arial, sans-serif';
    infoBar.style.textShadow = '0 1px 3px rgba(0,0,0,0.5)';
    infoBar.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    infoBar.style.padding = '8px 12px';
    infoBar.style.borderRadius = '4px';
    infoBar.style.zIndex = '10001'; // 确保在图片容器之上
    infoBar.textContent = alt || 'Image preview';

    // 创建控制按钮容器 - 移到窗口最底部
    const controls = document.createElement('div');
    controls.style.position = 'fixed';
    controls.style.bottom = '20px';
    controls.style.left = '50%';
    controls.style.transform = 'translateX(-50%)';
    controls.style.display = 'flex';
    controls.style.gap = '10px';
    controls.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    controls.style.padding = '8px 15px';
    controls.style.borderRadius = '20px';
    controls.style.backdropFilter = 'blur(5px)';
    controls.style.zIndex = '10001'; // 确保在图片容器之上

    // 缩放按钮
    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.style.width = '30px';
    zoomInBtn.style.height = '30px';
    zoomInBtn.style.borderRadius = '50%';
    zoomInBtn.style.border = 'none';
    zoomInBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    zoomInBtn.style.cursor = 'pointer';
    zoomInBtn.style.fontSize = '16px';
    zoomInBtn.style.fontWeight = 'bold';
    zoomInBtn.title = '放大';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '-';
    zoomOutBtn.style.width = '30px';
    zoomOutBtn.style.height = '30px';
    zoomOutBtn.style.borderRadius = '50%';
    zoomOutBtn.style.border = 'none';
    zoomOutBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    zoomOutBtn.style.cursor = 'pointer';
    zoomOutBtn.style.fontSize = '16px';
    zoomOutBtn.style.fontWeight = 'bold';
    zoomOutBtn.title = '缩小';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = '⟲';
    resetBtn.style.width = '30px';
    resetBtn.style.height = '30px';
    resetBtn.style.borderRadius = '50%';
    resetBtn.style.border = 'none';
    resetBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.fontSize = '16px';
    resetBtn.style.fontWeight = 'bold';
    resetBtn.title = '重置大小';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.width = '30px';
    closeBtn.style.height = '30px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.border = 'none';
    closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '20px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.title = '关闭';

    // 缩放状态
    let scale = 1;

    // 拖拽状态
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let translateX = 0;  // 图片X轴偏移量
    let translateY = 0;  // 图片Y轴偏移量
    let dragEndTime = 0; // 拖拽结束时间，用于区分拖拽和点击

    // 图片拖拽功能
    previewImg.addEventListener('mousedown', (e) => {
        // 只在缩放状态下才允许拖拽图片
        if (scale <= 1) {
            return;
        }

        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        // 更改鼠标样式
        previewImg.style.cursor = 'grabbing';
        imageContainer.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
    });

    // 鼠标滚轮缩放功能
    previewImg.addEventListener('wheel', (e) => {
        e.preventDefault();

        // 计算缩放因子
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(10, scale * delta));

        updateScale(newScale);
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        // 更新图片位置，将鼠标移动距离除以缩放比例，确保移动速度与鼠标一致
        translateX += deltaX / scale;
        translateY += deltaY / scale;

        // 更新拖拽起始点
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        // 应用变换
        previewImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            dragEndTime = Date.now(); // 记录拖拽结束时间
            previewImg.style.cursor = scale > 1 ? 'move' : 'zoom-in';
            imageContainer.style.cursor = scale > 1 ? 'move' : 'zoom-in';
            e.preventDefault();
        }
    });

    // 缩放函数
    function updateScale(newScale) {
        scale = Math.max(0.1, Math.min(5, newScale)); // 限制缩放范围

        // 应用变换，保持当前位置
        previewImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;

        // 更新按钮状态
        zoomInBtn.disabled = scale >= 5;
        zoomOutBtn.disabled = scale <= 0.1;

        // 更新鼠标样式
        if (scale > 1) {
            previewImg.style.cursor = 'move';
        } else {
            previewImg.style.cursor = 'zoom-in';
        }
    }

    // 事件处理
    zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateScale(scale * 1.2);
    });

    zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateScale(scale / 1.2);
    });

    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 重置缩放和位置
        scale = 1;
        translateX = 0;
        translateY = 0;
        previewImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;

        // 更新按钮状态
        zoomInBtn.disabled = false;
        zoomOutBtn.disabled = false;

        // 更新鼠标样式
        previewImg.style.cursor = 'zoom-in';
    });

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.removeChild(previewContainer);
    });

    // 图片点击切换缩放
    previewImg.addEventListener('click', (e) => {
        e.stopPropagation();

        // 如果点击发生在拖拽结束后300毫秒内，认为是拖拽释放，不是真正的点击
        const currentTime = Date.now();
        if (currentTime - dragEndTime < 300) {
            return;
        }

        if (scale === 1) {
            updateScale(2);
            // 缩放后允许拖拽
            imageContainer.style.cursor = 'move';
        } else {
            // 恢复原始大小并重置位置
            scale = 1;
            translateX = 0;
            translateY = 0;
            previewImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;

            // 更新按钮状态
            zoomInBtn.disabled = false;
            zoomOutBtn.disabled = false;

            // 恢复原始大小后，如果不在拖拽状态，恢复默认鼠标样式
            if (!isDragging) {
                imageContainer.style.cursor = 'move';
                previewImg.style.cursor = 'zoom-in';
            }
        }
    });

    // 点击背景关闭
    previewContainer.addEventListener('click', () => {
        document.body.removeChild(previewContainer);
    });

    // 阻止图片容器点击事件冒泡
    imageContainer.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 键盘事件
    function handleKeyDown(e) {
        switch (e.key) {
            case 'Escape':
                if (document.body.contains(previewContainer)) {
                    document.body.removeChild(previewContainer);
                }
                document.removeEventListener('keydown', handleKeyDown);
                break;
            case '+':
            case '=':
                updateScale(scale * 1.2);
                break;
            case '-':
            case '_':
                updateScale(scale / 1.2);
                break;
            case '0':
                updateScale(1);
                break;
        }
    }

    document.addEventListener('keydown', handleKeyDown);

    // 添加元素到容器
    controls.appendChild(zoomInBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(closeBtn);

    imageContainer.appendChild(previewImg);

    previewContainer.appendChild(imageContainer);
    previewContainer.appendChild(infoBar);
    previewContainer.appendChild(controls);

    // 添加到页面
    document.body.appendChild(previewContainer);
}

// 导出函数
window.NoteImageUtils = {
    extractImageIdsFromNote,
    getImageDataUrl,
    getFirstImageFromNote,
    getAllImagesFromNote,
    createImageElement,
    createImageTooltip,
    renderMarkdownContent,
    showImagePreview
};