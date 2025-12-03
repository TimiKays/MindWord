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



// 仅在移动端启用的 mindmap iframe 强制重载策略
function isMobile() {
  return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

function reloadMindmapIframeOnce() {
  console.log('[reloadMindmapIframeOnce] starting iframe reload');
  var iframe = document.getElementById('iframe-mindmap');
  if (!iframe) {
    // 如果没有 id 为 iframe-mindmap 的元素，尝试按 panel src 选择
    iframe = document.querySelector('iframe[src*="jsmind/mindmap.html"]');
  }
  if (!iframe) {
    console.warn('[reloadMindmapIframeOnce] no mindmap iframe found');
    return;
  }
  console.log('[reloadMindmapIframeOnce] found iframe, starting reload process');
  try {
    var src = iframe.getAttribute('src') || iframe.src;
    src = src.replace(/([?&])_t=\d+/, '$1');
    iframe.src = src + (src.includes('?') ? '&' : '?') + '_t=' + Date.now();
    console.log('[reloadMindmapIframeOnce] set new src with timestamp, waiting for load event');

    function onLoadHandler() {
      console.log('[reloadMindmapIframeOnce] iframe loaded, sending mw_relayout messages');
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'mw_relayout' }, '*');
          console.log('[reloadMindmapIframeOnce] sent first mw_relayout message');
          setTimeout(function () {
            try {
              iframe.contentWindow.postMessage({ type: 'mw_relayout' }, '*');
              console.log('[reloadMindmapIframeOnce] sent second mw_relayout message');
            } catch (e) {
              console.warn('[reloadMindmapIframeOnce] failed to send second mw_relayout:', e);
            }
          }, 200);
        } else {
          console.warn('[reloadMindmapIframeOnce] iframe.contentWindow not available');
        }
      } catch (e) {
        console.warn('[reloadMindmapIframeOnce] error during relayout messages:', e);
      }
      iframe.removeEventListener('load', onLoadHandler);
      console.log('[reloadMindmapIframeOnce] completed');
    }
    iframe.addEventListener('load', onLoadHandler);
  } catch (e) {
    console.warn('[reloadMindmapIframeOnce] error during reload:', e);
  }
}

window.MW_reloadMindmapOnShowIfMobile = function (panelName) {
  console.log('[MW_reloadMindmapOnShowIfMobile] called with panelName:', panelName);
  if (panelName !== 'mindmap') {
    console.log('[MW_reloadMindmapOnShowIfMobile] not mindmap panel, returning');
    return;
  }
  // 桌面和移动端都会在“首次真正显示思维导图面板”时强制刷新一次 iframe，
  // 避免在专注模式或历史状态恢复后 iframe 在隐藏状态下渲染导致的“全部挤在一起”的问题。
  if (window.__mw_mindmapReloadScheduledOnce) {
    console.log('[MW_reloadMindmapOnShowIfMobile] reload already scheduled once, skip');
    return;
  }
  window.__mw_mindmapReloadScheduledOnce = true;
  console.log('[MW_reloadMindmapOnShowIfMobile] scheduling iframe reload (desktop/mobile unified)');
  setTimeout(reloadMindmapIframeOnce, 80);
};
