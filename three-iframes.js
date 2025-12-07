/**
 * MindWord - 树心 | 像画图一样写文档的思维导图写作工具
 * GitHub: https://github.com/TimiKays/MindWord
 * 
 * Copyright 2025 Timi Kays
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ===================================
// 📌 页面配置 - 在这里修改三个页面的地址
// ===================================
const PAGE_CONFIG = {
  // Markdown 编辑器页面地址
  editor: {
    url: 'editor/editor', // 填入您的编辑器页面地址，例如: 'https://your-domain.com/editor'
    title: 'Markdown 编辑器'
  },

  // Markdown 预览页面地址
  preview: {
    url: 'md2word/md2word', // 填入您的预览页面地址，例如: 'https://your-domain.com/preview'
    title: 'Markdown 预览'
  },

  // 思维导图页面地址
  mindmap: {
    url: 'jsmind/mindmap', // 填入您的思维导图页面地址，例如: 'https://your-domain.com/mindmap'
    title: '思维导图'
  }
};

// ===================================
// 应用状态管理
// ===================================

// 面板状态管理
const panels = {
  editor: true,
  preview: true,
  mindmap: true
};

// 专注模式状态
let focusMode = false;
let activeFocusPanel = 'editor';

// 状态存储键名
const STORAGE_KEYS = {
  focusMode: 'mindword_focus_mode',
  activeFocusPanel: 'mindword_active_focus_panel',
  panels: 'mindword_panels_state'
};

// 拖拽状态 - 优化后的状态管理
let dragState = {
  isDragging: false,
  currentResizer: null,
  startX: 0,
  currentX: 0,
  leftPanel: null,
  rightPanel: null,
  startLeftWidth: 0,
  startRightWidth: 0,
  containerWidth: 0,
  animationId: null
};

// ===================================
// 页面加载功能
// ===================================

// 加载iframe内容（改进：标识 iframe，onload 后向子页请求重排）
function loadPanelContent(panelName) {
  const config = PAGE_CONFIG[panelName];
  const panelContent = document.querySelector(`#${panelName}-panel .panel-content`);
  const placeholder = document.getElementById(`${panelName}-placeholder`);
  const urlSpan = document.getElementById(`${panelName}-url`);

  // 更新URL显示
  urlSpan.textContent = config.url || '未配置';

  if (!config.url) {
    placeholder.innerHTML = `
                    <div style="color: #e74c3c;">⚠️ <span data-i18n="errors.pageNotConfigured">页面地址未配置</span></div>
                    <small><span data-i18n="errors.setPageAddress">请在 PAGE_CONFIG.${panelName}.url 中设置页面地址</span></small>
                `;
    return;
  }

  // 检查是否已经有iframe
  const existingIframe = panelContent.querySelector('iframe');
  if (existingIframe) {
    return;
  }

  // 创建iframe
  const iframe = document.createElement('iframe');
  // 添加时间戳参数避免缓存
  const timestamp = new Date().getTime();
  iframe.src = config.url + (config.url.includes('?') ? '&' : '?') + '_t=' + timestamp;

  // 标识 iframe 便于后续选择与消息转发
  iframe.dataset.panel = panelName;
  iframe.id = `iframe-${panelName}`;

  // 样式：确保占满面板内容
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  iframe.style.backgroundColor = 'white';
  iframe.style.display = 'none';

  // 加载成功后显示并请求子页重排（立即+短延迟）
  iframe.onload = function () {
    placeholder.style.display = 'none';
    iframe.style.display = 'block';

    // 请求子页重排，防止首次渲染时尺寸未就绪
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'mw_relayout' }, '*');
        setTimeout(() => {
          try { iframe.contentWindow.postMessage({ type: 'mw_relayout' }, '*'); } catch (e) { }
        }, 200);
        // 若存在待发送的markdown/文档，在iframe就绪后立刻发送，确保“即点即切”
        try {
          if (panelName === 'editor' && window.__mw_pendingEditorDocument) {
            iframe.contentWindow.postMessage({ type: 'mw_load_document', payload: window.__mw_pendingEditorDocument }, '*');
            window.__mw_pendingEditorDocument = null;
          }
          if (panelName === 'preview' && window.__mw_pendingPreviewMarkdown) {
            console.log(`[IFRAME-ONLOAD] ${panelName} iframe ready, sending cached preview message`);
            iframe.contentWindow.postMessage({ type: 'mw_load_markdown', payload: window.__mw_pendingPreviewMarkdown }, '*');
            window.__mw_pendingPreviewMarkdown = null;
          }
          if (panelName === 'mindmap' && window.__mw_pendingMindmapMarkdown) {
            console.log(`[IFRAME-ONLOAD] ${panelName} iframe ready, sending cached mindmap message, docId:`, window.__mw_pendingMindmapMarkdown?.doc?.id);
            iframe.contentWindow.postMessage({ type: 'mw_load_markdown', payload: window.__mw_pendingMindmapMarkdown }, '*');
            window.__mw_pendingMindmapMarkdown = null;
          }
        } catch (e) { /* ignore */ }
      }
    } catch (e) { console.warn('postMessage to iframe failed', e); }
  };

  iframe.onerror = function () {
    placeholder.innerHTML = `
                    <div style="color: #e74c3c;">❌ <span data-i18n="errors.pageLoadFailed">页面加载失败</span></div>
                    <small><span data-i18n="app.address">地址</span>: ${config.url}</small>
                    <br>
                    <button onclick="retryLoad('${panelName}')" style="margin-top: 10px; padding: 5px 10px; border: 1px solid #3498db; background: white; color: #3498db; border-radius: 4px; cursor: pointer;"><span data-i18n="errors.retry">重试</span></button>
                `;
  };

  panelContent.appendChild(iframe);

  // 在父页窗口尺寸变化时，通知子 iframe 重排（防止父容器被调整）
  // 延迟合并多次 resize
  let _relayoutTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(_relayoutTimer);
    _relayoutTimer = setTimeout(function () {
      try {
        if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'mw_relayout' }, '*');
      } catch (e) { }
    }, 150);
  }, { passive: true });
}

