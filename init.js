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

/* 
MindWord 应用的 主初始化模块 ，核心职责是：

1. 恢复用户状态 （专注模式、布局等）
2. 加载并渲染三大面板 （根据 PAGE_CONFIG 动态创建 iframe）
3. 绑定所有全局对话框 （新建、删除确认）的交互与快捷键
4. 注入 AI 弹窗托管层 （ aiModalFrame ），让子页面通过 postMessage 调用 AI 服务
5. 预加载 AI 提示词模板 到全局变量 window.__prompt_templates
6. 调用移动端自动专注模式 （ initMobileFocus ），移动端把三个面板显示到下面。
7. 统一监听子页面消息 （通知、AI 调用等）

*/

function initApp() {
  // 从localStorage恢复状态（在移动端自动专注模式之前）
  restoreStateFromStorage();

  updateLayout();
  initResizing();

  // 加载所有面板内容
  Object.keys(PAGE_CONFIG).forEach(panelName => {
    loadPanelContent(panelName);
  });

  // 应用恢复的状态到UI
  applyRestoredState();

  // 移动端自动专注模式初始化（在状态恢复之后）
  initMobileFocus();

  // 监听来自子页面的消息
  window.addEventListener('message', handleNotificationMessage);
  // 调试：打印所有收到的原始 message，便于排查 mindmap -> index -> editor 的消息流
  window.addEventListener('message', function (e) {
    try { console.log('[INDEX RAW MESSAGE]收到消息', e && e.data); } catch (err) { }
  }, { passive: true });

  // 绑定删除确认对话框按钮事件
  try {
    const cancelBtn = document.getElementById('delete-confirm-cancel');
    const okBtn = document.getElementById('delete-confirm-ok');
    if (cancelBtn) {
      cancelBtn.onclick = () => mw_hideDeleteConfirm();
    }
    if (okBtn) {
      okBtn.onclick = () => {
        const dialog = document.getElementById('delete-confirm-dialog');
        const docId = dialog.dataset.docId;
        if (docId) {
          // 单文档删除
          mw_confirmDeleteDoc();
        } else {
          // 批量删除
          mw_confirmBatchDelete();
        }
      };
    }
  } catch (e) {
    console.warn('绑定删除确认对话框按钮事件失败', e);
  }

  // 绑定新建文档对话框按钮事件
  try {
    const newDocCancelBtn = document.getElementById('new-doc-cancel');
    const newDocOkBtn = document.getElementById('new-doc-ok');
    const newDocInput = document.getElementById('new-doc-name');

    if (newDocCancelBtn) {
      newDocCancelBtn.onclick = () => mw_hideNewDocDialog();
    }
    if (newDocOkBtn) {
      newDocOkBtn.onclick = () => mw_confirmNewDoc(false);

      // AI生成初始树按钮事件
      const newDocAIBtn = document.getElementById('new-doc-ai');
      newDocAIBtn.onclick = () => mw_confirmNewDoc(true);
    }

    // 输入框回车事件
    if (newDocInput) {
      newDocInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          mw_confirmNewDoc();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          mw_hideNewDocDialog();
        }
      };
    }

    // 点击遮罩层关闭对话框
    const newDocOverlay = document.getElementById('new-doc-overlay');
    if (newDocOverlay) {
      newDocOverlay.onclick = (e) => {
        if (e.target === newDocOverlay) {
          mw_hideNewDocDialog();
        }
      };
    }
  } catch (e) {
    console.warn('绑定新建文档对话框按钮事件失败', e);
  }

  console.log('📌 Markdown Studio 已初始化');
  console.log('配置信息:', PAGE_CONFIG);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 预加载 AI prompt 模板到全局，供子 iframe（如 mindmap）同步读取
(function preloadAIPromptTemplates() {
  try {
    if (window.__prompt_templates) return;
    var url = 'ai/newai/prompt-templates.json';
    fetch(url, { cache: 'no-cache' }).then(function (resp) {
      if (!resp.ok) throw new Error('fetch failed ' + resp.status);
      return resp.json();
    }).then(function (json) {
      try { window.__prompt_templates = json; console.log('[INDEX] loaded prompt-templates.json', Array.isArray(json) ? json.length : 0); } catch (e) { }
    }).catch(function (err) {
      console.warn('[INDEX] preload prompt-templates.json failed', err);
      try { window.__prompt_templates = window.__prompt_templates || null; } catch (e) { }
    });
  } catch (e) { console.warn('[INDEX] preloadAIPromptTemplates error', e); }
})();

