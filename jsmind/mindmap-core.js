/* mindmap-core.js - extracted from mindmap.html inline scripts (core) */

// --- extracted block from original HTML ---
(function () {
  if (!document.getElementById('mw-node-type-badge-style')) {
    var s = document.createElement('style');
    s.id = 'mw-node-type-badge-style';
    s.textContent = `
            .jmnode { position: relative; }
            .node-type-badge {
              position: absolute;
              right: 4px;
              top: 2px;
              background: rgba(0,0,0,0.6);
              color: white;
              font-size: 10px;
              padding: 2px 4px;
              border-radius: 8px;
              line-height: 1;
              pointer-events: none;
              z-index: 30;
            }
            .mw-hidden-node { display: none !important; }
          `;
    document.head.appendChild(s);
  }

  function getNodeTypeSafe(id) {
    try {
      var node = (window.jm && typeof window.jm.get_node === 'function') ? window.jm.get_node(id) : null;
      if (!node) return undefined;
      if (typeof node.type !== 'undefined') return node.type;
      if (node.data && typeof node.data.type !== 'undefined') return node.data.type;
      return undefined;
    } catch (e) { return undefined; }
  }

  function updateNodeTypeBadges() {
    var show = !!document.getElementById('toggleShowNodeTypeCheckbox').checked;
    var nodes = document.querySelectorAll('[nodeid]');
    nodes.forEach(function (el) {
      var id = el.getAttribute('nodeid') || el.getAttribute('node-id') || el.getAttribute('data-nodeid');
      if (!id) return;
      var t = getNodeTypeSafe(id);
      var badge = el.querySelector('.node-type-badge');
      if (!show) {
        if (badge) badge.remove();
        return;
      }
      var label = (t === 'list') ? 'L' : (t === 'heading' ? 'H' : (t ? String(t).charAt(0).toUpperCase() : ''));
      if (!label) { if (badge) badge.remove(); return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'node-type-badge';
        el.appendChild(badge);
      }
      badge.textContent = label;
    });
  }

  function applyNodeVisibilityFilter() {
    // 方案2：按数据树过滤并重建视图 —— 当“只看标题”勾选时移除整颗 list 子树（不写入持久层）
    try {
      var hideLists = !!document.getElementById('toggleShowListNodesCheckbox').checked;

      // Helper: deep clone node tree (safe)
      function cloneTree(tree) {
        try { return JSON.parse(JSON.stringify(tree)); } catch (e) { return null; }
      }

      // Helper: remove list-type nodes recursively (removes node and its descendants)
      function removeListSubtrees(node) {
        if (!node || !node.children || node.children.length === 0) return node;
        node.children = node.children.filter(function (child) {
          var t = getNodeType(child) || (child.data && (child.data.type || (child.data.data && child.data.data.type)));
          if (t === 'list') {
            // drop this child (and its subtree)
            return false;
          }
          // otherwise recurse into child
          removeListSubtrees(child);
          return true;
        });
        return node;
      }

      // If hideLists enabled -> build filtered tree and show it
      if (hideLists) {
        // If not already in filtered view, save original snapshot
        if (!window.__mw_filteredViewActive) {
          try { window.__mw_originalNodeTreeSnapshot = cloneTree(jm.get_data()); } catch (e) { }
        }
        var original = window.__mw_originalNodeTreeSnapshot || cloneTree(jm.get_data());
        if (!original || !original.data) {
          console.warn('[MW] applyNodeVisibilityFilter: 无法获取原始 nodeTree');
          return;
        }
        var filtered = cloneTree(original);
        // remove list subtrees from filtered.data
        filtered.data = removeListSubtrees(filtered.data) || filtered.data;
        // mark flag and show filtered tree (do NOT persist)
        window.__mw_filteredViewActive = true;
        try {
          console.log('[MW] applyNodeVisibilityFilter: 启用过滤视图（隐藏 list 子树）');
          // save viewport then show filtered view and restore viewport
          try { saveViewport(); } catch (e) { }
          jm.show(filtered);
          // small delay then restore viewport and badges and re-init scrolling/layout
          setTimeout(function () {
            try { restoreViewport(); } catch (e) { }
            try { if (typeof window.MW_updateNodeTypeBadges === 'function') window.MW_updateNodeTypeBadges(); } catch (e) { }
            // ensure inner scrollable is correctly initialized
            try {
              const inner = document.getElementById('fullScreenMindmap').querySelector('.jsmind-inner');
              if (inner) {
                inner.style.overflow = 'auto';
                inner.style.width = '100%';
                inner.style.height = '100%';
              }
              // call setupMindmapScrolling to reapply any required handlers (idempotent)
              try { if (typeof setupMindmapScrolling === 'function') setupMindmapScrolling(); } catch (e) { }
              // force a small refresh on jm to recalc layout
              try { if (jm && typeof jm.refresh === 'function') jm.refresh(); } catch (e) { }
            } catch (e) { }
          }, 80);
        } catch (e) {
          console.warn('[MW] applyNodeVisibilityFilter: 启用过滤视图失败', e);
        }
        return;
      }

      // If hideLists is false -> restore original tree if we had replaced it
      if (window.__mw_filteredViewActive) {
        try {
          var snap = window.__mw_originalNodeTreeSnapshot || jm.get_data();
          if (snap) {
            console.log('[MW] applyNodeVisibilityFilter: 恢复完整视图');
            try { saveViewport(); } catch (e) { }
            jm.show(snap);
            setTimeout(function () {
              try { restoreViewport(); } catch (e) { }
              try { if (typeof window.MW_updateNodeTypeBadges === 'function') window.MW_updateNodeTypeBadges(); } catch (e) { }
              try { if (typeof window.MW_applyNodeVisibilityFilter === 'function') window.MW_applyNodeVisibilityFilter(); } catch (e) { }
              // re-init scrolling/layout
              try {
                const inner = document.getElementById('fullScreenMindmap').querySelector('.jsmind-inner');
                if (inner) {
                  inner.style.overflow = 'auto';
                  inner.style.width = '100%';
                  inner.style.height = '100%';
                }
                try { if (typeof setupMindmapScrolling === 'function') setupMindmapScrolling(); } catch (e) { }
                try { if (jm && typeof jm.refresh === 'function') jm.refresh(); } catch (e) { }
              } catch (e) { }
            }, 80);
          }
        } catch (e) {
          console.warn('[MW] applyNodeVisibilityFilter: 恢复完整视图失败', e);
        } finally {
          window.__mw_filteredViewActive = false;
          // keep original snapshot for possible re-use; do not auto-clear to avoid reloading from storage
        }
        return;
      }

      // Default fallback: nothing to do
    } catch (e) {
      console.warn('[MW] applyNodeVisibilityFilter error', e);
    }
  }

  function handleDetailsToggle(checked) {
    window.__nodeDetailsEnabled = !!checked;
    if (!window.__nodeDetailsEnabled) {
      if (typeof hideNodeDetails === 'function') {
        try { hideNodeDetails(); } catch (e) { }
      }
    } else {
      try {
        var sel = null;
        if (window.jm && typeof window.jm.get_selected_node === 'function') sel = window.jm.get_selected_node();
        if (sel) { try { showNodeDetails(sel); } catch (e) { } }
      } catch (e) { }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cbDetails = document.getElementById('toggleNodeDetailsCheckbox');
    var cbType = document.getElementById('toggleShowNodeTypeCheckbox');
    var cbList = document.getElementById('toggleShowListNodesCheckbox');

    // 移动端检测：隐藏不需要的控件并设置默认状态
    var isMobile = (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches));
    if (isMobile) {
      try {
        var exportBtn = document.getElementById('export-json-btn');
        if (exportBtn) exportBtn.style.display = 'none';
        if (cbDetails && cbDetails.parentElement) cbDetails.parentElement.style.display = 'none';
        // 默认移动端不开启显示类型/只看标题
        if (cbType) cbType.checked = false;
        if (cbList) cbList.checked = false;
      } catch (e) { /* ignore */ }
    }

    if (cbDetails) {
      cbDetails.checked = !!window.__nodeDetailsEnabled;
      cbDetails.addEventListener('change', function (e) { handleDetailsToggle(!!e.target.checked); }, { passive: true });
    }
    if (cbType) {
      // 默认关闭，用户可开启
      cbType.checked = !!cbType.checked;
      cbType.addEventListener('change', function () { updateNodeTypeBadges(); }, { passive: true });
    }
    if (cbList) {
      // 默认关闭，用户可开启
      cbList.checked = !!cbList.checked;
      cbList.addEventListener('change', function () { applyNodeVisibilityFilter(); }, { passive: true });
    }

    window.MW_scheduleOnce('applyBadges', function () {
      try { updateNodeTypeBadges(); } catch (e) { }
      try { applyNodeVisibilityFilter(); } catch (e) { }
    }, 120);

    // 初始化图标选择器
    window.MW_scheduleOnce('initIconPicker', function () {
      try { initIconPicker(); } catch (e) { }
    }, 150);
  });

  window.MW_updateNodeTypeBadges = updateNodeTypeBadges;
  window.MW_applyNodeVisibilityFilter = applyNodeVisibilityFilter;
})();


// --- extracted block from original HTML ---
let jm = null;
let currentNodeTree = null;

// 全局 MW 状态容器（集中多选集合等共享状态，避免在多个作用域重复创建）
window.MW = window.MW || {};
window.MW.multiSelected = window.MW.multiSelected || new Set();

// 全局轻量调度器：按 name 去重、防抖调度回调（幂等注入，便于替换散落的 setTimeout）
(function () {
  if (!window.MW_scheduleOnce) {
    window.MW.__scheduleMap = window.MW.__scheduleMap || new Map();
    window.MW_scheduleOnce = function (name, fn, delay) {
      try {
        if (!name || typeof fn !== 'function') {
          return;
        }
        // clear prior timer if exists
        const existing = window.MW.__scheduleMap.get(name);
        if (existing && existing.timer) {
          clearTimeout(existing.timer);
        }
        const timer = setTimeout(function () {
          try {
            fn();
          } catch (e) { }
          window.MW.__scheduleMap.delete(name);
        }, typeof delay === 'number' ? delay : 60);
        window.MW.__scheduleMap.set(name, { timer: timer, ts: Date.now() });
      } catch (e) { }
    };
  }
})();
// 初始化思维导图
function initMindmap() {
  if (jm) {
    loadNodeTree(); // 不传参数，让函数自己从localStorage获取
    return;
  }

  const options = {
    container: 'fullScreenMindmap',           // 容器ID，必填
    editable: true,                         // 是否可编辑，默认为true
    theme: 'primary',                       // 主题：primary|success|info|warning|danger|greensea|nephrite|belizehole|wisteria|asphalt
    mode: 'side',                           // 显示模式：full|side右侧
    support_html: true,                     // 节点是否支持HTML，默认为true
    view: {
      engine: 'svg',                   // 思维导图各节点之间线条的绘制引擎，canvas|svg
      hmargin: 100,                       // 水平边距
      vmargin: 50,                        // 垂直边距
      line_width: 1,                      // 连接线宽度
      line_color: '#999',                 // 连接线颜色
      expander_style: 'circle',           // 展开器样式：number|circle|square


      node_overflow: 'wrap',              // 文字过长处理：hidden|wrap，改为wrap确保多选时内容不被隐藏



    },
    layout: {
      hspace: 30,                         // 节点水平间距
      vspace: 20,                         // 节点垂直间距
      pspace: 13                          // 节点与连接线的间距
    },
    shortcut: {
      enable: true,                         // 是否启用快捷键
      handles: {},                        // 自定义处理函数

      // 快捷键映射
      mapping: {
        addchild: 9,                    // Tab - 添加子节点
        addbrother: 13,                 // Enter - 添加兄弟节点
        editnode: 113,                  // F2 - 编辑节点
        delnode: 46,                    // Delete - 删除节点
        toggle: 32,                     // Space - 展开/折叠节点

        // 切换选中
        left: 37,                       // 选中左侧节点
        up: 38,                         // 
        right: 39,                      // 
        down: 40,                       // 

      }
    },

    // 预设主题配置
    // theme: 'info',  // 使用jsmind内置主题：primary, warning, danger, success, info, orange, etc.

  };

  jm = new jsMind(options);

  // 将jsMind实例赋值给window，供其他模块访问
  window.jm = jm;
  const multiSelected = window.MW.multiSelected;

  // 配置思维导图容器的滚动行为
  setupMindmapScrolling();

  // 包装核心API以捕获新增/移动节点，做"类型对齐"并保存
  (function wrapMindAPIs() {
    // 新增节点包装
    const __origAdd = jm.add_node && jm.add_node.bind(jm);
    if (__origAdd) {
      jm.add_node = function (parent_node, nodeid, topic, data) {
        const ret = __origAdd(parent_node, nodeid, topic, data);
        try {
          const id = nodeid || (ret && ret.id);
          if (id && typeof applySiblingOrParentType === 'function') {
            applySiblingOrParentType(id);
          }
          // 若父节点为列表，则将自己与子孙全部归一为列表
          try {
            const pid = (typeof parent_node === 'string' ? parent_node : (parent_node && parent_node.id))
              || (id && jm.get_node(id) && jm.get_node(id).parent && jm.get_node(id).parent.id);
            if (pid) {
              const p = jm.get_node(pid);
              if (p && typeof getNodeType === 'function' && getNodeType(p) === 'list') {
                normalizeSubtreeUnderList(id, p);
              }
            }
          } catch (e2) {
            // 忽略归一列表处理错误
          }
          if (typeof debouncedSave === 'function') debouncedSave();
        } catch (e) {
          // 忽略后置处理错误
        }
        return ret;
      };
    }
    // 移动节点包装
    const __origMove = jm.move_node && jm.move_node.bind(jm);
    if (__origMove) {
      jm.move_node = function (nodeid, beforeid, parentid, direction) {
        console.log(`🔄 jm.move_node被调用 - 节点:${nodeid}, 之前:${beforeid}, 父节点:${parentid}, 方向:${direction}`);

        // 防护：禁止将节点移动到自身或其子孙下（会造成数据循环/丢失）
        try {
          if (nodeid && parentid) {
            try {
              const maybeParent = jm.get_node(parentid);
              if (maybeParent) {
                // 遍历 parent 的祖先链，检查是否包含 nodeid
                let p = maybeParent;
                let depthGuard = 0;
                let illegal = false;
                while (p && depthGuard < 100) {
                  if (String(p.id) === String(nodeid)) {
                    illegal = true;
                    break;
                  }
                  p = p.parent ? jm.get_node(p.parent.id) : null;
                  depthGuard++;
                }
                if (illegal) {
                  console.warn('[MW][protect] 拒绝移动：目标父节点是自身或子孙，操作已取消', { nodeid, beforeid, parentid, direction });
                  // 打印快照便于诊断
                  try { console.log('[MW][protect] node 快照:', jm.get_node(nodeid)); } catch (e) { }
                  try { console.log('[MW][protect] target parent 快照:', maybeParent); } catch (e) { }
                  return false;
                }
              }
            } catch (e) { console.warn('[MW][protect] 检查 parent 合法性失败', e); }
          }
        } catch (e) { console.warn('[MW][protect] 前置防护异常', e); }

        // 检查是否是批量拖拽模式
        console.log('🔍 检查批量拖拽模式:', {
          hasBatchDragData: !!window.__batchDragData,
          isBatchDragging: window.__batchDragData?.isBatchDragging,
          selectedNodesLength: window.__batchDragData?.selectedNodes?.length
        });

        // 批量拖拽模式处理
        if (window.__batchDragData && window.__batchDragData.isBatchDragging &&
          window.__batchDragData.selectedNodes && window.__batchDragData.selectedNodes.length > 0) {

          const currentIndex = window.__batchDragData.selectedNodes.indexOf(nodeid);

          // 只要被移动的节点在多选列表中，就触发批量移动
          if (currentIndex !== -1) {
            // 初始化已移动节点记录
            if (!window.__batchDragData.movedNodes) {
              window.__batchDragData.movedNodes = new Set();
            }

            // 避免重复移动同一节点
            if (window.__batchDragData.movedNodes.has(nodeid)) {
              return true;
            }

            // 先移动当前节点
            const ret = __origMove(nodeid, beforeid, parentid, direction);
            window.__batchDragData.movedNodes.add(nodeid);

            // 批量移动其他选中节点
            let movedCount = 1;
            for (const otherNodeId of window.__batchDragData.selectedNodes) {
              if (otherNodeId === nodeid || window.__batchDragData.movedNodes.has(otherNodeId)) {
                continue;
              }

              try {
                __origMove(otherNodeId, beforeid, parentid, direction);
                window.__batchDragData.movedNodes.add(otherNodeId);
                movedCount++;
              } catch (moveError) {
                console.warn(`批量移动节点失败:`, moveError);
              }

              // 为每个被移动节点执行与单节点移动一致的后置归一/层级调整（幂等）
              try {
                if (otherNodeId && typeof applySiblingOrParentType === 'function') {
                  try { applySiblingOrParentType(otherNodeId); } catch (eAp) { /* ignore */ }
                }
                if (parentid) {
                  try {
                    const pNode = jm.get_node(parentid);
                    const movedNode = jm.get_node(otherNodeId);
                    if (movedNode && pNode) {
                      const pType = (typeof getNodeType === 'function') ? getNodeType(pNode) : undefined;
                      const pLevel = (typeof getNodeLevel === 'function') ? getNodeLevel(pNode) : null;
                      if (pType === 'heading' && pLevel != null) {
                        const newLevel = Math.min(6, pLevel + 1);
                        try { setNodeLevel(movedNode, newLevel); } catch (eSet) { /* ignore */ }
                        try { adjustChildrenHeadingLevel(movedNode, getNodeLevel(movedNode) || newLevel); } catch (eAdj) { /* ignore */ }
                      } else if (pType === 'list') {
                        try { normalizeSubtreeUnderList(otherNodeId, pNode); } catch (eNorm) { /* ignore */ }
                      }
                    }
                  } catch (e2) { /* ignore */ }
                }
                if (typeof debouncedSave === 'function') debouncedSave();
              } catch (ePost) {
                console.warn('[MW] 批量移动后置处理失败:', ePost);
              }
            }

            // 后置处理：类型对齐和列表归一化
            try {
              if (nodeid && typeof applySiblingOrParentType === 'function') {
                applySiblingOrParentType(nodeid);
              }

              if (parentid) {
                const p = jm.get_node(parentid);
                if (p && typeof getNodeType === 'function' && getNodeType(p) === 'list') {
                  normalizeSubtreeUnderList(nodeid, p);
                  window.__batchDragData.selectedNodes.forEach(otherId => {
                    if (otherId !== nodeid) {
                      normalizeSubtreeUnderList(otherId, p);
                    }
                  });
                }
              }

              if (typeof debouncedSave === 'function') debouncedSave();
            } catch (e) {
              // 忽略后置处理错误
            }

            return ret;
          }
        }

        // 普通单个节点移动
        console.log('🔄 普通单个节点移动');
        const ret = __origMove(nodeid, beforeid, parentid, direction);
        try {
          if (nodeid && typeof applySiblingOrParentType === 'function') {
            applySiblingOrParentType(nodeid);
          }
          // 若新父节点为列表，则将自己与子孙全部归一为列表
          try {
            if (parentid) {
              const p = jm.get_node(parentid);
              if (p && typeof getNodeType === 'function' && getNodeType(p) === 'list') {
                normalizeSubtreeUnderList(nodeid, p);
              }
            }
          } catch (e2) {
            // 忽略归一列表处理错误
          }
          if (typeof debouncedSave === 'function') debouncedSave();
        } catch (e) {
          // 忽略后置处理错误
        }
        return ret;
      };
    }
  })();

  // 初始化完成后加载数据
  loadNodeTree();

  // 绑定事件 - 删除旧的批量移动逻辑，现在使用拖拽批量移动
  jm.add_event_listener(function (type, data) {
    if (type === jsMind.event_type.select) {
      const selectedNodeid = jm.get_selected_node();
      if (selectedNodeid) {
        // 正常模式：显示节点详情
        showNodeDetails(selectedNodeid);
      }
    }
  });

  // --- 自动触发：在多种 jsMind 事件后防抖地重新应用节点类型徽章与可见性过滤 ---
  (function attachBadgeHooks() {
    const debouncedApply = (function () {
      let t = null;
      return function () {
        clearTimeout(t);
        t = setTimeout(function () {
          try {
            console.log('[MW] 应用徽章/过滤 - 开始');
            if (typeof window.MW_updateNodeTypeBadges === 'function') {
              window.MW_updateNodeTypeBadges();
              console.log('[MW] 已调用 MW_updateNodeTypeBadges');
            }
          } catch (e) { console.warn('[MW] MW_updateNodeTypeBadges 执行失败', e); }
          try {
            if (typeof window.MW_applyNodeVisibilityFilter === 'function') {
              window.MW_applyNodeVisibilityFilter();
              console.log('[MW] 已调用 MW_applyNodeVisibilityFilter');
            }
          } catch (e) { console.warn('[MW] MW_applyNodeVisibilityFilter 执行失败', e); }
          console.log('[MW] 应用徽章/过滤 - 完成');
        }, 60);
      };
    })();

    // 订阅常见会导致 DOM 变化或需要重新应用徽章/过滤的事件
    jm.add_event_listener(function (type, data) {
      if (!type) return;
      const interesting = [
        jsMind.event_type.select,
        jsMind.event_type.show,
        jsMind.event_type.resize,
        jsMind.event_type.refresh,
        jsMind.event_type.expand,
        jsMind.event_type.collapse,
        jsMind.event_type.edit,
        jsMind.event_type.add,
        jsMind.event_type.move
      ];
      if (interesting.indexOf(type) !== -1) {
        console.log('[MW] 捕获 jsMind 事件:', type);
        debouncedApply();
      }
    });

    // 作为保险：在全局包装点或其他地方也可直接调用 window.MW_debouncedApplyBadges()
    window.MW_debouncedApplyBadges = debouncedApply;

    // 立即执行一次，确保初始化时生效
    try { debouncedApply(); } catch (e) {/* ignore */ }
  })();

}