// 重试加载
function retryLoad(panelName) {
  const panelContent = document.querySelector(`#${panelName}-panel .panel-content`);
  const iframe = panelContent.querySelector('iframe');
  if (iframe) {
    iframe.remove();
  }

  const placeholder = document.getElementById(`${panelName}-placeholder`);
  placeholder.innerHTML = `
                <div class="loading"><span data-i18n="errors.reloading">正在重新加载</span></div>
                <small><span data-i18n="app.address">地址</span>: <span id="${panelName}-url">${PAGE_CONFIG[panelName].url}</span></small>
            `;
  placeholder.style.display = 'flex';

  setTimeout(() => loadPanelContent(panelName), 100);
}

// ===================================
// 专注模式功能
// ===================================

// 切换专注模式
function toggleFocusMode() {
  focusMode = !focusMode;
  const mainContent = document.getElementById('main-content');
  const focusToggle = document.getElementById('focus-toggle');

  if (focusMode) {
    mainContent.classList.add('focus-mode');
    focusToggle.classList.add('active');
    enterFocusMode();
  } else {
    mainContent.classList.remove('focus-mode');
    focusToggle.classList.remove('active');
    exitFocusMode();
  }

  // 保存状态到localStorage
  saveStateToStorage();

  updateLayout();
  updateTabs();
}

// 进入专注模式
function enterFocusMode() {
  Object.keys(panels).forEach(panelName => {
    panels[panelName] = false;
  });
  panels[activeFocusPanel] = true;
}

// 退出专注模式
function exitFocusMode() {
  Object.keys(panels).forEach(panelName => {
    panels[panelName] = true;
  });
}

// ===================================
// 面板管理功能
// ===================================

// 切换面板显示/隐藏
function togglePanel(panelName) {
  if (focusMode) {
    activeFocusPanel = panelName;
    Object.keys(panels).forEach(name => {
      panels[name] = (name === panelName);
    });
  } else {
    const visiblePanels = Object.values(panels).filter(v => v).length;

    if (visiblePanels <= 1 && panels[panelName]) {
      showWarning(i18n.t('errors.keepOnePanel'), 3000);
      return;
    }

    panels[panelName] = !panels[panelName];
  }

  // 保存状态到localStorage
  saveStateToStorage();

  updateLayout();
  updateTabs();
}