/* ==== AI 弹窗父层托管注入（来自 ai/newai/demo-caller.html 的适配实现） ====
   子 iframe 通过 postMessage({ type:'AI_MODAL_OPEN', requestId, payload }, '*')
   调用位于 ai/newai/AIServiceModal.html 的 AIServiceModal。支持 modal 与 silent
*/
(function injectAiModalHost() {
  try {
    var existing = document.getElementById('aiModalFrame');
    if (!existing) {
      var frame = document.createElement('iframe');
      frame.id = 'aiModalFrame';
      frame.src = 'ai/newai/AIServiceModal.html';
      frame.style.position = 'fixed';
      frame.style.inset = '0';
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.style.border = '0';
      frame.style.display = 'none';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.zIndex = '9999';
      frame.style.background = 'transparent';
      document.body.appendChild(frame);
    }
  } catch (e) {
    console.warn('[INDEX][AI] inject aiModalFrame failed', e);
  }

  window.__ai_req_map = window.__ai_req_map || new Map();
  window._headlessTimeouts = window._headlessTimeouts || new Map();

  window.addEventListener('message', function (e) {
    try {
      var msg = e && e.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'AI_MODAL_OPEN' && msg.requestId) {
        console.log('[INDEX] AI_MODAL_OPEN', msg.requestId, msg.payload);
        window.__ai_req_map.set(msg.requestId, e.source);
        var aiFrame = document.getElementById('aiModalFrame');

        if (msg.payload && msg.payload.mode === 'silent') {
          // headless handling (kept for compatibility)
          var platformCfgRaw = msg.payload.platformConfig || msg.payload.platform || {};
          var platformConfig = Object.assign({}, platformCfgRaw);

          try {
            var storageStr = aiFrame && aiFrame.contentWindow && aiFrame.contentWindow.localStorage
              ? aiFrame.contentWindow.localStorage.getItem('allAIPlatformConfigs')
              : null;
            if (!platformConfig.provider && storageStr) {
              try {
                var allCfgs = JSON.parse(storageStr || '{}') || {};
                var keys = Object.keys(allCfgs || {});
                var chosen = null;
                for (var i = 0; i < keys.length; i++) {
                  var k = keys[i];
                  var c = allCfgs[k] || {};
                  var hasApiKey = c.apiKey && String(c.apiKey).trim() !== '';
                  var okCloudflare = (k !== 'cloudflare') || (c.cloudflareAccountId && String(c.cloudflareAccountId).trim() !== '');
                  var okAzure = (k !== 'azure') || (c.azureEndpoint && String(c.azureEndpoint).trim() !== '');
                  if (hasApiKey && okCloudflare && okAzure) {
                    chosen = { key: k, cfg: c };
                    break;
                  }
                }
                if (chosen) {
                  platformConfig.provider = platformConfig.provider || chosen.key;
                  platformConfig.apiKey = platformConfig.apiKey || chosen.cfg.apiKey || '';
                  if (chosen.cfg.azureEndpoint) platformConfig.azureEndpoint = platformConfig.azureEndpoint || chosen.cfg.azureEndpoint;
                  if (chosen.cfg.cloudflareAccountId) platformConfig.cloudflareAccountId = platformConfig.cloudflareAccountId || chosen.cfg.cloudflareAccountId;
                  console.log('[INDEX] selected saved platform from aiModalFrame.localStorage:', chosen.key);
                }
              } catch (err) { console.warn('[INDEX] parse aiModalFrame.localStorage failed', err); }
            }
          } catch (err) { console.warn('[INDEX] read aiFrame localStorage failed', err); }

          var _tplRaw = msg.payload.templateData || {
            templateText: msg.payload.template || '',
            placeholders: msg.payload.placeholders || msg.payload.params || {}
          };

          // Handle templateKey - load template content if templateKey is provided
          if (msg.payload.templateKey && !(_tplRaw && typeof _tplRaw.templateText === 'string' && _tplRaw.templateText.trim())) {
            try {
              // Try to get template content from the iframe's template system
              var aiFrame = document.getElementById('aiModalFrame');
              if (aiFrame && aiFrame.contentWindow && aiFrame.contentWindow.promptTemplates) {
                var templates = aiFrame.contentWindow.promptTemplates;
                for (var i = 0; i < templates.length; i++) {
                  if (templates[i].name === msg.payload.templateKey) {
                    _tplRaw.templateText = templates[i].content || '';
                    console.log('[INDEX] Loaded template content for key:', msg.payload.templateKey);
                    break;
                  }
                }
              }
            } catch (err) {
              console.warn('[INDEX] Failed to load template content for key:', msg.payload.templateKey, err);
            }
          }

          try {
            if (!(_tplRaw && typeof _tplRaw.templateText === 'string' && _tplRaw.templateText.trim())) {
              var ph = (_tplRaw && _tplRaw.placeholders) ? _tplRaw.placeholders : (msg.payload.placeholders || msg.payload.params || {});
              var candidate = '';
              if (ph) {
                if (ph.input && typeof ph.input === 'object' && typeof ph.input.value === 'string') candidate = ph.input.value;
                else if (typeof ph.input === 'string') candidate = ph.input;
              }
              if (!candidate && typeof msg.payload.template === 'string') candidate = msg.payload.template;
              if (candidate && String(candidate).trim()) { _tplRaw.templateText = String(candidate); }
            }
          } catch (err) { console.warn('[INDEX] fill templateText failed', err); }

          // // 保留原始payload的所有字段，避免字段丢失
          // var headlessPayload = Object.assign({}, msg.payload || {}, {
          //     platformConfig: platformConfig,
          //     modelConfig: msg.payload.modelConfig || msg.payload.model || {},
          //     templateData: _tplRaw,
          //     options: msg.payload.options || {}
          // });

          try {
            aiFrame.contentWindow.postMessage(msg);
            var HEADLESS_TIMEOUT_MS = 60000;
            var t = setTimeout(function () {
              try {
                var src = window.__ai_req_map.get(msg.requestId);
                if (src) {
                  src.postMessage({
                    type: 'AI_MODAL_RESULT',

                    requestId: msg.requestId,
                    status: 'error',
                    detail: { message: 'headless call timeout' }
                  }, '*');
                }
              } catch (e) { }
              window._headlessTimeouts.delete(msg.requestId);
              window.__ai_req_map.delete(msg.requestId);
            }, HEADLESS_TIMEOUT_MS);
            window._headlessTimeouts.set(msg.requestId, { timer: t, source: e.source });
          } catch (err) {
            console.error('[INDEX] post to aiModalFrame failed', err);
            try { e.source.postMessage({ type: 'AI_MODAL_RESULT', requestId: msg.requestId, status: 'error', detail: { message: 'failed to post to aiModalFrame: ' + (err && err.message ? err.message : String(err)) } }, '*'); } catch (_) { }
            window.__ai_req_map.delete(msg.requestId);
          }
          return;
        }

        // modal path: show frame and forward
        try { if (aiFrame) { aiFrame.style.display = 'block'; aiFrame.focus && aiFrame.focus(); } } catch (_) { }

        // 处理templateKey参数，类似headless模式的逻辑
        var modalPayload = Object.assign({}, msg.payload || {}, { requestId: msg.requestId });

        // 如果存在templateKey但没有templateData，需要构建templateData
        if (modalPayload.templateKey && !modalPayload.templateData) {
          modalPayload.templateData = {
            templateKey: modalPayload.templateKey,
            templateText: modalPayload.template || '',
            placeholders: modalPayload.placeholders || modalPayload.params || {}
          };
        }

        try {
          aiFrame.contentWindow.postMessage({
            type: 'AI_MODAL_OPEN',
            payload: modalPayload
          }, '*');
          console.log('[INDEX] forwarded AI_MODAL_OPEN to aiModalFrame', msg.requestId);
        } catch (err) {
          console.error('[INDEX] forward AI_MODAL_OPEN failed', err);
          try { e.source.postMessage({ type: 'AI_MODAL_RESULT', requestId: msg.requestId, status: 'error', detail: { message: 'failed to forward to aiModalFrame' } }, '*'); } catch (_) { }
          window.__ai_req_map.delete(msg.requestId);
        }
      }

      // handle AI_MODAL_RESULT: when modal's "保存并应用" sends output, forward it as a RESULT to the original requester
      if (msg.type === 'AI_MODAL_RESULT' && msg.requestId) {
        console.log('[INDEX] AI_MODAL_RESULT', msg.requestId, 'actionType:', msg.actionType);
        var srcWinSave = window.__ai_req_map.get(msg.requestId);
        try { var fsave = document.getElementById('aiModalFrame'); if (fsave) fsave.style.display = 'none'; } catch (_) { }

        // 构造消息？

        // var outMsgSave = {
        //     type: 'AI_MODAL_RESULT',
        //     actionType: msg.actionType,
        //     requestId: msg.requestId,
        //     status: 'ok',
        //     detail: { output: msg.output }
        // };
        if (srcWinSave) {
          try {
            srcWinSave.postMessage(msg, '*');
            window.__ai_req_map.delete(msg.requestId);
            console.log('[INDEX] forwarded AI_MODAL_RESULT as RESULT to source', msg.requestId, 'with actionType:', msg.actionType);
          } catch (e) {
            console.warn('[INDEX] forward save output failed', e);
          }
        } else {
          console.warn('[INDEX] source not found for AI_MODAL_RESULT', msg.requestId);
        }
        return;
      }

      // modal result
      if (msg.type === 'AI_MODAL_RESULT' && msg.requestId) {
        console.log('[INDEX] AI_MODAL_RESULT', msg.requestId, msg.status, 'actionType:', msg.actionType);
        var srcWin = window.__ai_req_map.get(msg.requestId);
        // 仅在消息没有要求保留（keepOpen）时才隐藏 aiModalFrame。
        // 如果 msg.keepOpen === true，则保持弹窗打开（错误时 modal 会发送 keepOpen:true）
        try {
          var f = document.getElementById('aiModalFrame');
          if (f && !msg.keepOpen) {
            f.style.display = 'none';
          }
        } catch (_) { }
        if (srcWin) {
          try {
            srcWin.postMessage(msg, '*');
            console.log('[INDEX] forwarded AI_MODAL_RESULT to source', msg.requestId, 'with actionType:', msg.actionType);
          } catch (e) {
            console.warn('[INDEX] forward result failed', e);
          }
          window.__ai_req_map.delete(msg.requestId);
        } else {
          console.warn('[INDEX] source not found for', msg.requestId);
        }
      }

      // headless run result
      if (msg.type === 'AI_MODAL_RUN_RESULT' && msg.requestId) {
        console.log('[INDEX] AI_MODAL_RUN_RESULT', msg.requestId, msg.status);
        var srcWin2 = window.__ai_req_map.get(msg.requestId);
        try { var f2 = document.getElementById('aiModalFrame'); if (f2) f2.style.display = 'none'; } catch (_) { }
        var outMsg = { type: 'AI_MODAL_RESULT', requestId: msg.requestId, status: msg.status === 'ok' ? 'ok' : 'error', detail: msg.detail };
        if (srcWin2) { try { srcWin2.postMessage(outMsg, '*'); } catch (e) { console.warn('[INDEX] forward headless result failed', e); } window.__ai_req_map.delete(msg.requestId); } else { console.warn('[INDEX] source not found for headless', msg.requestId); }
      }
    } catch (err) {
      console.warn('[INDEX] ai message handler error', err);
    }
  }, false);
})();