// 配置思维导图容器的滚动行为
function setupMindmapScrolling() {
  if (!jm) return;

  // 视口保存/恢复工具（用于在删除/撤销/重载时保持画布位置）
  let __mw_savedViewport = null;
  function saveViewport() {
    try {
      const container = document.getElementById('fullScreenMindmap');
      if (!container) return;
      const inner = container.querySelector('.jsmind-inner') || container;
      // 优先保存当前选中节点 id（若有）
      let selectedId = null;
      try {
        selectedId = (window.jm && typeof jm.get_selected_node === 'function' && jm.get_selected_node()) ? jm.get_selected_node().id : null;
      } catch (e) { selectedId = null; }
      // 优先使用 jm.view（若存在）读取缩放与平移
      let zoom = null, pan = null;
      try {
        if (window.jm && jm.view && typeof jm.view.get_scale === 'function') {
          zoom = jm.view.get_scale && jm.view.get_scale();
        }
        if (window.jm && jm.view && typeof jm.view.get_translate === 'function') {
          pan = jm.view.get_translate && jm.view.get_translate();
        }
      } catch (e) { /* ignore */ }
      __mw_savedViewport = {
        scrollTop: inner.scrollTop,
        scrollLeft: inner.scrollLeft,
        zoom: zoom,
        pan: pan,
        selectedId: selectedId,
        // also save container transform style as fallback
        transform: container.style.transform || ''
      };
      try { console.log('[MMAP] saveViewport', __mw_savedViewport); } catch (e) { }
    } catch (e) { /* ignore */ }
  }
  function restoreViewport() {
    try {
      if (!__mw_savedViewport) return;
      const container = document.getElementById('fullScreenMindmap');
      if (!container) return;
      const inner = container.querySelector('.jsmind-inner') || container;
      // 优先使用 jm.view API 恢复缩放与平移
      try {
        if (window.jm && jm.view && typeof jm.view.set_scale === 'function' && __mw_savedViewport.zoom != null) {
          jm.view.set_scale && jm.view.set_scale(__mw_savedViewport.zoom);
        }
        if (window.jm && jm.view && typeof jm.view.set_translate === 'function' && __mw_savedViewport.pan != null) {
          jm.view.set_translate && jm.view.set_translate(__mw_savedViewport.pan);
        }
      } catch (e) { /* ignore */ }
      // 恢复 scroll
      try { inner.scrollTop = __mw_savedViewport.scrollTop || 0; } catch (e) { }
      try { inner.scrollLeft = __mw_savedViewport.scrollLeft || 0; } catch (e) { }
      // 恢复 transform 样式作为最后手段
      if (container.style && __mw_savedViewport.transform) {
        container.style.transform = __mw_savedViewport.transform;
      }
      // 优先恢复之前的选中节点（仅当节点仍然存在且不是 root 被强制选中时）
      try {
        const wanted = __mw_savedViewport.selectedId;
        if (wanted && window.jm && typeof jm.get_node === 'function' && jm.get_node(wanted)) {
          const cur = (jm.get_selected_node && jm.get_selected_node()) ? jm.get_selected_node().id : null;
          if (cur !== wanted) {
            // 仅在必要时恢复选中，避免触发不必要的焦点变换
            try { jm.select_node && jm.select_node(wanted); } catch (e) { /* ignore */ }
            try { console.log('[MMAP] restoreSelection ->', wanted); } catch (e) { }
          }
        }
      } catch (e) { /* ignore */ }
      try { console.log('[MMAP] restoreViewport', __mw_savedViewport); } catch (e) { }
      __mw_savedViewport = null;
    } catch (e) { /* ignore */ }
  }

  const container = document.getElementById('fullScreenMindmap');
  if (!container) return;

  // 等待jsmind完全初始化
  setTimeout(() => {
    // 查找jsmind创建的jmnodes容器
    const jmnodes = container.querySelector('.jmnodes');
    const jsmindInner = container.querySelector('.jsmind-inner');

    if (jmnodes) {
      // 确保jmnodes可以超出容器边界
      jmnodes.style.overflow = 'visible';
      jmnodes.style.position = 'relative';
    }

    if (jsmindInner) {
      // 确保内部容器有滚动条
      jsmindInner.style.overflow = 'auto';
      jsmindInner.style.width = '100%';
      jsmindInner.style.height = '100%';
    }

    // 已移除冗余滚动调试输出
  }, 500); // 延迟500ms确保jsmind完成DOM创建
}

// 加载NodeTree数据
function loadNodeTree(nodeTreeData) {
  if (!jm) return;

  // 如果没有提供数据，尝试从localStorage获取
  if (!nodeTreeData) {
    const cachedData = localStorage.getItem('mindword_nodetree_data');
    if (cachedData) {
      try {
        nodeTreeData = JSON.parse(cachedData);
      } catch (error) {
        nodeTreeData = getDefaultNodeTree();
      }
    } else {
      nodeTreeData = getDefaultNodeTree();
    }
  }

  try {
    // 确保数据格式正确
    if (typeof nodeTreeData === 'string') {
      nodeTreeData = JSON.parse(nodeTreeData);
    }

    // 在显示前保存视口（以便在重新渲染后恢复）
    try { saveViewport(); } catch (e) { }
    jm.show(nodeTreeData);
    currentNodeTree = nodeTreeData;
    // 渲染完成后尝试恢复视口（延迟以保证DOM已就绪）
    window.MW_scheduleOnce('restoreViewportAfterShow', function () { try { restoreViewport(); } catch (e) { } }, 120);

    // 渲染完成后同步节点类型徽章与可见性过滤（确保开关生效）
    try {
      if (typeof window.MW_updateNodeTypeBadges === 'function') {
        setTimeout(window.MW_updateNodeTypeBadges, 80);
      }
      if (typeof window.MW_applyNodeVisibilityFilter === 'function') {
        setTimeout(window.MW_applyNodeVisibilityFilter, 80);
      }
    } catch (e) { /* ignore */ }

    // 延迟执行DOM操作，确保元素已加载
    setTimeout(() => {


      try {
        if (typeof window.MW_updateNodeTypeBadges === 'function') window.MW_updateNodeTypeBadges();
        if (typeof window.MW_applyNodeVisibilityFilter === 'function') window.MW_applyNodeVisibilityFilter();
      } catch (e) { }
    }, 100);
  } catch (error) {
    // 如果加载失败，尝试加载默认数据
    try {
      jm.show(getDefaultNodeTree());
    } catch (defaultError) {
      console.error('加载默认数据失败:', defaultError);
    }
  }
}

// 获取当前NodeTree
function getCurrentNodeTree() {
  return jm ? jm.get_data() : null;
}

// 显示节点详情
function showNodeDetails(node) {
  // 允许传入 id 或 node 对象，统一为 node
  if (node && typeof node === 'string') {
    node = jm && jm.get_node ? jm.get_node(node) : node;
  }
  if (!node) return;

  // 确保浮动面板显示（向后兼容现有逻辑）
  if (typeof showNodeDetailsPanel === 'function') {
    try { showNodeDetailsPanel(); } catch (e) { /* ignore */ }
  }

  const nodeInfo = document.getElementById('nodeInfo');
  const nodeTopic = document.getElementById('nodeTopic');
  const nodeNotes = document.getElementById('nodeNotes');
  if (!nodeInfo || !nodeTopic || !nodeNotes) return;

  // 安全字段读取
  const level = (node.level != null) ? node.level
    : (node.data && node.data.level != null ? node.data.level : 0);
  const ordered = (node.ordered != null) ? node.ordered
    : (node.data && node.data.ordered != null ? node.data.ordered : undefined);
  const marker = (node.marker != null) ? node.marker
    : (node.data && node.data.marker != null ? node.data.marker : undefined);
  const type = (node.type != null) ? node.type
    : (node.data && node.data.type != null ? node.data.type : undefined);
  const notes = (node.notes != null) ? node.notes
    : (node.data && node.data.notes != null ? node.data.notes : '');

  // 构造调试快照（避免循环引用）
  const snapshot = {
    id: node.id,
    topic: node.topic || '',
    type: type,
    level: level,
    ordered: ordered,
    marker: marker,
    notes: notes,
    parentId: node.parent && node.parent.id ? node.parent.id : null,
    childrenIds: Array.isArray(node.children) ? node.children.map(c => c && c.id).filter(Boolean) : []
  };


  // 提取图标和纯文本主题
  const topicParts = (snapshot.topic || '').trim().split(/\s+/);
  let pureTopic = snapshot.topic || '';
  currentIcon = '';

  // 检查是否以表情符号开头
  if (topicParts.length > 0) {
    const firstChar = topicParts[0];
    const emojiPattern = /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{00A9}]|[\u{00AE}]|[\u{2122}]|[\u{23F0}]|[\u{23F3}]|[\u{231A}]|[\u{231B}]|[\u{2328}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{24C2}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2600}-\u{2604}]|[\u{260E}]|[\u{2611}]|[\u{2614}-\u{2615}]|[\u{2618}]|[\u{261D}]|[\u{2620}]|[\u{2622}-\u{2623}]|[\u{2626}]|[\u{262A}]|[\u{262E}-\u{262F}]|[\u{2638}-\u{263A}]|[\u{2640}]|[\u{2642}]|[\u{2648}-\u{2653}]|[\u{265F}-\u{2660}]|[\u{2663}]|[\u{2665}-\u{2666}]|[\u{2668}]|[\u{267B}]|[\u{267E}-\u{267F}]|[\u{2692}-\u{2697}]|[\u{2699}]|[\u{269B}-\u{269C}]|[\u{26A0}-\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26B0}-\u{26B1}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26C8}]|[\u{26CE}-\u{26CF}]|[\u{26D1}]|[\u{26D3}-\u{26D4}]|[\u{26E9}-\u{26EA}]|[\u{26F0}-\u{26F5}]|[\u{26F7}-\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{2709}]|[\u{270A}-\u{270B}]|[\u{270C}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu;

    if (emojiPattern.test(firstChar)) {
      currentIcon = firstChar;
      pureTopic = topicParts.slice(1).join(' ');
    }
  }

  nodeTopic.value = pureTopic;
  nodeNotes.value = notes || '';

  // 更新图标选择器按钮的图标
  const iconSelectorBtn = document.getElementById('iconSelectorBtn');
  if (iconSelectorBtn) {
    iconSelectorBtn.innerHTML = currentIcon || '😊';
  }

  // 设置自动更新事件监听
  setupAutoUpdate();
}

