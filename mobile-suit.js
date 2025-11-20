

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
  if (!isMobile()) {
    console.log('[MW_reloadMindmapOnShowIfMobile] not mobile, returning');
    return;
  }
  console.log('[MW_reloadMindmapOnShowIfMobile] mobile mindmap detected, scheduling iframe reload');
  setTimeout(reloadMindmapIframeOnce, 80);
};