// 在移动端创建底部 tabs：克隆 header .tabs 到 mobile-tabs（保持事件绑定）
function createMobileTabs() {
  try {
    const isMobile = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
      || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    const headerTabs = document.querySelector('.header .tabs');
    const mobileContainer = document.getElementById('mobile-tabs');
    if (!headerTabs || !mobileContainer) return;

    // 清空并克隆
    mobileContainer.innerHTML = '';
    headerTabs.querySelectorAll('.tab[data-panel]').forEach(tab => {
      const panel = tab.dataset.panel;
      const clone = tab.cloneNode(true);
      clone.classList.remove('active');
      clone.addEventListener('click', (e) => {
        e.preventDefault();
        handleTabClick(panel);
        // 视觉反馈
        document.querySelectorAll('.mobile-tabs .tab').forEach(t => t.classList.remove('active'));
        clone.classList.add('active');
      });
      mobileContainer.appendChild(clone);
    });

    // 显示/隐藏与 focusMode 状态同步
    if (isMobile) {
      mobileContainer.setAttribute('aria-hidden', 'false');
      mobileContainer.style.display = 'flex';
    } else {
      mobileContainer.setAttribute('aria-hidden', 'true');
      mobileContainer.style.display = 'none';
    }

    // 同步激活状态
    updateTabs();
  } catch (e) {
    console.warn('createMobileTabs error', e);
  }
}

// 当窗口尺寸变化时同步 mobile tabs
window.addEventListener('resize', () => {
  // debounce 简单实现
  clearTimeout(window._mobileTabsResizeTimer);
  window._mobileTabsResizeTimer = setTimeout(() => createMobileTabs(), 120);
});

// 在 initApp 中也调用一次（在 DOMContentLoaded 之后）
document.addEventListener('DOMContentLoaded', () => {
  createMobileTabs();
});