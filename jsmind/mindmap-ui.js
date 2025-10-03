/* mindmap-ui.js - UI related extracted scripts */


// --- extracted block from original HTML ---
// AI扩写函数（保留原逻辑）
function expandWithAI() {
  try {
    const selectedNode = jm.get_selected_node();
    if (!selectedNode) {
      showWarning('请先选择一个节点');
      return;
    }

    if (window.AIExpander) {
      window.AIExpander.expandNode(selectedNode.id, jm);
    } else {
      showError('AI扩写模块未加载，请刷新页面重试');
    }
  } catch (e) {
    console.error('AI扩写出错:', e);
    showError('AI扩写出错: ' + e.message);
  }
}

// 隐藏/显示浮动面板的 API（供 showNodeDetails 调用）
function hideNodeDetails() {
  const p = document.getElementById('nodeDetails');
  if (p) {
    p.style.display = 'none';
    p.setAttribute('aria-hidden', 'true');
    // 安全移除拖拽监听（若在闭包中定义则不会抛错）
    if (typeof removeNodeDetailsDragHandlers === 'function') {
      try { removeNodeDetailsDragHandlers(); } catch (e) { /* ignore */ }
    } else if (typeof window.removeNodeDetailsDragHandlers === 'function') {
      try { window.removeNodeDetailsDragHandlers(); } catch (e) { /* ignore */ }
    }
  }
  // 同步关闭“详情面板”开关，直到用户手动再开启
  try {
    window.__nodeDetailsEnabled = false;
    const cb = document.getElementById('toggleNodeDetailsCheckbox');
    if (cb) {
      cb.checked = false;
      cb.setAttribute('aria-checked', 'false');
    }
    const btn = document.getElementById('toggleNodeDetailsBtn');
    if (btn) {
      btn.classList.remove('state-on');
      btn.classList.remove('state-default');
      btn.classList.add('state-off');
      btn.setAttribute('aria-pressed', 'false');
    }
  } catch (e) { /* ignore */ }
}
function showNodeDetailsPanel() {
  const p = document.getElementById('nodeDetails');
  if (p) {
    p.style.display = 'block';
    p.setAttribute('aria-hidden', 'false');
    // 仅当面板未被用户移动过时，才重置为默认靠右位置
    if (p.dataset.moved !== 'true') {
      p.style.right = '12px';
      p.style.left = 'auto';
      p.style.top = '80px';
    }
    // 初始化拖拽监听（幂等）
    try {
      if (typeof initNodeDetailsDragHandlers === 'function') {
        initNodeDetailsDragHandlers();
      } else if (typeof window.initNodeDetailsDragHandlers === 'function') {
        window.initNodeDetailsDragHandlers();
      }
    } catch (e) { /* ignore */ }
  }
}

/* 打开详情面板并提示“请选择一个节点” */
function showEmptyDetailsPrompt() {
  try {
    if (window.__nodeDetailsEnabled === false) {
      try { console.log('[MW][details][UI] skip empty: toggle disabled'); } catch (e) { }
      return;
    }
    // 确保面板可见
    try { showNodeDetailsPanel(); } catch (e) { try { console.warn('[MW][details][UI] showNodeDetailsPanel failed', e); } catch (ee) { } }
    var panel = document.getElementById('nodeDetails');
    var empty = document.getElementById('nodeDetailsEmpty');
    var form = document.getElementById('nodeDetailsForm');
    var info = document.getElementById('nodeInfo');
    var topic = document.getElementById('nodeTopic');
    var notes = document.getElementById('nodeNotes');

    // 切换为空状态：显示空视图，隐藏表单
    if (empty) empty.style.display = 'block';
    if (form) form.style.display = 'none';

    if (topic) topic.value = '';
    if (notes) notes.value = '';

    // 关键日志：输出各元素与可见性
    try {
      console.log('[MW][details][UI] showEmptyDetailsPrompt:',
        {
          panelExists: !!panel,
          panelDisplay: panel && panel.style ? panel.style.display : undefined,
          panelAriaHidden: panel ? panel.getAttribute('aria-hidden') : undefined,
          emptyExists: !!empty,
          emptyDisplay: empty && empty.style ? empty.style.display : undefined,
          formExists: !!form,
          formDisplay: form && form.style ? form.style.display : undefined
        }
      );
    } catch (e) { }
  } catch (e) {
    try { console.warn('[MW][details][UI] showEmptyDetailsPrompt error', e); } catch (ee) { }
  }
}

try { window.showEmptyDetailsPrompt = showEmptyDetailsPrompt; } catch (e) { /* ignore */ }
// 缩放中心修正：在鼠标/触摸位置设置 transform-origin，配合现有库缩放以该点为中心
(function setupZoomOrigin() {
  const container = document.getElementById('fullScreenMindmap');
  if (!container) return;
  function setOrigin(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    container.style.transformOrigin = `${x}px ${y}px`;
  }
  // 鼠标滚轮：在缩放前设置 origin
  container.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      // 若用户同时按键，仍支持，但优先设置 origin
    }
    setOrigin(e.clientX, e.clientY);
    // 不阻止原生滚动/缩放逻辑，让现有库处理实际缩放
  }, { passive: true });
  // 触摸：记录触摸点以设置 origin（用于双指缩放前）
  container.addEventListener('touchstart', function (e) {
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    setOrigin(t.clientX, t.clientY);
  }, { passive: true });
})();