// 处理Tab点击
function handleTabClick(panelName) {
  if (focusMode) {
    activeFocusPanel = panelName;
    Object.keys(panels).forEach(name => {
      panels[name] = (name === panelName);
    });
    // 保存状态到localStorage
    saveStateToStorage();
    updateLayout();
    updateTabs();
  } else {
    togglePanel(panelName);
  }
  // 在移动端切换到某个面板时，若是思维导图则触发 iframe 强制重载/重排
  try { if (typeof MW_reloadMindmapOnShowIfMobile === 'function') MW_reloadMindmapOnShowIfMobile(panelName); } catch (e) { /* ignore */ }
}

// 通知思维导图 iframe 重新布局（解决切换专注面板后思维导图挤在一起的问题）
function requestMindmapRelayout() {
  try {
    const iframe =
      document.getElementById('iframe-mindmap') ||
      document.querySelector('iframe[data-panel="mindmap"]') ||
      document.querySelector('iframe[src*="jsmind/mindmap.html"]');

    if (!iframe || !iframe.contentWindow) return;

    // 立即和稍后各发一次，兼容父容器刚刚变更尺寸的情况
    iframe.contentWindow.postMessage({ type: 'mw_relayout' }, '*');
    setTimeout(() => {
      try {
        iframe.contentWindow.postMessage({ type: 'mw_relayout' }, '*');
      } catch (_) { /* ignore */ }
    }, 180);
  } catch (_) {
    // 静默失败，避免影响主流程
  }
}

// 更新布局
function updateLayout() {
  const editorPanel = document.getElementById('editor-panel');
  const previewPanel = document.getElementById('preview-panel');
  const mindmapPanel = document.getElementById('mindmap-panel');
  const resizer1 = document.getElementById('resizer1');
  const resizer2 = document.getElementById('resizer2');

  // 显示/隐藏面板
  editorPanel.classList.toggle('hidden', !panels.editor);
  previewPanel.classList.toggle('hidden', !panels.preview);
  mindmapPanel.classList.toggle('hidden', !panels.mindmap);

  // 无论是否处于专注模式，只要当前思维导图是可见面板，就主动通知其重排
  if (panels.mindmap) {
    requestMindmapRelayout();
  }

  if (focusMode) {
    resizer1.style.display = 'none';
    resizer2.style.display = 'none';
    return;
  }

  // 处理分隔条显示
  const visiblePanels = [];
  if (panels.editor) visiblePanels.push('editor');
  if (panels.preview) visiblePanels.push('preview');
  if (panels.mindmap) visiblePanels.push('mindmap');

  resizer1.style.display = 'none';
  resizer2.style.display = 'none';

  if (visiblePanels.length === 2) {
    if (visiblePanels.includes('editor') && visiblePanels.includes('preview')) {
      resizer1.style.display = 'block';
    } else if (visiblePanels.includes('preview') && visiblePanels.includes('mindmap')) {
      resizer2.style.display = 'block';
    } else if (visiblePanels.includes('editor') && visiblePanels.includes('mindmap')) {
      resizer1.style.display = 'block';
    }
  } else if (visiblePanels.length === 3) {
    resizer1.style.display = 'block';
    resizer2.style.display = 'block';
  }

  resetFlexBasis();
}

// 重置flex基础值
function resetFlexBasis() {
  if (focusMode) return;

  const visiblePanels = [];
  if (panels.editor) visiblePanels.push('editor');
  if (panels.preview) visiblePanels.push('preview');
  if (panels.mindmap) visiblePanels.push('mindmap');

  if (visiblePanels.length === 0) return;

  // 重置flex属性
  if (panels.editor) {
    document.getElementById('editor-panel').style.flex = visiblePanels.length === 3 ? '1' : '1';
  }
  if (panels.preview) {
    document.getElementById('preview-panel').style.flex = visiblePanels.length === 3 ? '1' : '1';
  }
  if (panels.mindmap) {
    document.getElementById('mindmap-panel').style.flex = visiblePanels.length === 3 ? '2' : '1';
  }
}