// 设置自动更新功能
function setupAutoUpdate() {
  const nodeTopic = document.getElementById('nodeTopic');
  const nodeNotes = document.getElementById('nodeNotes');

  if (!nodeTopic || !nodeNotes) return;

  // 移除之前的事件监听避免重复
  nodeTopic.removeEventListener('input', handleAutoUpdate);
  nodeNotes.removeEventListener('input', handleAutoUpdate);

  // 添加新的事件监听
  nodeTopic.addEventListener('input', handleAutoUpdate);
  nodeNotes.addEventListener('input', handleAutoUpdate);

  // 在输入时进入编辑模式（抑制全局 toast），失焦恢复
  try {
    // 移除已有的 focus/blur，避免重复注册
    nodeTopic.removeEventListener('focus', _mw_onInputFocus);
    nodeTopic.removeEventListener('blur', _mw_onInputBlur);
    nodeNotes.removeEventListener('focus', _mw_onInputFocus);
    nodeNotes.removeEventListener('blur', _mw_onInputBlur);
  } catch (e) { }

  function _mw_onInputFocus() {
    try { window.MW_setEditingMode(true); } catch (e) { }
  }
  function _mw_onInputBlur() {
    try { window.MW_setEditingMode(false); } catch (e) { }
  }

  try {
    nodeTopic.addEventListener('focus', _mw_onInputFocus, { passive: true });
    nodeTopic.addEventListener('blur', _mw_onInputBlur, { passive: true });
    nodeNotes.addEventListener('focus', _mw_onInputFocus, { passive: true });
    nodeNotes.addEventListener('blur', _mw_onInputBlur, { passive: true });
  } catch (e) { }
}

// 处理自动更新
let autoUpdateTimer = null;
function handleAutoUpdate() {
  // 清除之前的定时器
  if (autoUpdateTimer) {
    clearTimeout(autoUpdateTimer);
  }

  // 延迟500ms执行更新，避免频繁更新
  autoUpdateTimer = setTimeout(() => {
    const selected = jm.get_selected_node();
    if (!selected) return;

    const nodeTopic = document.getElementById('nodeTopic');
    const nodeNotes = document.getElementById('nodeNotes');

    const newTopic = nodeTopic.value.trim();
    const newNotes = nodeNotes.value.trim();

    // 检查是否有变化
    let hasChanges = false;

    if (newTopic !== selected.topic) {
      jm.update_node(selected.id, newTopic);
      hasChanges = true;
    }

    // 确保 data 存在，避免空引用
    if (!selected.data) selected.data = {};
    const prevNotes = (selected.notes != null ? selected.notes : (selected.data.notes != null ? selected.data.notes : ''));
    if (newNotes !== prevNotes) {
      selected.data.notes = newNotes;
      hasChanges = true;
    }

    if (hasChanges) {
      refreshAllNotesDisplay();
      saveToLocalStorage();
      showAutoUpdateIndicator();
    }
  }, 500);
}

// 图标选择器相关函数
const availableIcons = [
  { emoji: '✅', name: '绿色钩' },
  { emoji: '❌', name: '红色叉' },
  { emoji: '⚠️', name: '警告' },
  { emoji: '❗', name: '重要' },
  { emoji: '❓', name: '疑问' },
  { emoji: '💡', name: '想法' },
  { emoji: '🎯', name: '目标' },
  { emoji: '📋', name: '任务' },
  { emoji: '📌', name: '固定' },
  { emoji: '⭐', name: '星标' },
  { emoji: '🔥', name: '热门' },
  { emoji: '💯', name: '满分' },
  { emoji: '✨', name: '闪光' },
  { emoji: '🎉', name: '庆祝' },
  { emoji: '🚀', name: '启动' },
  { emoji: '💪', name: '力量' }
];

let currentIcon = '';

function initIconPicker() {
  const iconGrid = document.getElementById('iconGrid');
  const iconSelectorBtn = document.getElementById('iconSelectorBtn');

  if (!iconGrid || !iconSelectorBtn) return;

  // 生成图标网格
  iconGrid.innerHTML = '';
  availableIcons.forEach(icon => {
    const iconElement = document.createElement('button');
    iconElement.type = 'button';
    iconElement.className = 'icon-picker-item';
    iconElement.innerHTML = icon.emoji;
    iconElement.title = icon.name;
    iconElement.style.cssText = 'width: 40px; height: 40px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center;';
    iconElement.onmouseover = () => iconElement.style.background = '#f0f0f0';
    iconElement.onmouseout = () => iconElement.style.background = 'white';
    iconElement.onclick = () => selectIcon(icon.emoji);
    iconGrid.appendChild(iconElement);
  });

  // 绑定按钮点击事件
  iconSelectorBtn.onclick = showIconPicker;
}

function showIconPicker() {
  const modal = document.getElementById('iconPickerModal');
  if (modal) {
    modal.style.display = 'block';
  }
}

function hideIconPicker() {
  const modal = document.getElementById('iconPickerModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function selectIcon(emoji) {
  currentIcon = emoji;
  updateTopicWithIcon();
  hideIconPicker();
}

function clearIcon() {
  currentIcon = '';
  updateTopicWithIcon();
  hideIconPicker();
}

function updateTopicWithIcon() {
  const nodeTopic = document.getElementById('nodeTopic');
  if (!nodeTopic) return;

  let topic = nodeTopic.value;

  // 移除现有的图标（如果有的话）
  // 检查主题是否以表情符号开头
  const emojiPattern = /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{00A9}]|[\u{00AE}]|[\u{2122}]|[\u{23F0}]|[\u{23F3}]|[\u{231A}]|[\u{231B}]|[\u{2328}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{24C2}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2600}-\u{2604}]|[\u{260E}]|[\u{2611}]|[\u{2614}-\u{2615}]|[\u{2618}]|[\u{261D}]|[\u{2620}]|[\u{2622}-\u{2623}]|[\u{2626}]|[\u{262A}]|[\u{262E}-\u{262F}]|[\u{2638}-\u{263A}]|[\u{2640}]|[\u{2642}]|[\u{2648}-\u{2653}]|[\u{265F}-\u{2660}]|[\u{2663}]|[\u{2665}-\u{2666}]|[\u{2668}]|[\u{267B}]|[\u{267E}-\u{267F}]|[\u{2692}-\u{2697}]|[\u{2699}]|[\u{269B}-\u{269C}]|[\u{26A0}-\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26B0}-\u{26B1}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26C8}]|[\u{26CE}-\u{26CF}]|[\u{26D1}]|[\u{26D3}-\u{26D4}]|[\u{26E9}-\u{26EA}]|[\u{26F0}-\u{26F5}]|[\u{26F7}-\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{2709}]|[\u{270A}-\u{270B}]|[\u{270C}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F201}]|[\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]|[\u{1F300}-\u{1F321}]|[\u{1F324}-\u{1F393}]|[\u{1F396}-\u{1F397}]|[\u{1F399}-\u{1F39B}]|[\u{1F39E}-\u{1F3F0}]|[\u{1F3F3}-\u{1F3F5}]|[\u{1F3F7}-\u{1F3FA}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F400}-\u{1F4FF}]|[\u{1F500}-\u{1F53D}]|[\u{1F549}-\u{1F54E}]|[\u{1F550}-\u{1F567}]|[\u{1F56F}-\u{1F570}]|[\u{1F573}-\u{1F57A}]|[\u{1F58A}-\u{1F58D}]|[\u{1F590}]|[\u{1F595}-\u{1F596}]|[\u{1F5A4}]|[\u{1F5A5}-\u{1F5FA}]|[\u{1F5FB}-\u{1F5FF}]|[\u{1F600}]|[\u{1F601}]|[\u{1F602}]|[\u{1F603}]|[\u{1F604}]|[\u{1F605}]|[\u{1F606}]|[\u{1F607}]|[\u{1F608}]|[\u{1F609}]|[\u{1F60A}]|[\u{1F60B}]|[\u{1F60C}]|[\u{1F60D}]|[\u{1F60E}]|[\u{1F60F}]|[\u{1F610}]|[\u{1F611}]|[\u{1F612}]|[\u{1F613}]|[\u{1F614}]|[\u{1F615}]|[\u{1F616}]|[\u{1F617}]|[\u{1F618}]|[\u{1F619}]|[\u{1F61A}]|[\u{1F61B}]|[\u{1F61C}]|[\u{1F61D}]|[\u{1F61E}]|[\u{1F61F}]|[\u{1F620}]|[\u{1F621}]|[\u{1F622}]|[\u{1F623}]|[\u{1F624}]|[\u{1F625}]|[\u{1F626}]|[\u{1F627}]|[\u{1F628}]|[\u{1F629}]|[\u{1F62A}]|[\u{1F62B}]|[\u{1F62C}]|[\u{1F62D}]|[\u{1F62E}]|[\u{1F62F}]|[\u{1F630}]|[\u{1F631}]|[\u{1F632}]|[\u{1F633}]|[\u{1F634}]|[\u{1F635}]|[\u{1F636}]|[\u{1F637}]|[\u{1F638}]|[\u{1F639}]|[\u{1F63A}]|[\u{1F63B}]|[\u{1F63C}]|[\u{1F63D}]|[\u{1F63E}]|[\u{1F63F}]|[\u{1F640}]|[\u{1F641}]|[\u{1F642}]|[\u{1F643}]|[\u{1F644}]|[\u{1F645}]|[\u{1F646}]|[\u{1F647}]|[\u{1F648}]|[\u{1F649}]|[\u{1F64A}]|[\u{1F64B}]|[\u{1F64C}]|[\u{1F64D}]|[\u{1F64E}]|[\u{1F64F}]|[\u{1F680}]|[\u{1F681}]|[\u{1F682}]|[\u{1F683}]|[\u{1F684}]|[\u{1F685}]|[\u{1F686}]|[\u{1F687}]|[\u{1F688}]|[\u{1F689}]|[\u{1F68A}]|[\u{1F68B}]|[\u{1F68C}]|[\u{1F68D}]|[\u{1F68E}]|[\u{1F68F}]|[\u{1F690}]|[\u{1F691}]|[\u{1F692}]|[\u{1F693}]|[\u{1F694}]|[\u{1F695}]|[\u{1F696}]|[\u{1F697}]|[\u{1F698}]|[\u{1F699}]|[\u{1F69A}]|[\u{1F69B}]|[\u{1F69C}]|[\u{1F69D}]|[\u{1F69E}]|[\u{1F69F}]|[\u{1F6A0}]|[\u{1F6A1}]|[\u{1F6A2}]|[\u{1F6A3}]|[\u{1F6A4}]|[\u{1F6A5}]|[\u{1F6A6}]|[\u{1F6A7}]|[\u{1F6A8}]|[\u{1F6A9}]|[\u{1F6AA}]|[\u{1F6AB}]|[\u{1F6AC}]|[\u{1F6AD}]|[\u{1F6AE}]|[\u{1F6AF}]|[\u{1F6B0}]|[\u{1F6B1}]|[\u{1F6B2}]|[\u{1F6B3}]|[\u{1F6B4}]|[\u{1F6B5}]|[\u{1F6B6}]|[\u{1F6B7}]|[\u{1F6B8}]|[\u{1F6B9}]|[\u{1F6BA}]|[\u{1F6BB}]|[\u{1F6BC}]|[\u{1F6BD}]|[\u{1F6BE}]|[\u{1F6BF}]|[\u{1F6C0}]|[\u{1F6C1}]|[\u{1F6C2}]|[\u{1F6C3}]|[\u{1F6C4}]|[\u{1F6C5}]|[\u{1F6CB}]|[\u{1F6CC}]|[\u{1F6CD}]|[\u{1F6CE}]|[\u{1F6CF}]|[\u{1F6D0}]|[\u{1F6D1}]|[\u{1F6D2}]|[\u{1F6D3}]|[\u{1F6D4}]|[\u{1F6D5}]|[\u{1F6D6}]|[\u{1F6D7}]|[\u{1F6DD}-\u{1F6DF}]|[\u{1F6E0}-\u{1F6E5}]|[\u{1F6E9}]|[\u{1F6EB}-\u{1F6EC}]|[\u{1F6F0}]|[\u{1F6F3}-\u{1F6F9}]|[\u{1F6FA}-\u{1F6FC}]|[\u{1F7E0}-\u{1F7EB}]|[\u{1F7F0}]|[\u{1F90C}-\u{1F93A}]|[\u{1F93C}-\u{1F945}]|[\u{1F947}-\u{1F9FF}]|[\u{1FA70}-\u{1FA74}]|[\u{1FA78}-\u{1FA7C}]|[\u{1FA80}-\u{1FA86}]|[\u{1FA90}-\u{1FA98}]|[\u{1FAA0}-\u{1FAA8}]|[\u{1FAB0}-\u{1FAB6}]|[\u{1FAC0}-\u{1FAC2}]|[\u{1FAD0}-\u{1FAD6}]|[\u{1FB00}-\u{1FB92}]|[\u{1FB94}-\u{1FBCA}]|[\u{1FBF0}-\u{1FBF9}]|[\u{00A9}]|[\u{00AE}]|[\u{203C}]|[\u{2049}]|[\u{2122}]|[\u{2139}]|[\u{2194}-\u{2199}]|[\u{21A9}-\u{21AA}]|[\u{231A}-\u{231B}]|[\u{2328}]|[\u{23CF}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{24C2}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2600}-\u{2604}]|[\u{260E}]|[\u{2611}]|[\u{2614}-\u{2615}]|[\u{2618}]|[\u{261D}]|[\u{2620}]|[\u{2622}-\u{2623}]|[\u{2626}]|[\u{262A}]|[\u{262E}-\u{262F}]|[\u{2638}-\u{263A}]|[\u{2640}]|[\u{2642}]|[\u{2648}-\u{2653}]|[\u{265F}-\u{2660}]|[\u{2663}]|[\u{2665}-\u{2666}]|[\u{2668}]|[\u{267B}]|[\u{267E}-\u{267F}]|[\u{2692}-\u{2697}]|[\u{2699}]|[\u{269B}-\u{269C}]|[\u{26A0}-\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26B0}-\u{26B1}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26C8}]|[\u{26CE}-\u{26CF}]|[\u{26D1}]|[\u{26D3}-\u{26D4}]|[\u{26E9}-\u{26EA}]|[\u{26F0}-\u{26F5}]|[\u{26F7}-\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{2709}]|[\u{270A}-\u{270B}]|[\u{270C}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu;

  // 移除开头的表情符号
  topic = topic.replace(emojiPattern, '').trim();


  // 如果有选中的图标，添加到前面
  if (currentIcon) {
    topic = currentIcon + ' ' + topic;
  }

  nodeTopic.value = topic;

  // 触发自动更新
  handleAutoUpdate();
}

// 显示自动更新提示
function showAutoUpdateIndicator() {
  const indicator = document.getElementById('autoUpdateIndicator');
  if (!indicator) return;

  indicator.style.display = 'block';
  indicator.classList.add('auto-update-show');

  // 2秒后隐藏提示
  setTimeout(() => {
    indicator.style.display = 'none';
    indicator.classList.remove('auto-update-show');
  }, 2000);
}

// 更新节点备注
function updateNodeNotes() {
  if (!jm) return;

  const selected = jm.get_selected_node();
  if (!selected) {
    showWarning('请先选择一个节点');
    return;
  }

  const nodeTopic = document.getElementById('nodeTopic');
  const nodeNotes = document.getElementById('nodeNotes');

  const newTopic = nodeTopic.value.trim();
  const newNotes = nodeNotes.value.trim();

  // 检查是否有任何变化需要更新
  let hasChanges = false;

  // 更新节点主题（如果有变化）
  if (newTopic !== selected.topic) {
    jm.update_node(selected.id, newTopic);
    hasChanges = true;
  }

  // 更新节点备注（如果有变化）
  if (newNotes !== (selected.notes || '')) {
    // 直接更新根级别的notes字段（与其他代码保持一致）
    selected.data.notes = newNotes;
    hasChanges = true;
  }

  // 如果没有变化，提示用户
  if (!hasChanges) {
    showInfo('节点内容没有变化！');
    return;
  }

  refreshAllNotesDisplay();

  // // 同步到父页面
  // if (window.parent !== window) {
  //     window.parent.postMessage({
  //         type: 'mindmapUpdated',
  //         data: jm.get_data()
  //     }, '*');
  // }

  // 保存到localStorage并同步
  saveToLocalStorage();

  // 使用轻量的面板内提示代替全局通知
  try { showAutoUpdateIndicator(); } catch (e) { try { showSuccess('节点更新成功！'); } catch (e2) { } }
}

