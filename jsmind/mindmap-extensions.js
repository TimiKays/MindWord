/* mindmap-extensions.js - extension related extracted scripts */

// --- extracted block from original HTML ---
// 防重复绑定补丁（非侵入）：对一组常见事件的等价回调去重（DOMContentLoaded, load, resize, storage）
    // 只在 addEventListener 注册时做检测并忽略等价 listener 的重复注册（使用 listener.toString() 作为轻量指纹）
    (function(){
      try {
        if (!document.__mw_event_dedupe_installed) {
          var __orig_add = document.addEventListener.bind(document);
          var __seen = Object.create(null); // map: eventType -> Set of fingerprints
          document.addEventListener = function(type, listener, options) {
            try {
              if (typeof listener === 'function' && (type === 'DOMContentLoaded' || type === 'load' || type === 'resize' || type === 'storage')) {
                __seen[type] = __seen[type] || new Set();
                var fp = listener.toString();
                if (__seen[type].has(fp)) {
                  // 等价回调已注册，忽略重复绑定
                  return;
                }
                __seen[type].add(fp);
              }
            } catch (e) { /* 忽略指纹计算错误，回退到默认行为 */ }
            return __orig_add(type, listener, options);
          };
          document.__mw_event_dedupe_installed = true;
        }
      } catch (e) {
        console.warn('[MW] event dedupe install failed', e);
      }
    })();