/* 拖拽支持：鼠标与触摸 */
(function () {
  let dragging = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;
  let handlersAdded = false;



  function onPointerDown(e) {
    const p = document.getElementById('nodeDetails');
    if (!p) return;
    dragging = true;
    p.style.transition = 'none';
    const rect = p.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    if (e.type === 'touchstart') {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else {
      startX = e.clientX;
      startY = e.clientY;
    }
    // prevent iframe text selection during drag
    document.body.style.userSelect = 'none';
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const p = document.getElementById('nodeDetails');
    if (!p) return;
    let cx = (e.type === 'touchmove') ? e.touches[0].clientX : e.clientX;
    let cy = (e.type === 'touchmove') ? e.touches[0].clientY : e.clientY;
    const dx = cx - startX;
    const dy = cy - startY;
    const left = origLeft + dx;
    const top = origTop + dy;
    // 限制到视口内
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const rect = p.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const minLeft = 8;
    const maxLeft = vw - w - 8;
    const minTop = 8;
    const maxTop = vh - h - 8;
    const nx = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
    const ny = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));
    // 记录临时位移量，onPointerUp 会基于此判断是否标记为已移动
    try {
      p.dataset._dragMovedX = String(dx);
      p.dataset._dragMovedY = String(dy);
    } catch (e) { /* ignore */ }
    p.style.right = 'auto';
    p.style.left = nx + 'px';
    p.style.top = ny + 'px';
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    const p = document.getElementById('nodeDetails');
    if (p) p.style.transition = '';
    // 标记是否发生过显著位移，页面未刷新前保持位置
    try {
      if (p) {
        const movedX = parseFloat(p.dataset._dragMovedX || '0');
        const movedY = parseFloat(p.dataset._dragMovedY || '0');
        if (Math.abs(movedX) > 2 || Math.abs(movedY) > 2) {
          p.dataset.moved = 'true';
        }
        delete p.dataset._dragMovedX;
        delete p.dataset._dragMovedY;
      }
    } catch (e) { /* ignore */ }
  }

  function initNodeDetailsDragHandlers() {
    if (handlersAdded) return;
    const p = document.getElementById('nodeDetails');
    if (!p) return;
    // 使用 panel-header 作为抓手，如无则全面板可拖
    const handle = p.querySelector('.panel-header') || p;
    handle.addEventListener('mousedown', onPointerDown, { passive: true });
    window.addEventListener('mousemove', onPointerMove, { passive: true });
    window.addEventListener('mouseup', onPointerUp, { passive: true });
    handle.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp, { passive: true });
    handlersAdded = true;
  }



  // 如果面板已显示，初始化一次
  document.addEventListener('DOMContentLoaded', function () {
    const p = document.getElementById('nodeDetails');
    if (p && p.style.display !== 'none') initNodeDetailsDragHandlers();
  });
  // 在窗口大小变化时微调位置，避免超出
  window.addEventListener('resize', function () {
    const p = document.getElementById('nodeDetails');
    if (!p || p.style.display === 'none') return;
    const rect = p.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const maxLeft = Math.max(8, vw - rect.width - 8);
    const maxTop = Math.max(8, vh - rect.height - 8);
    let left = rect.left;
    let top = rect.top;
    if (left > maxLeft) left = maxLeft;
    if (top > maxTop) top = maxTop;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  });

})();