// 刷新所有备注显示
function refreshAllNotesDisplay() {
  if (!jm) return;

  const notesList = document.getElementById('notesList');
  if (!notesList) return; // 防止DOM元素不存在

  const nodeTree = jm.get_data();

  if (!nodeTree || !nodeTree.data) {
    notesList.innerHTML = '<p style="color: #6c757d;">暂无节点数据</p>';
    return;
  }

  const nodesWithNotes = [];

  function collectNodes(node) {
    if (!node) return;

    const notes = node.notes;  // 直接从根级别读取notes
    if (notes && notes.trim()) {
      nodesWithNotes.push({
        id: node.id,
        topic: node.topic || '未命名节点',
        notes: notes.trim(),
        level: node.level || 0
      });
    }

    if (node.children) {
      node.children.forEach(collectNodes);
    }
  }

  collectNodes(nodeTree.data);

  if (nodesWithNotes.length === 0) {
    notesList.innerHTML = '<p style="color: #6c757d;">暂无节点包含备注信息</p>';
    return;
  }

  nodesWithNotes.sort((a, b) => a.level - b.level);

  let html = '';
  nodesWithNotes.forEach(node => {
    const levelIndent = '　'.repeat(node.level);
    html += `
                    <div class="note-item">
                        <h5>${levelIndent}${node.topic}</h5>
                        <p>${node.notes}</p>
                        <small style="color: #6c757d;">ID: ${node.id}</small>
                    </div>
                `;
  });

  notesList.innerHTML = html;
}

// 设置鼠标悬停显示备注
function setupHoverNotes() {
  const container = document.getElementById('fullScreenMindmap');
  const notesOverlay = document.getElementById('notesOverlay');
  const hoverNote = document.getElementById('hoverNote');

  let hoverTimeout;

  container.addEventListener('mousemove', function (e) {
    if (!jm) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let node = null;
    try {
      if (jm.get_node_by_coordinate) {
        node = jm.get_node_by_coordinate(x, y);
      } else {
        const target = e.target;
        if (target && target.closest('.jmnode')) {
          const nodeId = target.closest('.jmnode').getAttribute('nodeid');
          if (nodeId) {
            node = jm.get_node(nodeId);
          }
        }
      }
    } catch (error) {
      // 静默处理错误
    }

    if (node && node.notes && node.notes.trim()) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        hoverNote.textContent = node.notes;
        notesOverlay.style.display = 'block';
        notesOverlay.style.left = Math.min(x + 10, rect.width - 260) + 'px';
        notesOverlay.style.top = Math.max(y - 50, 10) + 'px';
      }, 300);
    } else {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        notesOverlay.style.display = 'none';
      }, 100);
    }
  });

  container.addEventListener('mouseleave', function () {
    clearTimeout(hoverTimeout);
    notesOverlay.style.display = 'none';
  });
}