// 更新tab状态
function updateTabs() {
  document.querySelectorAll('.tab[data-panel]').forEach(tab => {
    const panelName = tab.dataset.panel;
    if (focusMode) {
      tab.classList.toggle('active', panelName === activeFocusPanel);
    } else {
      tab.classList.toggle('active', panels[panelName]);
    }
  });
}

// 保存状态到localStorage
function saveStateToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.focusMode, JSON.stringify(focusMode));
    localStorage.setItem(STORAGE_KEYS.activeFocusPanel, JSON.stringify(activeFocusPanel));
    localStorage.setItem(STORAGE_KEYS.panels, JSON.stringify(panels));
  } catch (e) {
    console.warn('Failed to save state to localStorage:', e);
  }
}

// 从localStorage恢复状态
function restoreStateFromStorage() {
  try {
    const savedFocusMode = localStorage.getItem(STORAGE_KEYS.focusMode);
    const savedActiveFocusPanel = localStorage.getItem(STORAGE_KEYS.activeFocusPanel);
    const savedPanels = localStorage.getItem(STORAGE_KEYS.panels);

    if (savedFocusMode !== null) {
      focusMode = JSON.parse(savedFocusMode);
    }

    if (savedActiveFocusPanel !== null) {
      activeFocusPanel = JSON.parse(savedActiveFocusPanel);
    }

    if (savedPanels !== null) {
      const parsedPanels = JSON.parse(savedPanels);
      Object.keys(panels).forEach(key => {
        if (parsedPanels.hasOwnProperty(key)) {
          panels[key] = parsedPanels[key];
        }
      });
    }
  } catch (e) {
    console.warn('Failed to restore state from localStorage:', e);
  }
}

// 应用恢复的状态
function applyRestoredState() {
  const mainContent = document.getElementById('main-content');
  const focusToggle = document.getElementById('focus-toggle');

  if (focusMode) {
    mainContent.classList.add('focus-mode');
    focusToggle.classList.add('active');
    focusToggle.querySelector('span').textContent = '专注';
  } else {
    mainContent.classList.remove('focus-mode');
    focusToggle.classList.remove('active');
    focusToggle.querySelector('span').textContent = '专注';
  }

  updateLayout();
  updateTabs();
}

// ===================================
// 拖拽调整宽度功能 - 使用像素直接映射，1:1跟随鼠标
// ===================================

// 获取相邻面板
function getAdjacentPanels(resizer) {
  const mainContent = document.getElementById('main-content');
  const allChildren = Array.from(mainContent.children);
  const resizerIndex = allChildren.indexOf(resizer);

  let leftPanel = null;
  let rightPanel = null;

  // 向左找可见面板
  for (let i = resizerIndex - 1; i >= 0; i--) {
    const element = allChildren[i];
    if (element.classList.contains('panel') && !element.classList.contains('hidden')) {
      leftPanel = element;
      break;
    }
  }

  // 向右找可见面板
  for (let i = resizerIndex + 1; i < allChildren.length; i++) {
    const element = allChildren[i];
    if (element.classList.contains('panel') && !element.classList.contains('hidden')) {
      rightPanel = element;
      break;
    }
  }

  return { leftPanel, rightPanel };
}

// 开始拖拽
function startDrag(e, resizer) {
  if (focusMode) return;

  e.preventDefault();

  const { leftPanel, rightPanel } = getAdjacentPanels(resizer);
  if (!leftPanel || !rightPanel) return;

  const containerWidth = document.getElementById('main-content').offsetWidth;

  // 设置拖拽状态
  dragState = {
    isDragging: true,
    currentResizer: resizer,
    startX: e.clientX,
    currentX: e.clientX,
    leftPanel: leftPanel,
    rightPanel: rightPanel,
    startLeftWidth: leftPanel.offsetWidth,
    startRightWidth: rightPanel.offsetWidth,
    containerWidth: containerWidth,
    animationId: null
  };

  // 添加视觉反馈和禁用过渡
  resizer.classList.add('dragging');
  document.body.classList.add('resizing', 'no-select');
  leftPanel.classList.add('resizing');
  rightPanel.classList.add('resizing');
}