// --- extracted block from original HTML ---
(function () {
  // 节点详情开关（默认开启）
  window.__nodeDetailsEnabled = (window.__nodeDetailsEnabled === undefined) ? true : !!window.__nodeDetailsEnabled;

  function updateToggleUI() {
    var enabled = !!window.__nodeDetailsEnabled;
    // 复选框（兼容保留）
    var cb = document.getElementById('toggleNodeDetailsCheckbox');
    if (cb) {
      cb.checked = enabled;
      cb.setAttribute('aria-checked', enabled ? 'true' : 'false');
    }
    // 图标按钮（新）
    var btn = document.getElementById('toggleNodeDetailsBtn');
    if (btn) {
      btn.classList.remove('state-on', 'state-off', 'state-default');
      btn.classList.add(enabled ? 'state-on' : 'state-off');
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
  }

  // 切换处理：启用时若存在选中节点立即显示详情；禁用时隐藏面板并阻止后续弹出
  function handleToggleChange(checked) {
    window.__nodeDetailsEnabled = !!checked;
    if (!window.__nodeDetailsEnabled) {
      if (typeof hideNodeDetails === 'function') {
        try { hideNodeDetails(); } catch (e) { /* ignore */ }
      }
    } else {
      // 启用时：若有选中节点，立即显示其详情；否则打开面板并提示“请选择一个节点”
      try {
        var sel = null;
        if (window.jm && typeof window.jm.get_selected_node === 'function') {
          sel = window.jm.get_selected_node();
        }
        if (sel) {
          try { showNodeDetails(sel); } catch (e) { /* ignore */ }
        } else {
          // 无选中节点：打开面板并显示空状态
          try { showEmptyDetailsPrompt(); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    }
    updateToggleUI();
  }

  // 挂载事件
  document.addEventListener('DOMContentLoaded', function () {
    // 初始化 UI（无论是否有复选框或按钮）
    updateToggleUI();

    // 复选框（兼容）
    var cb = document.getElementById('toggleNodeDetailsCheckbox');
    if (cb) {
      cb.addEventListener('change', function (e) {
        handleToggleChange(!!e.target.checked);
      }, { passive: true });
      cb.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') {
          setTimeout(function () { handleToggleChange(!!cb.checked); }, 0);
        }
      });
    }

    // 图标按钮（新）
    var btn = document.getElementById('toggleNodeDetailsBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        handleToggleChange(!window.__nodeDetailsEnabled);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggleChange(!window.__nodeDetailsEnabled);
        }
      });
    }
  });

  // 包装 showNodeDetails：若开关关闭则静默返回
  if (typeof window.showNodeDetails === 'function') {
    var _origShowNodeDetails = window.showNodeDetails;
    window.showNodeDetails = function (node) {
      if (window.__nodeDetailsEnabled === false) return;
      return _origShowNodeDetails.apply(this, arguments);
    };
  } else {
    // 若函数尚未定义，延迟包装（在后续定义时检测）
    var _tryWrap = function () {
      if (typeof window.showNodeDetails === 'function') {
        var _orig = window.showNodeDetails;
        window.showNodeDetails = function (node) {
          if (window.__nodeDetailsEnabled === false) return;
          return _orig.apply(this, arguments);
        };
        clearInterval(_tryWrapInterval);
      }
    };
    var _tryWrapInterval = setInterval(_tryWrap, 200);
  }
})();


// --- extracted block from original HTML ---
(function mw_post_init_fix() {
  try {
    function isMobileNow() {
      var isSmallScreen = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
      var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
      return isSmallScreen || (hasTouch && window.innerWidth <= 900);
    }

    function relocateBatchOpsIfNeeded() {
      try {
        var isMobile = isMobileNow();
        var batch = document.getElementById('batchOperations');
        var mw = document.getElementById('mw-batchops');
        if (!batch || !mw) return;
        if (!isMobile) {
          // copy count
          var sc = batch.querySelector('#selectedCount');
          var scVal = sc ? sc.textContent : '0';
          var targetStrong = mw.querySelector('#selectedCountDisplay');
          if (targetStrong) targetStrong.textContent = scVal;
          batch.style.display = 'none';
          mw.style.display = 'inline-flex';
          // keep references
          window.__mw_batch_source = batch;
          window.__mw_batch_target = mw;
        } else {
          batch.style.display = 'none';
          if (mw) mw.style.display = 'none';
        }
      } catch (e) { console.warn('[MW] relocateBatchOpsIfNeeded failed', e); }
    }

    function ensureDetailsToggleVisibleOnDesktop() {
      try {
        var cbDetails = document.getElementById('toggleNodeDetailsCheckbox');
        if (!cbDetails) return;
        var label = cbDetails.parentElement;
        if (!label) return;
        if (!isMobileNow()) {
          label.style.display = ''; // restore default
        }
      } catch (e) { /* ignore */ }
    }

    // sync selected count periodically (small cost, robust)
    function startSelectedCountSync() {
      try {
        var source = document.getElementById('batchOperations');
        var target = document.getElementById('mw-batchops');
        if (!source || !target) return;
        var sSrc = source.querySelector('#selectedCount');
        var sTgt = target.querySelector('#selectedCountDisplay');
        if (!sSrc || !sTgt) return;
        var last = null;
        setInterval(function () {
          try {
            var now = sSrc.textContent || sSrc.innerText || '0';
            if (now !== last) {
              last = now;
              sTgt.textContent = now;
            }
          } catch (e) { }
        }, 250);
      } catch (e) { /* ignore */ }
    }

    // run on load and on resize/orientationchange
    function boot() {
      relocateBatchOpsIfNeeded();
      ensureDetailsToggleVisibleOnDesktop();
      startSelectedCountSync();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(boot, 50);
    } else {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 50); });
      window.addEventListener('load', function () { setTimeout(boot, 50); });
    }
    window.addEventListener('resize', function () { setTimeout(relocateBatchOpsIfNeeded, 60); });
    window.addEventListener('orientationchange', function () { setTimeout(relocateBatchOpsIfNeeded, 60); });
  } catch (e) {
    console.error('[MW] post init fix error', e);
  }
})();