/* 画布框选多选功能 */
function setupBoxSelection() {
  // 移动端保护：触摸设备或小屏不启用画布框选/多选功能，避免误触发和不友好交互
  if (('ontouchstart' in window && navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)) {
    // 确保隐藏选择矩形（若存在）
    const existing = document.querySelector('#selectionRect');
    if (existing) existing.style.display = 'none';
    // 隐藏批量工具栏
    const batchOps = document.getElementById('batchOperations');
    if (batchOps) batchOps.style.display = 'none';
    return;
  }

  const container = document.getElementById('fullScreenMindmap');
  if (!container) return;

  // 在 jsmind 内部容器内绘制框选矩形，确保坐标与滚动一致
  const inner = container.querySelector('.jsmind-inner') || container;
  // 使容器可聚焦，确保在 iframe 中可接收空格键
  inner.setAttribute('tabindex', '0');
  inner.style.outline = 'none';
  inner.addEventListener('mouseenter', () => { try { inner.focus({ preventScroll: true }); } catch (e) { } });
  inner.addEventListener('mousedown', () => { try { inner.focus({ preventScroll: true }); } catch (e) { } });
  // 节点容器（jsMind 会把节点放在 .jmnodes 下）
  const nodesRoot = container.querySelector('.jmnodes') || inner;

  // 已移除冗余节点分析日志

  // 创建框选矩形元素（若不存在） - 使用视口坐标系，挂到 document.body 避免被缩放层影响
  let rectEl = document.querySelector('#selectionRect');
  if (!rectEl) {
    rectEl = document.createElement('div');
    rectEl.id = 'selectionRect';
    document.body.appendChild(rectEl);
  }

  let isSelecting = false;
  let isSelectingPrimed = false;
  let isPanning = false;
  let isDownOnNode = false;
  let isDraggingNode = false; // 记录是否正在拖拽节点
  let startX = 0, startY = 0;
  let startClientX = 0, startClientY = 0;
  let startScrollLeft = 0, startScrollTop = 0;
  let addMode = false; // 是否叠加选择（Shift/Meta），空格为画布拖拽
  let isSpacePressed = false; // 空格按下时启用画布拖拽

  // 延迟选择/拖拽判定状态
  let pendingSingleSelectId = null; // 如果按下的是已选集合内的节点，则可能在 mouseup 后转为单选
  let movedDuringPress = false; // 在按下后是否发生了足以判定为拖拽的移动

  // 计算内层容器的缩放比例（CSS transform: scale），用于坐标换算
  function getInnerScale() {
    const r = inner.getBoundingClientRect();
    const sxRaw = r.width / (inner.clientWidth || r.width);
    const syRaw = r.height / (inner.clientHeight || r.height);
    const sx = (isFinite(sxRaw) && sxRaw > 0) ? sxRaw : 1;
    const sy = (isFinite(syRaw) && syRaw > 0) ? syRaw : 1;
    return { sx, sy };
  }

  // 监听空格键状态；在输入框/文本域/可编辑内容内按空格不触发拖拽
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
      const t = e.target;
      const isTyping = t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      );
      if (!isTyping) {
        isSpacePressed = true;
        // 阻止页面滚动（空格默认会滚动页面）
        e.preventDefault();
      }
    }
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
      isSpacePressed = false;
    }
  });
  const multiSelected = new Set();

  // 去重和节流控制变量
  let lastMultiSelectedIds = [];
  let isUpdatingHighlight = false;
  let highlightUpdateScheduled = false;

  function updateHighlight() {
    // 去重：检查多选集合是否真正发生变化
    const currentIds = Array.from(multiSelected).sort();
    const hasChanged = JSON.stringify(currentIds) !== JSON.stringify(lastMultiSelectedIds);

    if (!hasChanged && !highlightUpdateScheduled) {
      console.log('⏭️ 多选集合未变化，跳过更新');
      return;
    }

    // 节流：如果正在更新，标记需要再次更新，但不立即执行
    if (isUpdatingHighlight) {
      console.log('⏳ 更新进行中，标记需要再次更新');
      highlightUpdateScheduled = true;
      return;
    }

    // 使用 requestAnimationFrame 进行节流
    isUpdatingHighlight = true;
    requestAnimationFrame(() => {
      performHighlightUpdate();
      lastMultiSelectedIds = currentIds.slice(); // 保存当前状态
      isUpdatingHighlight = false;

      // 如果有排队的更新，执行它
      if (highlightUpdateScheduled) {
        highlightUpdateScheduled = false;
        console.log('🔄 执行排队的更新');
        updateHighlight();
      }
    });
  }

  function performHighlightUpdate() {
    console.log(`🎯 执行高亮更新，选中节点数: ${multiSelected.size}`);

    // 清理高亮：移除之前多选相关类/覆盖层，避免残留
    const prevMulti = document.querySelectorAll('.jmnode.multi-selected');
    prevMulti.forEach(el => el.classList.remove('multi-selected'));
    document.querySelectorAll('.multi-overlay').forEach(ov => ov.remove());

    // 清理残留的单选样式：确保只有当前由 jsMind 选中的节点保留 .selected
    try {
      const currentSelectedId = (window.jm && typeof jm.get_selected_node === 'function') ? jm.get_selected_node() : null;
      // 遍历所有带 selected 类的节点，移除非当前选中的 selected 类
      document.querySelectorAll('.jmnode.selected').forEach(el => {
        const nid = el.getAttribute('nodeid');
        if (!nid || nid !== String(currentSelectedId)) {
          el.classList.remove('selected');
        }
      });
    } catch (e) {
      console.warn('清理 selected 类时出错:', e);
    }

    // 应用多选高亮
    multiSelected.forEach(id => {
      const el = getNodeElement(id);
      if (el) {
        applyMultiSelectStyle(el, id);
      }
    });

    // 更新批量操作工具栏
    updateBatchToolbar();

    // 暴露便捷 API
    exposeMultiSelectAPI();
  }

  // 同步 jsMind 的 selected 状态与 multiSelected 集合到 DOM 样式，消除残留
  function syncSelectionStyles() {
    try {
      const realSelectedNode = (window.jm && typeof jm.get_selected_node === 'function') ? jm.get_selected_node() : null;
      const realSelectedId = realSelectedNode ? (realSelectedNode.id || String(realSelectedNode)) : null;

      // 遍历所有节点，基于 jm 与 multiSelected 决定样式
      const allNodes = document.querySelectorAll('[nodeid], .jmnode');
      allNodes.forEach(el => {
        const nid = el.getAttribute && el.getAttribute('nodeid') ? el.getAttribute('nodeid') : null;
        // 优先处理 multiSelected：保留 multi-selected，不添加单选填充
        if (nid && multiSelected.has(nid)) {
          el.classList.add('multi-selected');
          el.classList.remove('selected');
          // 确保存在 overlay
          if (!el.querySelector(':scope > .multi-overlay')) {
            const ov = document.createElement('div');
            ov.className = 'multi-overlay';
            el.appendChild(ov);
          }
        } else {
          // 非多选节点：移除多选样式
          if (el.classList && el.classList.contains('multi-selected')) el.classList.remove('multi-selected');
          // 单选由 jsMind 决定
          if (nid && String(nid) === String(realSelectedId)) {
            if (el.classList && !el.classList.contains('selected')) el.classList.add('selected');
          } else {
            if (el.classList && el.classList.contains('selected')) el.classList.remove('selected');
          }
          // 移除可能遗留的 overlay
          const ovChild = el.querySelector && el.querySelector(':scope > .multi-overlay');
          if (ovChild) ovChild.remove();
        }
      });
    } catch (e) {
      console.warn('syncSelectionStyles error', e);
    }
  }

  // 获取节点元素的辅助函数
  function getNodeElement(nodeId) {
    let el = document.querySelector(`jmnode[nodeid="${nodeId}"]`) ||
      document.querySelector(`.jmnode[nodeid="${nodeId}"]`) ||
      document.querySelector(`[nodeid="${nodeId}"]`);

    if (el && el.tagName !== 'Jmnode' && !el.classList.contains('jmnode')) {
      el = el.closest('jmnode') || el.closest('.jmnode') || el;
    }
    return el;
  }

  // 应用多选样式的核心函数
  function applyMultiSelectStyle(el, nodeId) {
    el.classList.add('multi-selected');

    // 创建覆盖层 - 确保高亮不被内部子层遮挡
    if (!el.querySelector(':scope > .multi-overlay')) {
      const ov = document.createElement('div');
      ov.className = 'multi-overlay';
      el.appendChild(ov);
    }

    // **关键修复**：确保节点元素本身可见，即使其内部的jmexpander被隐藏
    const computedStyle = window.getComputedStyle(el);
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
      el.classList.add('mw-force-visible');
    }
  }

  // 更新批量操作工具栏
  function updateBatchToolbar() {
    const batchOps = document.getElementById('batchOperations');
    const selectedCount = document.getElementById('selectedCount');
    const count = multiSelected.size;

    if (count > 0) {
      batchOps.style.display = 'inline-block';
      selectedCount.textContent = count;
    } else {
      batchOps.style.display = 'none';
    }
  }

  // 暴露便捷 API
  function exposeMultiSelectAPI() {
    window.getMultiSelection = () => Array.from(multiSelected);
    window.clearMultiSelection = () => {
      multiSelected.clear();
      if (window.jm && typeof jm.select_clear === 'function') {
        try { jm.select_clear(); } catch (err) { }
      }
      updateHighlight();
    };
    window.selectMultipleNodes = (ids) => {
      if (!Array.isArray(ids)) return;
      ids.forEach(id => id && multiSelected.add(id));
      updateHighlight();
    };
  }


  function rectsIntersect(a, b) {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function onMouseDown(e) {
    if (e.button !== 0) return; // 仅左键
    // 若正在编辑或点击到编辑输入，忽略本模块，交给 jsMind 处理
    const tt = e.target;
    if (tt && (tt.tagName === 'INPUT' || tt.tagName === 'TEXTAREA' || tt.isContentEditable || tt.id === 'jsmind-editor' || (tt.closest && (tt.closest('.jsmind-editor') || tt.closest('#jsmind-editor'))))) {
      return;
    }
    // 避免在节点/右侧面板/工具栏上触发框选/拖拽

    // 简化节点检测 - 直接检查目标元素及其父元素
    let nodeElement = null;
    const target = e.target;

    // 方法1: 检查目标元素本身是否有.jmnode类
    if (target.classList && target.classList.contains('jmnode')) {
      nodeElement = target;
    }
    // 方法2: 检查目标元素是否有nodeid属性
    else if (target.hasAttribute && target.hasAttribute('nodeid')) {
      nodeElement = target;
    }
    // 方法3: 检查父元素
    else if (target.closest) {
      nodeElement = target.closest('.jmnode');
      if (!nodeElement) {
        nodeElement = target.closest('[nodeid]');
      }
    }

    isDownOnNode = !!nodeElement;

    // 后备方案：检查鼠标位置是否在节点区域内
    if (!isDownOnNode) {
      const allNodes = document.querySelectorAll('[nodeid]');

      for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i];
        const rect = node.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
          isDownOnNode = true;
          break;
        }
      }
    }

    // 如果点击在空白区域（非节点、非工具栏、非批量操作面板），清除选择
    if (!isDownOnNode && !e.target.closest('#toolbar') && !e.target.closest('#batchOperations')) {
      multiSelected.clear();
      if (window.jm && typeof jm.select_clear === 'function') { try { jm.select_clear(); } catch (err) { } }
      // 隐藏右侧详情面板（当无选中时）
      try { if (typeof hideNodeDetails === 'function') hideNodeDetails(); } catch (e) { }
      // 额外：显式移除所有残留的单选样式，避免样式滞留
      document.querySelectorAll('.jmnode.selected').forEach(el => el.classList.remove('selected'));
      updateHighlight();
    }

    if (isDownOnNode) {
      // 在节点上按下，标记为拖拽状态，禁用框选
      isDraggingNode = true;
      isSelecting = false;
      isSelectingPrimed = false;
      rectEl.style.display = 'none';

      // 计算点击的节点元素与 id（若存在）
      const clickedNodeEl = (e.target && e.target.closest) ? (e.target.closest('.jmnode') || nodeElement) : nodeElement;
      const clickedNodeId = clickedNodeEl ? clickedNodeEl.getAttribute('nodeid') : null;

      // 场景A：点击的是已多选集合内的节点（且没有按 Ctrl/Meta）
      // 这里不要立即启动批量拖拽，而是延后决定：记录 pending 状态与起点坐标，
      // 在 mousemove 超过阈值时再真正启动批量拖拽；在 mouseup 且未移动时再切换为单选。
      if (clickedNodeId && !(e.ctrlKey || e.metaKey) && multiSelected.has(clickedNodeId) && multiSelected.size > 0) {
        // 记录按下坐标以便后续判断是否为拖拽
        startClientX = e.clientX;
        startClientY = e.clientY;
        pendingSingleSelectId = clickedNodeId;
        movedDuringPress = false;
        // 不清空 multiSelected，延后在 mousemove/mouseup 决定
        return;
      }

      // 场景B：点击节点且未按 Ctrl/Meta，但该节点不在 multiSelected 中 —— 进入纯单选（清除多选）
      if (clickedNodeEl && !(e.ctrlKey || e.metaKey)) {
        // 清理多选集合与视觉残留
        multiSelected.clear();
        document.querySelectorAll('.jmnode.multi-selected').forEach(el => el.classList.remove('multi-selected'));
        document.querySelectorAll('.multi-overlay').forEach(ov => ov.remove());

        // 让 jsMind 将该节点设为唯一选中（触发其内部选中逻辑）
        if (clickedNodeId && window.jm && typeof jm.select_node === 'function') {
          try { jm.select_node(clickedNodeId); } catch (err) { /* ignore */ }
          try { syncSelectionStyles(); } catch (e) { /* ignore */ }
        } else if (window.jm && typeof jm.select_clear === 'function') {
          try { jm.select_clear(); } catch (err) { /* ignore */ }
        }

        // 主动清理可能残留的 .selected（除当前外）
        document.querySelectorAll('.jmnode.selected').forEach(el => {
          const nid = el.getAttribute('nodeid');
          if (!nid || (clickedNodeId && String(nid) !== String(clickedNodeId))) {
            el.classList.remove('selected');
          }
        });

        // 更新 UI
        updateHighlight();
        // 继续让 jsMind 处理后续单节点拖拽/交互
        e.preventDefault();
        return;
      }

      // Ctrl/Command 点击切换多选已移除（由设计调整），继续按常规交互处理

      // 批量拖拽模式（兜底）：有框选节点时启动
      if (multiSelected.size > 0) {
        isDraggingNode = true;
        window.__batchDragLocked = true;
        window.__batchDragData = {
          selectedNodes: Array.from(multiSelected),
          dragStartNode: null,
          targetParent: null,
          isBatchDragging: true
        };
        return;
      }

      // 单个节点时，不阻止事件冒泡，让jsMind处理拖拽
      console.log('🎯 单选模式，允许jsMind处理拖拽');
      return;
    }

    if (e.target.closest('#nodeDetails') || e.target.closest('.toolbar')) {
      // 在面板/工具栏上按下，禁止框选
      isSelecting = false;
      isSelectingPrimed = false;
      rectEl.style.display = 'none';

      // **不阻止事件冒泡**，让其他功能正常工作
      return;
    }

    // 空格 + 拖拽 => 画布平移
    if (isSpacePressed) {
      isPanning = true;
      const r = inner.getBoundingClientRect();
      startClientX = e.clientX;
      startClientY = e.clientY;
      startScrollLeft = inner.scrollLeft;
      startScrollTop = inner.scrollTop;
      inner.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // 普通拖拽 => 待判定框选（仅当移动超阈值才真正开始）
    isSelecting = false;
    isSelectingPrimed = true;
    addMode = false;

    // 记录起点的视口(client)坐标，后续全部以 client 坐标系绘制，避免缩放/滚动换算误差
    startClientX = e.clientX;
    startClientY = e.clientY;
    // 兼容性保留逻辑坐标（但不用于碰撞检测）
    startX = startClientX;
    startY = startClientY;

    // 暂不清空，等真正开始框选时再决定是否清空
    Object.assign(rectEl.style, {
      display: 'none',
      left: `${startClientX}px`,
      top: `${startClientY}px`,
      width: '0px',
      height: '0px'
    });

    // 阻止默认选择行为，避免文字选中
    e.preventDefault();
  }

  function onMouseMove(e) {
    // 编辑输入命中时不参与框选/拖拽判定
    const tmm = e.target;
    if (tmm && ((tmm.id === 'jsmind-editor') || (tmm.closest && (tmm.closest('.jsmind-editor') || tmm.closest('#jsmind-editor'))) || tmm.tagName === 'INPUT' || tmm.tagName === 'TEXTAREA' || tmm.isContentEditable)) {
      return;
    }
    // 画布平移模式
    if (isPanning) {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      inner.scrollLeft = startScrollLeft - dx;
      inner.scrollTop = startScrollTop - dy;
      e.preventDefault();
      return;
    }

    // 若存在 pendingSingleSelectId（按下时点击的是已多选节点或可能切换为单选的节点），
    // 在 mousemove 中判断是否超过移动阈值以启动批量拖拽。
    if (pendingSingleSelectId && !movedDuringPress && typeof startClientX === 'number' && typeof startClientY === 'number') {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      const dist2 = dx * dx + dy * dy;
      const threshold = 6; // px 阈值（可调：4-8）
      if (dist2 >= threshold * threshold) {
        movedDuringPress = true;
        // 仅在 pendingSingleSelectId 属于 multiSelected 集合时启动批量拖拽
        if (multiSelected.has(pendingSingleSelectId) && multiSelected.size > 0) {
          isDraggingNode = true;
          window.__batchDragLocked = true;
          window.__batchDragData = {
            selectedNodes: Array.from(multiSelected),
            dragStartNode: pendingSingleSelectId,
            targetParent: null,
            isBatchDragging: true,
            movedNodes: new Set()
          };
          // 隐藏选框并让后续拖拽逻辑处理
          rectEl.style.display = 'none';
        }
      }
    }

    // 如果正在拖拽节点，完全跳过框选逻辑
    if (isDownOnNode || isDraggingNode) {
      // 隐藏框选矩形，但**不阻止**jsMind的事件处理
      rectEl.style.display = 'none';

      // **批量拖拽模式下的目标检测和视觉反馈
      if (window.__batchDragData && window.__batchDragData.isBatchDragging) {
        // 更新目标父节点检测
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        if (targetElement) {
          const targetNode = targetElement.closest('.jmnode');
          if (targetNode) {
            const targetNodeId = targetNode.getAttribute('nodeid');
            // 确保目标节点不在多选集合中，且不是根节点
            if (targetNodeId && !multiSelected.has(targetNodeId) && targetNodeId !== 'root') {
              // 记录目标父节点
              window.__batchDragData.targetParent = targetNodeId;

              // 高亮显示目标父节点
              targetNode.style.outline = '3px dashed #007bff';
              targetNode.style.outlineOffset = '2px';
              targetNode.style.transition = 'outline 0.2s ease';

              // 清除之前的高亮
              if (window._lastTargetNode && window._lastTargetNode !== targetNode) {
                window._lastTargetNode.style.outline = '';
                window._lastTargetNode.style.outlineOffset = '';
              }
              window._lastTargetNode = targetNode;
            }
          }
        }
      } else if (isDraggingNode && multiSelected.size > 0) {
        // 为框选节点添加拖拽时的特殊样式
        multiSelected.forEach(nodeId => {
          const nodeEl = document.querySelector(`[nodeid="${nodeId}"]`);
          if (nodeEl) {
            nodeEl.style.opacity = '0.8';
            nodeEl.style.transform = 'scale(1.1)';
            nodeEl.style.transition = 'all 0.1s ease';
          }
        });
      }

      return;
    }

    // 智能拖拽检测：如果鼠标按下时未检测到节点，但移动时检测到在节点上，则认为是拖拽
    if (!isDownOnNode && !isDraggingNode && isSelectingPrimed) {
      const hoveredNode = document.elementFromPoint(e.clientX, e.clientY);
      if (hoveredNode && (hoveredNode.classList.contains('jmnode') || hoveredNode.closest('.jmnode'))) {
        isDraggingNode = true;
        isSelecting = false;
        isSelectingPrimed = false;
        rectEl.style.display = 'none';
        return;
      }
    }

    if (!isSelecting && !isSelectingPrimed) return;

    // 使用视口(client)坐标系绘制选框，避免 transform/scroll 换算误差
    const curClientX = e.clientX;
    const curClientY = e.clientY;

    const x = Math.min(startClientX, curClientX);
    const y = Math.min(startClientY, curClientY);
    const w = Math.abs(curClientX - startClientX);
    const h = Math.abs(curClientY - startClientY);

    // 移动超过阈值(>4px)才真正开始框选
    if (isSelectingPrimed && !isSelecting) {
      if (w > 4 || h > 4) {
        isSelecting = true;
        isSelectingPrimed = false;
        if (!addMode) multiSelected.clear();
        rectEl.style.display = 'block';
      } else {
        return;
      }
    }

    // 修复：直接使用逻辑坐标，因为inner容器已经应用了transform scale
    // selectionRect作为inner的子元素，会自动继承缩放效果

    // 边界检查：确保矩形不会超出inner容器的逻辑边界
    const maxX = inner.scrollWidth;
    const maxY = inner.scrollHeight;
    const clampedX = Math.max(0, Math.min(x, maxX));
    const clampedY = Math.max(0, Math.min(y, maxY));
    const clampedW = Math.min(w, maxX - clampedX);
    const clampedH = Math.min(h, maxY - clampedY);

    Object.assign(rectEl.style, {
      left: `${clampedX}px`,
      top: `${clampedY}px`,
      width: `${clampedW}px`,
      height: `${clampedH}px`
    });

    // 选框与节点均使用 client(getBoundingClientRect) 坐标系进行相交检测（直接使用视口坐标）
    const selClient = {
      left: x,
      top: y,
      right: x + w,
      bottom: y + h
    };



    // 节点查询
    let nodeElements = [];
    const allNodeElements = document.querySelectorAll('[nodeid]');

    if (allNodeElements.length > 0) {
      nodeElements = Array.from(allNodeElements);
    } else {
      if (nodesRoot) {
        nodeElements = Array.from(nodesRoot.querySelectorAll('.jmnode'));
      }

      if (nodeElements.length === 0) {
        nodeElements = Array.from(document.querySelectorAll('.jmnode'));
      }
    }

    let intersectedCount = 0;
    nodeElements.forEach(el => {
      const nb = el.getBoundingClientRect();
      const intersects = rectsIntersect(selClient, {
        left: nb.left, top: nb.top, right: nb.right, bottom: nb.bottom
      });
      const id = el.getAttribute('nodeid');
      if (!id) return;

      if (intersects) {
        multiSelected.add(id);
        intersectedCount++;
      } else if (!addMode) {
        // 替换模式时，实时移除未命中的节点
        multiSelected.delete(id);
      }
    });

    // 已移除框选统计日志

    updateHighlight();
  }

  function onMouseUp() {
    // 结束画布平移
    if (isPanning) {
      isPanning = false;
      inner.style.cursor = '';
      return;
    }

    // 若处于预备状态但未超过阈值，则取消
    if (isSelectingPrimed && !isSelecting) {
      isSelectingPrimed = false;
      return;
    }

    // 若本次拖拽起点在节点上或正在拖拽节点，则不进行框选
    if (isDownOnNode || isDraggingNode) {
      // 隐藏框选矩形，但**不阻止**jsMind的事件处理
      rectEl.style.display = 'none';

      // 如果存在 pendingSingleSelectId（按下时可能是已多选或将切换为单选），
      // 且在按下后未发生足以判定为拖拽的移动，则认为是单击 -> 切换为单选。
      if (pendingSingleSelectId && !movedDuringPress) {
        // 清除多选视觉与集合
        multiSelected.clear();
        document.querySelectorAll('.jmnode.multi-selected').forEach(el => el.classList.remove('multi-selected'));
        document.querySelectorAll('.multi-overlay').forEach(ov => ov.remove());
        try {
          if (window.jm && typeof jm.select_node === 'function') {
            jm.select_node(pendingSingleSelectId);
            try { syncSelectionStyles(); } catch (e) { /* ignore */ }
          } else if (window.jm && typeof jm.select_clear === 'function') {
            jm.select_clear();
          }
        } catch (err) { /* ignore */ }
        document.querySelectorAll('.jmnode.selected').forEach(el => {
          const nid = el.getAttribute('nodeid');
          if (!nid || String(nid) !== String(pendingSingleSelectId)) {
            el.classList.remove('selected');
          }
        });
        updateHighlight();
      }

      // 清理 pending 标志（无论是否切换）
      pendingSingleSelectId = null;
      movedDuringPress = false;

      // 批量拖拽模式处理
      if (window.__batchDragData && window.__batchDragData.isBatchDragging) {
        // 延迟清理批量拖拽数据
        setTimeout(() => {
          if (window.__batchDragData) {
            if (window.__batchDragData.movedNodes) {
              window.__batchDragData.movedNodes.clear();
            }
            delete window.__batchDragData;
          }
        }, 100);

        // 清除目标节点高亮
        if (window._lastTargetNode) {
          window._lastTargetNode.style.border = '';
          window._lastTargetNode.style.backgroundColor = '';
          delete window._lastTargetNode;
        }

        // 恢复多选节点的原始样式
        multiSelected.forEach(nodeId => {
          const nodeEl = document.querySelector(`[nodeid="${nodeId}"]`);
          if (nodeEl) {
            nodeEl.style.opacity = '';
            nodeEl.style.transform = '';
            nodeEl.style.transition = '';
          }
        });
      } else if (isDraggingNode && multiSelected.size > 0) {
        // 普通多选拖拽结束时的样式恢复（非批量拖拽模式）
        multiSelected.forEach(nodeId => {
          const nodeEl = document.querySelector(`[nodeid="${nodeId}"]`);
          if (nodeEl) {
            nodeEl.style.opacity = '';
            nodeEl.style.transform = '';
            nodeEl.style.transition = '';
          }
        });
      }

      // 清除目标节点高亮
      if (window._lastTargetNode) {
        window._lastTargetNode.style.outline = '';
        window._lastTargetNode.style.outlineOffset = '';
        window._lastTargetNode = null;
      }

      isDownOnNode = false;
      isDraggingNode = false;
      isSelecting = false;
      isSelectingPrimed = false;
      rectEl.style.display = 'none';

      // 清除批量拖拽锁定
      if (window.__batchDragLocked) {
        window.__batchDragLocked = false;
      }

      return;
    }

    if (!isSelecting) return;

    isSelecting = false;
    rectEl.style.display = 'none';
    updateHighlight();
  }

  // 绑定事件到 inner，这样滚动与坐标系一致
  // **不使用捕获阶段**，避免干扰jsMind的事件处理
  inner.addEventListener('mousedown', onMouseDown);
  inner.addEventListener('mousemove', onMouseMove);
  // mouseup 绑定到 window，避免在快速拖动出容器时丢事件
  window.addEventListener('mouseup', onMouseUp);
  // 在编辑输入上阻止事件传播，避免拖拽/框选/双击干扰（捕获阶段，保留默认以保证光标定位）
  const isEditTarget = (t) => !!(t && ((t.id === 'jsmind-editor') || (t.closest && (t.closest('.jsmind-editor') || t.closest('#jsmind-editor'))) || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
  ['mousedown', 'mousemove', 'click', 'dblclick'].forEach(ev => {
    document.addEventListener(ev, function (e) {
      const t = e.target;
      if (isEditTarget(t)) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        // 不要 preventDefault，确保光标与选择正常
      }
    }, true);
  });

  // 添加双击事件监听，用于切换节点选择状态（编辑态下不处理，避免冲突）
  inner.addEventListener('dblclick', function (e) {
    if (document.querySelector('.jsmind-editor') || document.querySelector('#jsmind-editor') || (e.target && (e.target.tagName === 'INPUT' || e.target.isContentEditable || (e.target.closest && (e.target.closest('.jsmind-editor') || e.target.closest('#jsmind-editor')))))) {
      return;
    }
    const clickedNode = e.target.closest('.jmnode');
    if (clickedNode) {
      const nodeId = clickedNode.getAttribute('nodeid');
      if (nodeId) {
        if (multiSelected.has(nodeId)) {
          multiSelected.delete(nodeId);
        } else {
          multiSelected.add(nodeId);
        }
        updateHighlight();
        e.preventDefault();
      }
    }
  });

  // 使用jsMind原生事件系统检测拖拽 - 但避免干扰批量拖拽
  if (window.jsMind && jm) {
    // 监听所有jsMind事件
    jm.add_event_listener(function (type, data) {
      // 拖拽开始事件 - 但避免干扰批量拖拽模式
      if (type === jsMind.event_type.move_node) {
        if (data && data.data && Array.isArray(data.data) && data.data.length >= 3) {
          // 只有在非批量拖拽模式下才设置isDraggingNode
          if (!window.__batchDragData || !window.__batchDragData.isBatchDragging) {
            isDraggingNode = true;
            isSelecting = false;
            isSelectingPrimed = false;
            rectEl.style.display = 'none';
          }
        }
      }

      // 监听拖拽开始事件，在多选模式下阻止jsMind的内置拖拽
      if (type === 'drag_start' || type === jsMind.event_type.drag_start) {
        if (multiSelected && multiSelected.size > 0) {
          // 只有在批量拖拽锁定未激活时才阻止拖拽
          if (!window.__batchDragLocked) {
            return false; // 阻止拖拽
          }
        }
      }

      // 监听节点选择变化（可能表示拖拽结束）
      if (type === jsMind.event_type.select_node || type === jsMind.event_type.select_clear) {
        if (isDraggingNode) {
          setTimeout(() => {
            isDraggingNode = false;
          }, 100);
        }
      }
    });
  } else {
    // 备用拖拽检测机制
    let dragStartTimer = null;

    // 监听mousedown事件，检测是否在节点上
    inner.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.jmnode')) {
        // 如果批量拖拽锁定激活，不触发备用拖拽检测
        if (window.__batchDragLocked) {
          return;
        }
        // 延迟设置拖拽状态，避免误触发
        window._batchDragStartTimer = setTimeout(() => {
          isDraggingNode = true;
          isSelecting = false;
          isSelectingPrimed = false;
          rectEl.style.display = 'none';
        }, 100); // 100ms延迟
      }
    }, true);

    // 监听mouseup事件，重置拖拽状态
    window.addEventListener('mouseup', function () {
      if (window._batchDragStartTimer) {
        clearTimeout(window._batchDragStartTimer);
        window._batchDragStartTimer = null;
      }
      if (isDraggingNode) {
        isDraggingNode = false;
      }
      // 清除批量拖拽锁定
      if (window.__batchDragLocked) {
        window.__batchDragLocked = false;
      }
    });

    // 监听mousemove事件，如果在节点上移动且按下了鼠标，认为是拖拽
    inner.addEventListener('mousemove', function (e) {
      if (e.buttons === 1 && e.target && e.target.closest && e.target.closest('.jmnode')) {
        // 如果批量拖拽锁定激活，不触发备用拖拽检测
        if (window.__batchDragLocked) {
          return;
        }
        if (!isDraggingNode) {
          isDraggingNode = true;
          isSelecting = false;
          isSelectingPrimed = false;
          rectEl.style.display = 'none';
        }
      }
    }, true);
  }

  // 批量删除（Delete/Backspace）已多选的节点（捕获阶段优先于内置删除）
  document.addEventListener('keydown', (e) => {
    const key = e.key || '';
    if ((key === 'Delete' || key === 'Backspace') && typeof window.getMultiSelection === 'function') {
      const ids = window.getMultiSelection();
      try {
        // 记录最近删除的节点ID（过滤 root），供撤销后优先选中
        window.__mw_lastDeletedIds = Array.isArray(ids) ? ids.filter(id => id && id !== 'root').slice() : [];
      } catch (e) { }
      if (Array.isArray(ids) && ids.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        // 保存视口以便删除后恢复位置
        try { saveViewport(); } catch (e) { }
        ids.filter(id => id && id !== 'root').forEach(id => {
          try { jm.remove_node(id); } catch (err) { }
        });
        if (typeof window.clearMultiSelection === 'function') window.clearMultiSelection();
        if (typeof debouncedSave === 'function') debouncedSave();
        // 延迟恢复视口，等DOM与jsMind重建完成
        setTimeout(function () { try { restoreViewport(); } catch (e) { } }, 160);
      }
    }
  }, true);

  // 批量删除函数（供按钮调用）
  window.batchDelete = function () {
    const ids = window.getMultiSelection();
    if (!Array.isArray(ids) || ids.length === 0) {
      showWarning('请先选择要删除的节点');
      return;
    }

    if (!confirm(`确定要删除选中的 ${ids.length} 个节点吗？`)) return;

    let deletedCount = 0;
    ids.filter(id => id && id !== 'root').forEach(id => {
      try {
        jm.remove_node(id);
        deletedCount++;
      } catch (err) {
        console.warn(`删除节点 ${id} 失败:`, err);
      }
    });

    if (typeof window.clearMultiSelection === 'function') window.clearMultiSelection();
    if (typeof debouncedSave === 'function') debouncedSave();

    showSuccess(`成功删除 ${deletedCount} 个节点`);
  };

  // 批量移动函数已删除 - 现在使用拖拽批量移动
}