// 处理拖拽 - 1:1像素映射
function handleDrag(e) {
  if (!dragState.isDragging) return;

  dragState.currentX = e.clientX;

  // 取消之前的动画帧
  if (dragState.animationId) {
    cancelAnimationFrame(dragState.animationId);
  }

  // 使用requestAnimationFrame确保流畅性
  dragState.animationId = requestAnimationFrame(() => {
    const deltaX = dragState.currentX - dragState.startX;

    // 计算新的宽度（像素值）
    const newLeftWidth = dragState.startLeftWidth + deltaX;
    const newRightWidth = dragState.startRightWidth - deltaX;

    // 设置最小宽度限制
    const minWidth = 100;

    if (newLeftWidth >= minWidth && newRightWidth >= minWidth) {
      // 转换为百分比以保持响应式
      const leftPercent = (newLeftWidth / dragState.containerWidth) * 100;
      const rightPercent = (newRightWidth / dragState.containerWidth) * 100;

      // 直接设置width而不是flex，确保精确控制
      dragState.leftPanel.style.width = `${leftPercent}%`;
      dragState.rightPanel.style.width = `${rightPercent}%`;
      dragState.leftPanel.style.flex = 'none';
      dragState.rightPanel.style.flex = 'none';
    }
  });
}

// 结束拖拽
function endDrag() {
  if (!dragState.isDragging) return;

  // 取消动画帧
  if (dragState.animationId) {
    cancelAnimationFrame(dragState.animationId);
  }

  // 清理视觉反馈
  if (dragState.currentResizer) {
    dragState.currentResizer.classList.remove('dragging');
  }
  if (dragState.leftPanel) {
    dragState.leftPanel.classList.remove('resizing');
  }
  if (dragState.rightPanel) {
    dragState.rightPanel.classList.remove('resizing');
  }
  document.body.classList.remove('resizing', 'no-select');

  // 重置状态
  dragState = {
    isDragging: false,
    currentResizer: null,
    startX: 0,
    currentX: 0,
    leftPanel: null,
    rightPanel: null,
    startLeftWidth: 0,
    startRightWidth: 0,
    containerWidth: 0,
    animationId: null
  };
}

// 初始化拖拽功能
function initResizing() {
  const resizers = document.querySelectorAll('.resizer');

  resizers.forEach(resizer => {
    // 鼠标按下开始拖拽
    resizer.addEventListener('mousedown', (e) => startDrag(e, resizer), { passive: false });
  });

  // 全局鼠标事件
  document.addEventListener('mousemove', handleDrag, { passive: true });
  document.addEventListener('mouseup', endDrag, { passive: true });

  // 防止拖拽时选择文本
  document.addEventListener('selectstart', (e) => {
    if (dragState.isDragging) e.preventDefault();
  });
}

// 移动端自动进入专注模式（隐藏专注切换按钮并进入专注）
function initMobileFocus() {
  const isMobile = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  const focusToggle = document.getElementById('focus-toggle');

  // 检查是否有保存的状态
  const hasSavedState = localStorage.getItem(STORAGE_KEYS.focusMode) !== null;

  if (isMobile) {
    // 只有在没有保存状态的情况下才应用移动端默认行为
    // 隐藏专注切换按钮（样式已在 mobile CSS 中隐藏 header-right）
    if (focusToggle) focusToggle.style.display = 'none';

    // 设置专注状态并激活默认面板
    focusMode = true;
    activeFocusPanel = activeFocusPanel || 'editor';

    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.classList.add('focus-mode');

    // 调用现有的专注初始化逻辑（如果存在）
    if (typeof enterFocusMode === 'function') enterFocusMode();
    if (typeof updateTabs === 'function') updateTabs();
    if (typeof updateLayout === 'function') updateLayout();
  } else if (isMobile && hasSavedState) {
    // 如果有保存的状态，只隐藏专注切换按钮
    if (focusToggle) focusToggle.style.display = 'none';
  }
}

// 专注模式切换按钮事件
document.getElementById('focus-toggle').addEventListener('click', toggleFocusMode);

// Tab点击事件
document.querySelectorAll('.tab[data-panel]').forEach(tab => {
  tab.addEventListener('click', () => {
    const panelName = tab.dataset.panel;
    handleTabClick(panelName);
  });
});

// 键盘快捷键 - ESC退出专注模式
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && focusMode) {
    toggleFocusMode();
  }
});