/* 更可靠的 exportData：在页面内显示模态面板，避免弹窗被拦截或依赖 jQuery */
window.exportData = function exportData() {
  if (!jm) {
    console.warn('[MW] exportData: jm 未初始化');
    showWarning && showWarning('思维导图未准备好，请稍后重试');
    return;
  }
  try {
    const data = jm.get_data();
    const jsonText = JSON.stringify(data, null, 2);

    // 创建模态容器（幂等）
    if (!document.getElementById('jsonModal')) {
      const modal = document.createElement('div');
      modal.id = 'jsonModal';
      modal.style.position = 'fixed';
      modal.style.left = '0';
      modal.style.top = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.background = 'rgba(0,0,0,0.5)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = 99999;
      modal.innerHTML = `
        <div style="background:#fff;max-width:90%;max-height:90%;width:900px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:12px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;">
            <strong>Mindmap JSON</strong>
            <div style="display:flex;gap:8px;align-items:center;">
              <button id="jsonCopyBtn" class="btn" style="padding:6px 8px;">复制</button>
              <button id="jsonCloseBtn" class="btn" style="padding:6px 8px;">关闭</button>
            </div>
          </div>
          <div style="padding:12px;overflow:auto;background:#f8fafc;flex:1;">
            <pre id="jsonPreview" style="white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.4;color:#111;"></pre>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      // 绑定事件
      document.getElementById('jsonCloseBtn').addEventListener('click', function () {
        const m = document.getElementById('jsonModal');
        if (m) m.style.display = 'none';
      });
      document.getElementById('jsonCopyBtn').addEventListener('click', function () {
        const pre = document.getElementById('jsonPreview');
        if (!pre) return;
        const text = pre.textContent || pre.innerText || '';
        navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text).then(function () {
          showSuccess && showSuccess('已复制到剪贴板');
        }).catch(function () {
          showWarning && showWarning('复制失败，请手动复制');
        }) : (function () {
          // 兜底：创建 textarea 复制
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand('copy');
            showSuccess && showSuccess('已复制到剪贴板');
          } catch (e) {
            showWarning && showWarning('复制失败，请手动复制');
          } finally {
            ta.remove();
          }
        })();
      });
    }

    const pre = document.getElementById('jsonPreview');
    if (pre) pre.textContent = jsonText;

    // 显示模态
    const modal = document.getElementById('jsonModal');
    if (modal) modal.style.display = 'flex';
  } catch (e) {
    console.error('[MW] exportData 失败', e);
    showError && showError('查看JSON失败: ' + (e && e.message ? e.message : String(e)));
  }
};

// 提示信息代理：根据编辑模式决定呈现方式
// 编辑状态标志（当用户在输入时设为 true，会抑制全局 toast）
window.__mw_suppress_toasts_when_editing = window.__mw_suppress_toasts_when_editing || false;
// API：设置编辑模式（true=编辑中，false=非编辑）
window.MW_setEditingMode = function (isEditing) {
  try {
    window.__mw_suppress_toasts_when_editing = !!isEditing;
    try { console.log('[MW] 编辑模式 ->', !!isEditing); } catch (e) { }
    // 同步到父页面/其他框架，通知全局通知桥抑制或恢复提示
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'mw_editing_mode', editing: !!isEditing }, '*'); } catch (e) { }
  } catch (e) { }
  return window.__mw_suppress_toasts_when_editing;
};

// 内联最弱提示（保留，供场景使用）
window.showInlineTinyHint = window.showInlineTinyHint || function (targetEl, text, opts) {
  try {
    opts = opts || {};
    var duration = typeof opts.duration === 'number' ? opts.duration : 1200;
    var container = document.body;
    if (!targetEl || !(targetEl instanceof Element)) {
      var fallback = document.getElementById('mw-inline-tiny-hint-fallback');
      if (!fallback) {
        fallback = document.createElement('div');
        fallback.id = 'mw-inline-tiny-hint-fallback';
        fallback.style.position = 'fixed';
        fallback.style.right = '12px';
        fallback.style.top = '12px';
        fallback.style.zIndex = 9999;
        container.appendChild(fallback);
      }
      fallback.innerHTML = '';
      var wrapF = document.createElement('div');
      wrapF.style.fontSize = '12px';
      wrapF.style.color = '#333';
      wrapF.style.opacity = '0.95';
      wrapF.style.pointerEvents = 'none';
      wrapF.textContent = text || '';
      fallback.appendChild(wrapF);
      setTimeout(function () { try { fallback.innerHTML = ''; } catch (e) { } }, duration);
      return;
    }

    var id = 'mw-inline-tiny-hint-' + Math.random().toString(36).slice(2, 9);
    var el = document.createElement('div');
    el.id = id;
    el.className = 'mw-inline-tiny-hint';
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.zIndex = 9999;
    el.style.fontSize = '12px';
    el.style.color = '#1f2937';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '6px';
    el.style.opacity = '0';
    el.style.transition = 'opacity 140ms ease, transform 180ms ease';
    var dot = document.createElement('span');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.background = '#10b981';
    dot.style.display = 'inline-block';
    dot.style.boxShadow = '0 0 6px rgba(16,185,129,0.12)';
    var txt = document.createElement('span');
    txt.textContent = text || '';
    txt.style.lineHeight = '1';
    txt.style.whiteSpace = 'nowrap';
    el.appendChild(dot);
    el.appendChild(txt);
    container.appendChild(el);

    var rect = targetEl.getBoundingClientRect();
    var top = rect.top + window.scrollY;
    var left = rect.left + window.scrollX;
    var x = left + rect.width - 4;
    var y = top - 6;
    var elRectEstimateWidth = Math.max(80, (String(text || '').length * 8) + 32);
    if (x + elRectEstimateWidth > window.scrollX + window.innerWidth) {
      x = window.scrollX + window.innerWidth - elRectEstimateWidth - 12;
    }
    if (y < window.scrollY + 4) {
      y = top + 4;
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(function () {
      try {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-6px)';
        setTimeout(function () { try { el.remove(); } catch (e) { } }, 200);
      } catch (e) { }
    }, duration);
  } catch (e) {
    try { console.warn('showInlineTinyHint error', e); } catch (e) { }
  }
};

// show* 代理：在编辑时抑制全局通知，优先使用内联提示或 console；非编辑时保留全局通知（若 NotificationBridge 可用）
function _mw_deliverNotification(msg, type, targetEl) {
  try {
    var isEditing = !!window.__mw_suppress_toasts_when_editing;
    // 编辑中：使用最弱内联提示（若传入目标元素），否则只 log
    if (isEditing) {
      try {
        if (targetEl && window.showInlineTinyHint) {
          window.showInlineTinyHint(targetEl, msg, { duration: 900 });
          return;
        }
      } catch (e) { /* ignore */ }
      try { if (type === 'error') console.error('[MW]' + msg); else console.log('[MW]' + msg); } catch (e) { }
      return;
    }
    // 非编辑：优先使用 NotificationBridge / 原有弹窗逻辑；若不可用则降级到 console
    if (window.NotificationBridge && typeof window.NotificationBridge.show === 'function') {
      try { window.NotificationBridge.show(msg, type === 'error' ? 'danger' : 'success', 3000); return; } catch (e) { }
    }
    // 最后降级：console
    try { if (type === 'error') console.error('[MW]' + msg); else console.log('[MW]' + msg); } catch (e) { }
  } catch (e) { try { console.log('[MW deliver error]', e); } catch (e) { } }
}

function showWarning(msg, targetEl) { _mw_deliverNotification(msg, 'warning', targetEl); }
function showError(msg, targetEl) { _mw_deliverNotification(msg, 'error', targetEl); }
function showSuccess(msg, targetEl) { _mw_deliverNotification(msg, 'success', targetEl); }
function showInfo(msg, targetEl) { _mw_deliverNotification(msg, 'info', targetEl); }

// 获取默认NodeTree
function getDefaultNodeTree() {
  return {
    "meta": {
      "name": "jsMind remote",
      "author": "mindword",
      "version": "1.0.0"
    },
    "format": "node_tree",
    "data": {
      "id": "root",
      "topic": "欢迎使用思维导图",
      "children": [
        {
          "id": "sub1",
          "topic": "点击节点编辑",
          "direction": "right",
          "children": [
            {
              "id": "sub1_1",
              "topic": "双击编辑文本",
              "data": {
                "notes": "双击节点可以编辑文本内容"
              }
            },
            {
              "id": "sub1_2",
              "topic": "拖拽调整位置",
              "data": {
                "notes": "拖拽节点可以调整位置和层级关系"
              }
            }
          ]
        },
        {
          "id": "sub2",
          "topic": "右侧编辑详情",
          "direction": "right",
          "data": {
            "notes": "在右侧面板可以编辑节点的详细信息"
          }
        }
      ]
    }
  };
}

// 保存当前数据到localStorage
function saveToLocalStorage() {
  if (!jm) return;

  // 如果处于过滤视图（只看标题），需要把过滤视图中的变更合并回原始快照再保存
  try {
    if (window.__mw_filteredViewActive && window.__mw_originalNodeTreeSnapshot) {
      try {
        console.log('[MW] saveToLocalStorage: 过滤视图下合并变更回原始快照');
        // build index for original snapshot
        var orig = window.__mw_originalNodeTreeSnapshot;
        var idMap = Object.create(null);
        (function buildIndex(node) {
          if (!node) return;
          idMap[node.id] = node;
          if (node.children && node.children.length) {
            node.children.forEach(buildIndex);
          }
        })(orig.data);

        // take current filtered view data and walk to apply changes to original by id
        var filtered = jm.get_data();
        (function applyChanges(node) {
          if (!node) return;
          var target = idMap[node.id];
          if (target) {
            // copy editable fields
            try { target.topic = node.topic; } catch (e) { }
            try { target.notes = node.notes || (target.notes || ''); } catch (e) { }
            try {
              if (node.data) {
                // merge a few common fields
                target.data = target.data || {};
                if (typeof node.data.type !== 'undefined') target.data.type = node.data.type;
                if (typeof node.data.level !== 'undefined') target.data.level = node.data.level;
                if (typeof node.data.ordered !== 'undefined') target.data.ordered = node.data.ordered;
                if (typeof node.data.marker !== 'undefined') target.data.marker = node.data.marker;
              }
            } catch (e) { }
          }
          // recurse children
          if (node.children && node.children.length) {
            node.children.forEach(applyChanges);
          }
        })(filtered.data);

        // NOTE: moves (parent changes) in filtered view are complex: we attempt a best-effort - if an id exists
        // under a different parent in filtered view, we will relocate the original node accordingly.
        try {
          // build parent map from filtered view
          var filteredParent = Object.create(null);
          (function buildParentMap(n, parent) {
            if (!n) return;
            filteredParent[n.id] = parent ? parent.id : null;
            if (n.children && n.children.length) n.children.forEach(ch => buildParentMap(ch, n));
          })(filtered.data, null);

          // relocate nodes in orig to match filtered parent relationships (only if both nodes exist in orig)
          Object.keys(filteredParent).forEach(function (nid) {
            var newPid = filteredParent[nid];
            var origNode = idMap[nid];
            if (!origNode) return;
            var currentParentId = origNode.parent && origNode.parent.id ? origNode.parent.id : null;
            if (String(currentParentId) !== String(newPid)) {
              // remove from current parent children
              try {
                if (currentParentId && idMap[currentParentId] && idMap[currentParentId].children) {
                  idMap[currentParentId].children = (idMap[currentParentId].children || []).filter(c => !(c && c.id === nid));
                }
              } catch (e) { }
              // add to new parent children (append)
              try {
                if (newPid && idMap[newPid]) {
                  idMap[newPid].children = idMap[newPid].children || [];
                  // prevent duplicates
                  if (!idMap[newPid].children.find(c => c && c.id === nid)) {
                    idMap[newPid].children.push(origNode);
                  }
                  // update parent pointer
                  origNode.parent = { id: newPid };
                } else if (!newPid) {
                  // moving to root
                  if (orig.data && orig.data.id === 'root' && orig.data.children) {
                    // noop
                  } else {
                    try {
                      orig.data.children = orig.data.children || [];
                      if (!orig.data.children.find(c => c && c.id === nid)) {
                        orig.data.children.push(origNode);
                        origNode.parent = { id: orig.data.id || 'root' };
                      }
                    } catch (e) { }
                  }
                }
              } catch (e) { }
            }
          });
        } catch (e) {
          console.warn('[MW] saveToLocalStorage: 合并 parent 关系时出错', e);
        }

        // final data to persist is the modified orig snapshot
        var mergedData = orig;
        var mergedDataString = JSON.stringify(mergedData);
        lastStorageData = mergedDataString;
        window.__mindmapSuppressCount = (window.__mindmapSuppressCount || 0) + 1;
        localStorage.setItem('mindword_nodetree_data', mergedDataString);

        // continue with existing syncAll logic using mergedData
        try {
          if (typeof syncAll === 'function') {
            if (!window.converter) {
              console.log('正在加载转换器...');
              import('../converter/converter.js')
                .then(module => {
                  window.converter = new module.ConverterManager();
                  console.log('转换器已加载');
                  if (typeof syncAll === 'function') {
                    window.__mindmapSelfUpdateUntil = Date.now() + 1500;
                    window.__mindmapSuppressCount = (window.__mindmapSuppressCount || 0) + 1;
                    syncAll('mindmap', true, true, mergedData);
                  }
                })
                .catch(error => {
                  console.warn('转换器加载失败，使用降级模式:', error);
                  localStorage.setItem('mindword_nodetree_data', mergedDataString);
                });
            } else {
              if (typeof syncAll === 'function') {
                window.__mindmapSelfUpdateUntil = Date.now() + 1500;
                window.__mindmapSuppressCount = (window.__mindmapSuppressCount || 0) + 1;
                syncAll('mindmap', true, true, mergedData);
              }
            }
          } else {
            console.log('syncAll函数不存在，保存到localStorage');
            localStorage.setItem('mindword_nodetree_data', mergedDataString);
          }

          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'mindmapUpdated',
              data: mergedData
            }, '*');
          }
        } catch (error) {
          console.warn('同步方法调用失败:', error);
          localStorage.setItem('mindword_nodetree_data', mergedDataString);
        }

        return;
      } catch (e) {
        console.warn('[MW] saveToLocalStorage: 过滤视图合并失败，退回普通保存', e);
        // fallthrough to normal save flow
      }
    }
  } catch (e) { console.warn('[MW] saveToLocalStorage merge check error', e); }

  const currentData = jm.get_data();
  const dataString = JSON.stringify(currentData);

  // 避免触发本地监听器（防止循环加载）
  lastStorageData = dataString;
  // 标记抑制：本页即将写入 nodetree，一次自发写入
  window.__mindmapSuppressCount = (window.__mindmapSuppressCount || 0) + 1;
  localStorage.setItem('mindword_nodetree_data', dataString);
  // 同步数据到各個系统
  try {
    // 1. 优先使用syncAll函数（如果存在）
    if (typeof syncAll === 'function') {
      // 动态加载转换器（如果需要）
      if (!window.converter) {
        console.log('正在加载转换器...');
        import('../converter/converter.js')
          .then(module => {
            window.converter = new module.ConverterManager();
            console.log('转换器已加载');
            // 转换器就绪后，统一从思维导图源同步并写三份缓存
            if (typeof syncAll === 'function') {
              window.__mindmapSelfUpdateUntil = Date.now() + 1500;
              // 标记抑制：syncAll 执行过程中可能再次写入 nodetree
              window.__mindmapSuppressCount = (window.__mindmapSuppressCount || 0) + 1;
              syncAll('mindmap', true, true, currentData);
            }
          })
          .catch(error => {
            console.warn('转换器加载失败，使用降级模式:', error);
            // 降级处理：直接保存到localStorage
            localStorage.setItem('mindword_nodetree_data', JSON.stringify(currentData));
          });
      } else {
        // 转换器已存在，直接调用：从思维导图源同步并写三份缓存
        if (typeof syncAll === 'function') {
          window.__mindmapSelfUpdateUntil = Date.now() + 1500;
          // 标记抑制：syncAll 执行过程中可能再次写入 nodetree
          window.__mindmapSuppressCount = (window.__mindmapSuppressCount || 0) + 1;
          syncAll('mindmap', true, true, currentData);
        }
      }
    } else {
      // 2. 降级处理：保存到localStorage
      console.log('syncAll函数不存在，保存到localStorage');
      localStorage.setItem('mindword_nodetree_data', JSON.stringify(currentData));
    }
    // 同步到父页面
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'mindmapUpdated',
        data: currentData
      }, '*');
    }
  } catch (error) {
    console.warn('同步方法调用失败:', error);
    // 最终降级处理
    localStorage.setItem('mindword_nodetree_data', JSON.stringify(currentData));
  }
}

// 防抖保存
let saveTimer = null;
function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveToLocalStorage();
    try {
      if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
        window.undoManager.recordIfChanged();
      }
    } catch (e) {
      // 忽略记录错误
    }
  }, 300);
}

// 类型对齐辅助函数：读取/写入节点类型（优先根级别，兼容 data.type）
function getNodeType(n) {
  if (!n) return undefined;

  if (typeof n.type !== 'undefined') {
    return n.type;
  } else if (n.data && typeof n.data.type !== 'undefined') {
    return n.data.type;
  } else if (n.data && n.data.data && typeof n.data.data.type !== 'undefined') {
    return n.data.data.type;
  }
  return undefined;
}
function setNodeType(n, t) {
  if (!n) return;
  n.type = t;
  if (n.data) {
    if (n.data.data) {
      n.data.data.type = t;
    } else {
      n.data.type = t;
    }
  }
}

// 设置节点层级（标题类型专用）
function setNodeLevel(n, level) {
  if (!n || level < 1 || level > 6) return;
  n.level = level;
  if (n.data) {
    if (n.data.data) {
      n.data.data.level = level;
    } else {
      n.data.level = level;
    }
  }
}
// 读取节点层级（兼容根级和 data.level）
function getNodeLevel(n) {
  if (!n) return null;
  if (typeof n.level !== 'undefined') return n.level;
  if (n.data && typeof n.data.level !== 'undefined') return n.data.level;
  if (n.data && n.data.data && typeof n.data.data.level !== 'undefined') return n.data.data.level;

  // Fallback 1：如果节点topic是数字，尝试解析为层级
  if (n.topic && /^\d+$/.test(n.topic.trim())) {
    const topicLevel = parseInt(n.topic.trim());
    if (topicLevel >= 0 && topicLevel <= 6) {
      return topicLevel;
    }
  }

  // Fallback 2：基于节点在父节点中的位置估算层级
  if (n.parent) {
    const parent = jm.get_node(n.parent.id);
    if (parent && parent.children && parent.children.length > 0) {
      // 计算节点在兄弟节点中的位置
      const siblingIndex = parent.children.findIndex(child => child && child.id === n.id);
      if (siblingIndex >= 0) {
        // 简单的启发式：如果父节点有明确的层级，子节点应该比父节点低一级
        const parentLevel = getNodeLevel(parent);
        if (parentLevel !== null && parentLevel >= 1 && parentLevel < 6) {
          const estimatedLevel = parentLevel + 1;
          return estimatedLevel;
        }
      }
    }
  }

  return null;
}

// 将节点强制设为列表类型，并尽量继承列表标识
function forceListType(n, inheritFrom) {
  if (!n) return;
  const oldType = getNodeType(n);
  let ordered = false;
  let marker = '-';
  if (inheritFrom) {
    const inhData = inheritFrom.data || {};
    ordered = (inhData.ordered != null) ? inhData.ordered : (inheritFrom.ordered != null ? inheritFrom.ordered : false);
    marker = (inhData.marker != null) ? inhData.marker : (inheritFrom.marker != null ? inheritFrom.marker : (ordered ? '1.' : '-'));
  }
  n.type = 'list';
  n.ordered = ordered;
  n.marker = marker;
  if (!n.data) n.data = {};

  // 修复：处理 jsMind 的数据结构变化
  if (n.data.data) {
    // 如果存在嵌套的 data 结构
    n.data.data.type = 'list';
    n.data.data.ordered = ordered;
    n.data.data.marker = marker;
  } else {
    // 传统的数据结构
    n.data.type = 'list';
    n.data.ordered = ordered;
    n.data.marker = marker;
  }

  delete n.level;
  if (n.data) {
    if (n.data.data) {
      delete n.data.data.level;
    } else {
      delete n.data.level;
    }
  }
}

// 将某节点及其全部子孙归一为列表（用于被挂载到列表父节点之下）
function normalizeSubtreeUnderList(rootId, parentNodeForInherit) {
  if (!jm) return;
  const root = jm.get_node(rootId);
  if (!root) return;

  const inheritFrom = parentNodeForInherit || (root.parent ? jm.get_node(root.parent.id) : null);

  const stack = [root];

  while (stack.length > 0) {
    const cur = stack.pop();
    forceListType(cur, inheritFrom);

    if (cur.children && cur.children.length) {
      for (const ch of cur.children) {
        if (ch) stack.push(ch);
      }
    }
  }
}



// 递归调整子节点的标题层级
function adjustChildrenHeadingLevel(node, parentLevel) {
  if (!node || !node.children || node.children.length === 0) return;

  node.children.forEach(child => {
    const childType = getNodeType(child);
    if (childType === 'heading') {
      const childLevel = getNodeLevel(child);
      // 确保子节点的层级比父节点大1
      const expectedLevel = parentLevel + 1;
      if (childLevel !== expectedLevel) {
        setNodeLevel(child, expectedLevel);
      }
    }
    // 递归处理子节点的子节点
    adjustChildrenHeadingLevel(child, getNodeLevel(child) || parentLevel + 1);
  });
}

// 根据同级（若有）或父节点（若无同级）对齐当前节点类型
function applySiblingOrParentType(nodeOrId, parentNode) {
  if (!jm) return;
  let node = null;
  if (nodeOrId && typeof nodeOrId === 'object' && nodeOrId.id) {
    node = nodeOrId;
  } else {
    node = jm.get_node(nodeOrId);
  }
  if (!node) return;

  // 收集同级（排除自己）
  let siblings = [];
  if (node.parent) {
    const parentNode = jm.get_node(node.parent.id);
    if (parentNode && parentNode.children && parentNode.children.length > 0) {
      siblings = parentNode.children.filter(c => c && c.id !== node.id);
    }
  }

  // 参考类型：优先同级的第一个有类型的节点，否则父节点类型
  let refType;
  let refLevel;

  if (siblings.length > 0) {
    for (const s of siblings) {
      const t = getNodeType(s);
      if (typeof t !== 'undefined') {
        refType = t;
        refLevel = getNodeLevel(s);
        break;
      }
    }
  }

  if (typeof refType === 'undefined' && siblings.length === 0 && node.parent) {
    const p = jm.get_node(node.parent.id);
    const pType = getNodeType(p);
    const pLevel = getNodeLevel(p) || 0;

    if (pType === undefined) {
      refType = 'list';
    } else {
      refType = (pType === 'heading' && pLevel >= 6) ? 'list' : pType;

      if (refType === 'heading') {
        if (pLevel >= 1) {
          refLevel = pLevel + 1;
        } else {
          if (p.topic && /^\d+$/.test(p.topic.trim())) {
            const parentTopicLevel = parseInt(p.topic.trim());
            if (parentTopicLevel >= 0 && parentTopicLevel < 6) {
              refLevel = parentTopicLevel + 1;
            } else {
              refLevel = 2;
            }
          } else {
            refLevel = 2;
          }
        }
      }
    }
  }

  if (typeof refType === 'undefined') return; // 没有可参考类型则不改
  const curType = getNodeType(node);
  const curLevel = getNodeLevel(node);

  if (curType !== refType) {
    setNodeType(node, refType);

    // 如果是标题类型且有参考层级，设置合适的层级
    if (refType === 'heading' && typeof refLevel !== 'undefined' && refLevel > 0) {
      setNodeLevel(node, refLevel);
      // 递归调整子节点的层级
      adjustChildrenHeadingLevel(node, refLevel);
    } else if (refType === 'list') {
      // 如果变为列表类型，将所有子节点也转换为列表类型
      normalizeSubtreeUnderList(node.id, node.parent ? jm.get_node(node.parent.id) : null);
    }

    // 类型变化后触发一次轻量保存（不额外调用全量同步）
    debouncedSave();
  } else if (refType === 'heading' && typeof refLevel !== 'undefined' && curLevel !== refLevel) {
    // 类型相同但层级不同，调整层级
    setNodeLevel(node, refLevel);
    // 递归调整子节点的层级
    adjustChildrenHeadingLevel(node, refLevel);
    debouncedSave();
  }
}

// 设置思维导图变化监听器
function setupMindmapChangeWatcher() {
  if (!jm) return;

  // 监听jsMind的各种变化事件
  jm.add_event_listener(function (type, data) {
    // 只在特定事件类型时触发保存
    const saveEvents = [
      jsMind.event_type.edit,
      jsMind.event_type.add_node,
      jsMind.event_type.remove_node,
      jsMind.event_type.move_node,
      jsMind.event_type.move
    ];

    if (saveEvents.includes(type)) {
      // 专门处理 move_node：用事件返回的 [nodeId, beforeId, parentId, direction] 先强制重挂载，再归一/保存
      try {
        if (type === jsMind.event_type.move_node && data && Array.isArray(data.data) && data.data.length >= 3) {
          const movedId = data.data[0];
          const beforeId = data.data.length > 1 ? data.data[1] : null;
          const newParentId = data.data[2];
          const direction = data.data.length > 3 ? data.data[3] : null;

          console.log(`move_node事件数据:`, data);
          console.log(`解析结果 - movedId: ${movedId}, beforeId: ${beforeId}, newParentId: ${newParentId}, direction: ${direction}`);

          // 批量跟随移动：如果存在多选并且当前移动的是多选集合中的一个，则把其余选中节点也移动到相同的新父节点，依次跟在 movedId 之后
          try {
            // 检查是否是批量拖拽模式
            // 批量移动逻辑（通过move_node事件监听器实现）
            if (!window.__batchMoving && typeof window.getMultiSelection === 'function') {
              const selectedIds = window.getMultiSelection();

              if (Array.isArray(selectedIds) && selectedIds.length > 1 && selectedIds.includes(movedId)) {
                window.__batchMoving = true;

                // 将其他选中节点依次移动到相同位置
                let anchorId = movedId;
                let movedCount = 0;
                for (const sid of selectedIds) {
                  if (!sid || sid === movedId) continue;
                  try {
                    jm.move_node(sid, anchorId, newParentId, direction);
                    anchorId = sid;
                    movedCount++;
                  } catch (eMoveBatch) {
                    console.warn(`批量移动节点失败:`, eMoveBatch);
                  }
                }

                if (movedCount > 0) {
                  showSuccess(`成功批量移动 ${selectedIds.length} 个节点`);
                }
              }
            }
          } finally {
            // 短暂延迟后解除批量标记，允许后续正常 move 事件
            setTimeout(() => { window.__batchMoving = false; }, 0);
          }

          // 1) 强制重挂载（确保结构真的变化）
          try {
            jm.move_node(movedId, beforeId, newParentId, direction);
          } catch (eMove) {
            // 忽略重挂载错误
          }

          // 2) 延后一帧读取最新节点与父节点，做类型对齐与列表归一，再保存
          setTimeout(() => {
            try {
              const fresh = jm.get_node(movedId);
              const parentNode = jm.get_node(newParentId);

              if (fresh) {
                // 如果父节点是 heading 且有明确层级，优先强制设置 moved 节点为 parentLevel+1（修复拖拽到四级标题下未更新的问题）
                try {
                  const parentLevel = parentNode ? getNodeLevel(parentNode) : null;
                  const parentType = parentNode ? getNodeType(parentNode) : undefined;
                  if (parentNode && parentType === 'heading' && parentLevel != null) {
                    // 限制最大为6
                    const newLevel = Math.min(6, parentLevel + 1);
                    setNodeLevel(fresh, newLevel);
                    // 递归调整其子孙
                    adjustChildrenHeadingLevel(fresh, getNodeLevel(fresh) || newLevel);
                  }
                } catch (eForceLevel) {
                  console.warn('[MW] 强制设置移动节点层级失败', eForceLevel);
                }

                applySiblingOrParentType(fresh, parentNode);

                // 递归处理所有子节点的层级（如果未在上面处理过）
                if (fresh.children && fresh.children.length > 0) {
                  const freshLevel = getNodeLevel(fresh) || 1;
                  adjustChildrenHeadingLevel(fresh, freshLevel);
                }

                if (parentNode && typeof getNodeType === 'function') {
                  const parentType = getNodeType(parentNode);
                  // 检查父节点是否为列表类型，或者看起来像是列表（有列表特征）
                  const hasListFeatures = parentNode.data && (parentNode.data.listMarker || parentNode.data.marker || parentNode.data.listLevel !== undefined);

                  if (parentType === 'list' || (parentType === undefined && hasListFeatures)) {
                    normalizeSubtreeUnderList(movedId, parentNode);
                  }
                }
              }

              debouncedSave();
            } catch (eLater) {
              console.warn('move_node 延后处理失败:', eLater);
            }
          }, 0);
        }
      } catch (e0) {
        console.warn('基于返回ID处理 move_node 失败:', e0);
      }

      // 尝试获取受影响节点对象（兼容多种事件数据形态）
      let node = null;
      try {
        // 1) 常见：data.node 可能是对象或 id
        let maybe = data && (data.node != null ? data.node : null);
        // 2) move 事件有时直接把节点对象放在 data 上
        if (!maybe && data && typeof data === 'object' && data.id) {
          maybe = data;
        }
        // 3) 如果 maybe 是 id 字符串
        if (maybe && typeof maybe === 'string') {
          node = jm.get_node(maybe);
        } else if (maybe && typeof maybe === 'object' && maybe.id) {
          node = maybe;
        }
        // 4) 兜底：用当前选中节点
        if (!node) {
          const sel = jm.get_selected_node && jm.get_selected_node();
          if (sel) {
            node = typeof sel === 'string' ? jm.get_node(sel) : sel;
          }
        }
      } catch (e) {
        console.warn('事件数据中无法解析节点:', e);
      }

      // 类型对齐：延后到下一轮事件循环，确保jsMind已更新父子关系
      if (node) {
        setTimeout(() => {
          try {
            const fresh = jm.get_node(node.id);
            if (!fresh) return;

            // 获取父节点
            const parentNode = fresh.parent ? jm.get_node(fresh.parent.id) : null;
            applySiblingOrParentType(fresh, parentNode);

            // 递归处理所有子节点的层级
            if (fresh.children && fresh.children.length > 0) {
              const freshLevel = getNodeLevel(fresh) || 1;
              adjustChildrenHeadingLevel(fresh, freshLevel);
            }

            // 若父为列表，则将自己与子孙全部归一为列表（兜底，防止未走API包装）
            try {
              const p = fresh.parent ? jm.get_node(fresh.parent.id) : null;
              if (p && typeof getNodeType === 'function' && getNodeType(p) === 'list') {
                normalizeSubtreeUnderList(fresh.id, p);
              }
            } catch (e2) {
              // 忽略归一化错误
            }

            debouncedSave();
          } catch (e3) {
            console.warn('延后处理失败:', e3);
          }
        }, 0);
      }
    }
  });
}


// 监听localStorage变化（包括同一页面内的修改）
let lastStorageData = null;
let storageCheckTimer = null;
let lastChangeTime = 0;

// 检查localStorage数据是否变化的函数（带防抖）
function checkLocalStorageChange() {
  const now = Date.now();
  if (window.__mindmapSelfUpdateUntil && now < window.__mindmapSelfUpdateUntil) {
    return;
  }

  let currentData;
  try {
    currentData = localStorage.getItem('mindword_nodetree_data');
  } catch (e) {
    return;
  }

  // 若为本页自发写入，消费一次抑制计数并跳过刷新
  if (window.__mindmapSuppressCount && window.__mindmapSuppressCount > 0) {
    window.__mindmapSuppressCount--;
    lastStorageData = currentData;
    return;
  }

  if (currentData !== lastStorageData) {
    lastStorageData = currentData;
    lastChangeTime = now;

    // 防抖处理：延迟500ms执行，避免频繁刷新
    clearTimeout(storageCheckTimer);
    storageCheckTimer = setTimeout(() => {
      try {
        loadNodeTree();
      } catch (e) {
        // 忽略重新加载错误
      }
    }, 500);
  }
}


// 设置localStorage变化监听器
function setupLocalStorageWatcher() {
  // 保存初始数据
  lastStorageData = localStorage.getItem('mindword_nodetree_data');

  // 使用setInterval定期检查变化（每500ms检查一次）
  setInterval(checkLocalStorageChange, 500);

  // 同时监听storage事件（处理其他页面的变化）
  window.addEventListener('storage', function (e) {
    if (e.key === 'mindword_nodetree_data') {
      checkLocalStorageChange();
    }
  });

  // 监听自定义事件（用于同一页面内的通知）
  window.addEventListener('mindwordDataUpdated', function () {
    checkLocalStorageChange();
  });
}

// 下载思维导图为图片
function downloadMindmap() {
  if (!jm) return;
  try {
    // 创建新的截图插件实例，使用白色背景
    var screenshot_plugin = new JmScreenshot(jm, {
      background: '#ffffff'  // 设置白色背景
    });
    screenshot_plugin.shoot();
  } catch (error) {
    // 静默处理下载错误
  }
}



// 页面加载完成后初始化
window.addEventListener('load', async function () {
  // 初始化转换器
  try {
    if (!window.converter) {
      const module = await import('../converter/converter.js');
      window.converter = new module.ConverterManager();
      // 广播就绪事件（供需要时监听）
      window.dispatchEvent(new Event('converterReady'));
    }
  } catch (error) {
    // 忽略转换器初始化错误
  }

  initMindmap();
  setupLocalStorageWatcher();
  setupMindmapChangeWatcher();
  // 启用框选多选
  setupBoxSelection();

  // 当节点被选中时，向父窗口发送选中信息（用于编辑器跳转高亮）
  try {
    if (typeof jm !== 'undefined' && jm && typeof jm.add_event_listener === 'function') {
      jm.add_event_listener(function (type, data) {
        try {
          if (type === jsMind.event_type.select || type === jsMind.event_type.select_node) {
            var sel = jm.get_selected_node();
            if (!sel) return;
            var nodeObj = (typeof sel === 'string') ? jm.get_node(sel) : sel;
            if (!nodeObj) return;
            // 从 node.data 中取 raw 和 parentPath（兼容多种字段名）
            var raw = (nodeObj.data && (nodeObj.data.raw || nodeObj.data.rawText)) || nodeObj.raw || nodeObj.topic || '';
            var parentPath = (nodeObj.data && nodeObj.data.parentPath) || (nodeObj.parent && nodeObj.parent.id) || '';
            if (window.parent && window.parent !== window) {
              // 构造要发送的 raw 与 parentPath：优先使用 nodeObj.data 中的字段，若无则回退到 topic / 构建路径
              var sendRaw = (nodeObj.data && nodeObj.data.raw) ? nodeObj.data.raw : (nodeObj.topic || '');
              var sendParentPath = (nodeObj.data && nodeObj.data.fullPath) ? nodeObj.data.fullPath : (function () {
                // 回退：从根逐级拼接 topic 形成路径
                try {
                  var parts = [];
                  var p = nodeObj;
                  while (p) {
                    parts.unshift(p.topic || '');
                    if (!p.parent || p.isroot) break;
                    p = p.parent;
                  }
                  return parts.join('/');
                } catch (e) { return nodeObj.parentid || ''; }
              })();
              try { console.log('[MW] 发送 mindmap-node-selected -> parent', { nodeid: nodeObj.id, raw: sendRaw, parentPath: sendParentPath }); } catch (e) { }
              // 去重防抖：避免 jsMind 在短时间内触发两次 select 导致重复广播
              try {
                window.__mw_lastSent = window.__mw_lastSent || { id: null, ts: 0 };
                const nowts = Date.now();
                const same = (window.__mw_lastSent.id === nodeObj.id) && (nowts - window.__mw_lastSent.ts < 300);
                if (!same) {
                  window.parent.postMessage({
                    type: 'mindmap-node-selected',
                    nodeid: nodeObj.id,
                    raw: sendRaw,
                    parentPath: sendParentPath
                  }, '*');
                  window.__mw_lastSent.id = nodeObj.id;
                  window.__mw_lastSent.ts = nowts;
                  try { console.log('[MW] 发送完成'); } catch (e) { }
                } else {
                  try { console.log('[MW] 跳过短时间重复发送 ->', nodeObj.id); } catch (e) { }
                }
              } catch (e) {
                // 降级：若防抖逻辑失败，仍进行发送以保证功能
                try {
                  window.parent.postMessage({
                    type: 'mindmap-node-selected',
                    nodeid: nodeObj.id,
                    raw: sendRaw,
                    parentPath: sendParentPath
                  }, '*');
                } catch (e2) { }
                try { console.log('[MW] 发送完成（降级路径）'); } catch (e) { }
              }
            }
          }
        } catch (e) { /* ignore */ }
      });
    }
  } catch (e) { /* ignore */ }

  // 视口全局工具（幂等注入）：用于在 jm.show 等重建后恢复缩放/平移/滚动，避免跳回根
  if (!window.MW_saveViewport) {
    window.MW_saveViewport = function () {
      try {
        const container = document.getElementById('fullScreenMindmap');
        if (!container) return null;
        const inner = container.querySelector('.jsmind-inner') || container;
        let selectedId = null;
        try {
          const sel = (window.jm && typeof jm.get_selected_node === 'function') ? jm.get_selected_node() : null;
          selectedId = sel ? (sel.id || String(sel)) : null;
        } catch (e) { selectedId = null; }
        let zoom = null, pan = null;
        try {
          if (window.jm && jm.view && typeof jm.view.get_scale === 'function') {
            zoom = jm.view.get_scale();
          }
          if (window.jm && jm.view && typeof jm.view.get_translate === 'function') {
            pan = jm.view.get_translate();
          }
        } catch (e) { }
        return {
          scrollTop: inner.scrollTop,
          scrollLeft: inner.scrollLeft,
          zoom, pan, selectedId
        };
      } catch (e) { return null; }
    };
  }
  if (!window.MW_restoreViewport) {
    // opts: { avoidReselect: true } 来避免 select 导致再次居中
    window.MW_restoreViewport = function (state, opts) {
      try {
        if (!state) return;
        const container = document.getElementById('fullScreenMindmap');
        if (!container) return;
        const inner = container.querySelector('.jsmind-inner') || container;
        // 若调用方明确要求避免恢复选中（例如 jm.show 可能会触发自动居中），则清除选中以避免居中
        try {
          var _avoid = opts && opts.avoidReselect === true;
          if (_avoid) {
            if (window.jm && typeof jm.select_clear === 'function') jm.select_clear();
          }
        } catch (e) { }
        // 恢复缩放与平移
        try {
          if (window.jm && jm.view && typeof jm.view.set_scale === 'function' && state.zoom != null) {
            jm.view.set_scale(state.zoom);
          }
          if (window.jm && jm.view && typeof jm.view.set_translate === 'function' && state.pan != null) {
            jm.view.set_translate(state.pan);
          }
        } catch (e) { }
        // 恢复滚动
        try { inner.scrollTop = state.scrollTop || 0; } catch (e) { }
        try { inner.scrollLeft = state.scrollLeft || 0; } catch (e) { }
        // 可选：恢复之前选中的节点（可能触发居中，默认关闭）
        const avoidReselect = opts && opts.avoidReselect !== undefined ? opts.avoidReselect : true;
        if (!avoidReselect && state.selectedId && window.jm && typeof jm.get_node === 'function' && jm.get_node(state.selectedId)) {
          try { jm.select_node(state.selectedId); } catch (e) { }
        }
      } catch (e) { }
    };
  }
  if (!window.MW_preserveViewportAround) {
    window.MW_preserveViewportAround = function (fn, restoreDelayMs, opts) {
      const st = window.MW_saveViewport && window.MW_saveViewport();
      try { fn && fn(); } catch (e) { }
      const delay = typeof restoreDelayMs === 'number' ? restoreDelayMs : 100;
      setTimeout(function () { try { window.MW_restoreViewport && window.MW_restoreViewport(st, opts); } catch (e) { } }, delay);
    };
  }

  // 初始化 UndoManager（如果已注入）
  try {
    if (window.UndoManager && jm) {
      window.undoManager = new UndoManager({
        maxCapacity: 10,
        getSnapshot: function () {
          try { return JSON.stringify(jm.get_data()); } catch (e) { return null; }
        },
        restoreSnapshot: function (s) {
          try {
            const parsed = JSON.parse(s);

            // 收集重建前的所有节点ID集合
            function collectIds(tree) {
              const set = new Set();
              (function walk(n) {
                if (!n) return;
                if (n.id) set.add(String(n.id));
                if (n.children && n.children.length) n.children.forEach(walk);
              })(tree && tree.data);
              return set;
            }
            const beforeData = (jm && typeof jm.get_data === 'function') ? jm.get_data() : null;
            const beforeIds = beforeData ? collectIds(beforeData) : new Set();

            // 用视口保护包裹重建，避免跳回根
            window.MW_preserveViewportAround(function () {
              jm.show(parsed);
            }, 120, { avoidReselect: true });

            // 重建后选择“被恢复”的节点（不打断视口）
            setTimeout(function () {
              try {
                const afterData = (jm && typeof jm.get_data === 'function') ? jm.get_data() : null;
                if (!afterData) return;
                const afterIds = collectIds(afterData);

                // 优先使用最近删除记录
                let targetId = null;
                if (Array.isArray(window.__mw_lastDeletedIds) && window.__mw_lastDeletedIds.length > 0) {
                  for (const rid of window.__mw_lastDeletedIds) {
                    if (rid && afterIds.has(String(rid))) { targetId = String(rid); break; }
                  }
                }
                // 次选：计算新增集合
                if (!targetId) {
                  const added = [];
                  afterIds.forEach(id => { if (!beforeIds.has(id)) added.push(id); });
                  if (added.length === 1) {
                    targetId = added[0];
                  }
                }
                if (targetId) {
                  // 选中时用视口保护避免再次因选中而居中跳动
                  window.MW_preserveViewportAround(function () {
                    try { jm.select_node(targetId); } catch (e) { }
                  }, 60, { avoidReselect: true });

                  // 强制一次样式/高亮同步，覆盖后续可能的延迟任务（确保选中高亮不会被清掉）
                  setTimeout(function () {
                    try { if (typeof syncSelectionStyles === 'function') syncSelectionStyles(); } catch (e) { }
                    try { if (typeof updateHighlight === 'function') updateHighlight(); } catch (e) { }
                    try { window.__mw_lastDeletedIds = []; } catch (e) { }
                  }, 120);
                }
              } catch (e) { /* ignore */ }
            }, 160);

            // 保存并同步恢复后的数据到 localStorage / 编辑器 / 预览（避免撤销后数据未同步）
            try {
              // 标记短期内为本页自发更新，避免被自身的 storage 监听立即重载
              window.__mindmapSelfUpdateUntil = Date.now() + 1500;
              window.__mindmapSuppressCount = (window.__mindmapSuppressCount || 0) + 1;
              try { if (typeof debouncedSave === 'function') debouncedSave(); else if (typeof saveToLocalStorage === 'function') saveToLocalStorage(); } catch (e) { }
              // 立即向父页面广播最新数据（与 saveToLocalStorage 保持一致）
              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({ type: 'mindmapUpdated', data: (jm && typeof jm.get_data === 'function') ? jm.get_data() : null }, '*');
                }
              } catch (e) { }
            } catch (e) { }

            return true;
          } catch (err) {
            console.error('UndoManager restore failed:', err);
            return false;
          }
        }
      });
      try { window.undoManager.recordIfChanged(); } catch (e) { }
      try { window.undoManager.bindKeyboard({ element: document }); } catch (e) { }
    }
  } catch (e) {
    console.warn('初始化 UndoManager 失败:', e);
  }

  // 初始化AI扩写功能
  if (window.AIExpander) {
    window.aiExpander = new window.AIExpander();
    window.aiExpander.init(jm);
  }
});
