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

/* mindmap-core.js - extracted from mindmap.html inline scripts (core) */

// // AI模块导入和全局导出（从mindmap-module-1.js迁移）
// import { AIExpander } from '../ai/ai-expander.js';
// import { AIConfigManager } from '../ai/ai-config.js';
// // 将类导出到全局作用域
// window.AIExpander = AIExpander;
// window.AIConfigManager = AIConfigManager;

// --- 防重复绑定补丁（从 mindmap-extensions.js 整合） ---
// 防重复绑定补丁（非侵入）：对一组常见事件的等价回调去重（DOMContentLoaded, load, resize, storage）
// 只在 addEventListener 注册时做检测并忽略等价 listener 的重复注册（使用 listener.toString() 作为轻量指纹）
(function () {
  try {
    if (!document.__mw_event_dedupe_installed) {
      var __orig_add = document.addEventListener.bind(document);
      var __seen = Object.create(null); // map: eventType -> Set of fingerprints
      document.addEventListener = function (type, listener, options) {
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
          let viewportState = null;
          try {
            viewportState = window.MW_saveViewport ? window.MW_saveViewport() : saveViewport();
          } catch (e) { }
          jm.show(filtered);
          // small delay then restore viewport and badges and re-init scrolling/layout
          setTimeout(function () {
            try {
              if (window.MW_restoreViewport && viewportState) {
                window.MW_restoreViewport(viewportState);
              } else {
                restoreViewport();
              }
            } catch (e) { }
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
            let viewportState = null;
            try {
              viewportState = window.MW_saveViewport ? window.MW_saveViewport() : saveViewport();
            } catch (e) { }
            jm.show(snap);
            setTimeout(function () {
              try {
                if (window.MW_restoreViewport && viewportState) {
                  window.MW_restoreViewport(viewportState);
                } else {
                  restoreViewport();
                }
              } catch (e) { }
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

    // 移动端检测：设置默认状态（不再隐藏节点详情控件）
    var isMobile = (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches));
    if (isMobile) {
      try {
        var exportBtn = document.getElementById('export-json-btn');
        if (exportBtn) exportBtn.style.display = 'none';
        // 移动端默认关闭节点详情开关
        if (cbDetails) cbDetails.checked = false;
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
// 复制粘贴功能的全局变量
window.MW.copiedNodes = window.MW.copiedNodes || []; // 存储复制的节点树数据
window.MW.copyTimestamp = window.MW.copyTimestamp || 0; // 复制时间戳，用于调试和验证

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

      // 初始视图水平偏移（px）。负值向左偏移。
      initial_offset_x: "35%"
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

  jm = new window.jsMind(options);

  // 将jsMind实例赋值给window，供其他模块访问
  window.jm = jm;
  const multiSelected = window.MW.multiSelected;

  // 守护性注入：确保 runtime view.opts 包含 options.view.initial_offset_x（便于后续补丁读取）
  try {
    var __opt_iox = (options && options.view && typeof options.view.initial_offset_x !== 'undefined') ? options.view.initial_offset_x : null;
    if (jm && jm.view) {
      if (__opt_iox !== null) {
        jm.view.opts.initial_offset_x = __opt_iox;
        console.log('[MW][init] enforced jm.view.opts.initial_offset_x =', jm.view.opts.initial_offset_x);
      } else {
        console.log('[MW][init] options.view.initial_offset_x not provided; jm.view.opts.initial_offset_x =', jm.view.opts.initial_offset_x);
      }
    } else {
      console.log('[MW][init] jm.view not ready to enforce initial_offset_x');
    }
  } catch (e) {
    console.error('[MW][init] error enforcing initial_offset_x', e);
  }

  // 配置思维导图容器的滚动行为
  setupMindmapScrolling();

  // 重新计算同级有序列表的编号
  function reorderOrderedSiblings(parentNode, startIndex) {
    if (!parentNode || !parentNode.children || parentNode.children.length === 0) {
      return;
    }

    const children = parentNode.children;
    let orderedIndex = 0;

    // 先找到 startIndex 之前的最后一个有序列表的编号
    for (let i = 0; i < startIndex; i++) {
      const child = children[i];
      if (child && child.data && child.data.type === 'list' && child.data.ordered) {
        orderedIndex = child.data.listIndex || 0;
      }
    }

    // 从 startIndex 开始重新编号所有有序列表
    for (let j = startIndex; j < children.length; j++) {
      const child = children[j];
      if (child && child.data && child.data.type === 'list' && child.data.ordered) {
        orderedIndex++;
        child.data.listIndex = orderedIndex;
        // 同步更新 marker，确保 AST 转换时使用正确的编号
        child.data.marker = orderedIndex + '.';
        // 同时更新根级 marker（如果存在）
        if (child.marker != null) {
          child.marker = orderedIndex + '.';
        }
      }
    }
  }
  window.reorderOrderedSiblings = reorderOrderedSiblings;

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
          // 重新计算有序列表编号
          try {
            const newNode = jm.get_node(id);
            if (newNode && newNode.parent) {
              // 找到新添加的兄弟节点
              const parentNode = newNode.parent;
              // 查找新添加节点在兄弟节点中的索引
              const childIndex = parentNode.children.findIndex(child => child && child.id === id);
              if (childIndex !== -1) {
                reorderOrderedSiblings(parentNode, childIndex);
              }
            }
          } catch (e3) {
            // 忽略重新编号错误
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

            // 后置处理：类型对齐和列表归一化，以及有序列表重新编号
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
                // 重新编号新父节点的所有有序列表
                reorderOrderedSiblings(p, 0);
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

        // 记录原父节点（移动前）
        let oldParentNode = null;
        try {
          const nodeBeforeMove = jm.get_node(nodeid);
          if (nodeBeforeMove && nodeBeforeMove.parent) {
            oldParentNode = nodeBeforeMove.parent;
          }
        } catch (e0) {
          // 忽略获取原父节点错误
        }

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
          // 重新计算有序列表编号：原父节点和新父节点
          try {
            // 重新编号原父节点（如果还存在并且与新父不同）
            if (oldParentNode) {
              const oldParentChanged = !parentid || !oldParentNode.id || oldParentNode.id !== parentid;
              if (oldParentChanged) {
                reorderOrderedSiblings(oldParentNode, 0);
              }
            }
            // 新父节点重新编号
            if (parentid) {
              const newParent = jm.get_node(parentid);
              if (newParent) {
                reorderOrderedSiblings(newParent, 0);
              }
            }
          } catch (e3) {
            // 忽略重新编号错误
          }
          if (typeof debouncedSave === 'function') debouncedSave();
        } catch (e) {
          // 忽略后置处理错误
        }
        return ret;
      };
    }
    // 删除节点包装
    const __origRemove = jm.remove_node && jm.remove_node.bind(jm);
    if (__origRemove) {
      jm.remove_node = function (nodeid) {
        // 获取即将删除的节点信息，以便知道从哪里开始重新编号
        let parentNode = null;
        let deleteIndex = -1;
        try {
          const nodeToDelete = jm.get_node(nodeid);
          if (nodeToDelete && nodeToDelete.parent) {
            parentNode = nodeToDelete.parent;
            deleteIndex = parentNode.children.findIndex(child => child && child.id === nodeid);
          }
        } catch (e1) {
          // 忽略获取节点信息错误
        }
        // 执行删除
        const ret = __origRemove(nodeid);
        // 删除后重新编号
        try {
          if (parentNode && deleteIndex !== -1) {
            reorderOrderedSiblings(parentNode, deleteIndex);
          }
        } catch (e2) {
          // 忽略重新编号错误
        }
        if (typeof debouncedSave === 'function') debouncedSave();
        return ret;
      };
    }
  })();

  // 初始化完成后加载数据
  loadNodeTree();

  // 初始化ViewStateManager（下钻功能）
  if (window.viewStateManager) {
    try {
      window.viewStateManager.initializeUrlState();
      console.log('[MW][ViewStateManager] 初始化完成');
    } catch (e) {
      console.error('[MW][ViewStateManager] 初始化失败:', e);
    }
  }

  // 绑定事件 - 删除旧的批量移动逻辑，现在使用拖拽批量拖拽保护并延迟在 mouseup 时展示详情
  jm.add_event_listener(function (type, data) {
    if (type === window.jsMind.event_type.select) {
      try {
        // do NOT show details here to avoid showing on mousedown; record last selected id for mouseup handler
        const sel = jm.get_selected_node && jm.get_selected_node();
        const selId = sel && sel.id ? sel.id : null;
        window.__mw_lastSelectedNodeId = selId;
        console.log('[MW][details] select recorded lastSelectedNodeId=', selId);
        // keep but DO NOT call showNodeDetails here

        // 更新ViewStateManager的按钮状态
        if (window.viewStateManager) {
          window.viewStateManager.updateToolbarButtons();
        }
      } catch (e) {
        console.warn('[MW][details] select handler failed', e);
      }
    }
  });

  // 当详情面板处于打开状态时，自动跟随“单选节点”变化刷新面板内容
  (function attachAutoDetailsFollow() {
    try {
      function isDetailsPanelVisible() {
        var p = document.getElementById('nodeDetails');
        return !!(p && p.style.display !== 'none' && p.getAttribute('aria-hidden') !== 'true');
      }
      jm.add_event_listener(function (type, data) {
        try {
          // 跳过拖拽/输入捕获期间，避免抢焦点或与拖拽冲突
          var dragging = !!(window.__mw_pointer_down || (window.__batchDragData && window.__batchDragData.isBatchDragging));
          var inputCapturing = !!(window.__mw_input_focus_guard && window.__mw_input_focus_guard.capturing);
          // 放宽早退：仅在开关关闭或拖拽中早退；允许 select_clear 在面板不可见时也能切到空状态
          if (!window.__nodeDetailsEnabled || dragging) return;

          if (type === window.jsMind.event_type.select) {
            if (inputCapturing) return; // 编辑输入期间不刷新
            var sel = jm.get_selected_node && jm.get_selected_node();
            if (sel && typeof showNodeDetails === 'function') {
              try { console.log('[MW][details] select -> showNodeDetails', sel && sel.id); } catch (e) { }
              showNodeDetails(sel);
            }
          } else if (type === window.jsMind.event_type.select_clear) {
            try { console.log('[MW][details] select_clear -> try empty, exists=', typeof window.showEmptyDetailsPrompt); } catch (e) { }
            if (typeof window.showEmptyDetailsPrompt === 'function') {
              window.showEmptyDetailsPrompt();
            }
          }
        } catch (e) { /* ignore */ }
      });

      // 更新ViewStateManager的按钮状态
      try {
        if (window.viewStateManager && typeof window.viewStateManager.updateToolbarButtons === 'function') {
          window.viewStateManager.updateToolbarButtons();
        }
      } catch (e) { /* ignore */ }
    } catch (e) { console.warn('[MW] attachAutoDetailsFollow failed', e); }
  })();

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
        window.jsMind.event_type.select,
        window.jsMind.event_type.show,
        window.jsMind.event_type.resize,
        window.jsMind.event_type.refresh,
        window.jsMind.event_type.expand,
        window.jsMind.event_type.collapse,
        window.jsMind.event_type.edit,
        window.jsMind.event_type.add,
        window.jsMind.event_type.move
      ];
      if (interesting.indexOf(type) !== -1) {
        console.log('[MW] 捕获 jsMind 事件:', type);
        debouncedApply();
      }
      if (type === window.jsMind.event_type.show) {
        try {
          if (window.skinManager && window.skinManager.currentSkin) {
            window.skinManager.applyThemeClass(window.skinManager.currentSkin.themeClass);
          }
        } catch (e) { }
      }
    });

    // 作为保险：在全局包装点或其他地方也可直接调用 window.MW_debouncedApplyBadges()
    window.MW_debouncedApplyBadges = debouncedApply;

    // 立即执行一次，确保初始化时生效
    try { debouncedApply(); } catch (e) {/* ignore */ }
  })();

  // 强制缩放重排：在初始化后立即应用当前actualZoom，确保布局和连线正确
  setTimeout(function () {
    if (jm && jm.view && jm.view.actualZoom) {
      console.log('[MW] 强制缩放重排 - 应用actualZoom:', jm.view.actualZoom);
      // 使用setZoom重新应用当前缩放，触发重排和重绘
      jm.view.setZoom(jm.view.actualZoom);
    }
  }, 100);

  // // 首次鼠标按下兜底执行强制缩放重排
  // let __mw_firstMouseDownHandled = false;
  // const container = document.getElementById('fullScreenMindmap');
  // if (container) {
  //   const mindmapInner = container.querySelector('.jsmind-inner') || container;
  //   mindmapInner.addEventListener('mousedown', function (e) {
  //     if (!__mw_firstMouseDownHandled && jm && jm.view && jm.view.actualZoom) {
  //       __mw_firstMouseDownHandled = true;
  //       console.log('[MW] 首次鼠标按下兜底 - 强制缩放重排，actualZoom:', jm.view.actualZoom);
  //       // 使用setZoom重新应用当前缩放，确保布局和连线正确
  //       jm.view.setZoom(jm.view.actualZoom);
  //     }
  //   }, { once: false });
  // }

}

// 配置思维导图容器的滚动行为
function setupMindmapScrolling() {
  if (!jm) return;



  const container = document.getElementById('fullScreenMindmap');
  if (!container) return;

  // 为主容器添加滚动事件监听，滚动时显示滚动条
  let containerScrollTimeout;
  container.addEventListener('scroll', function () {
    container.classList.add('scrolling');
    clearTimeout(containerScrollTimeout);
    containerScrollTimeout = setTimeout(function () {
      container.classList.remove('scrolling');
    }, 500); // 滚动停止500ms后隐藏滚动条
  }, { passive: true });

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

      // 滚动时显示滚动条
      let scrollTimeout;
      jsmindInner.addEventListener('scroll', function () {
        jsmindInner.classList.add('scrolling');
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(function () {
          jsmindInner.classList.remove('scrolling');
        }, 500); // 滚动停止500ms后隐藏滚动条
      }, { passive: true });

      // Add pointer handlers to show node details only on mouseup (if not dragged)
      try {
        // pointer state flags
        let pointerDown = false;
        let startX = 0, startY = 0;
        let pointerDragged = false;
        const DRAG_THRESHOLD = 6; // px

        jsmindInner.addEventListener('mousedown', function (evt) {
          try {
            pointerDown = true;
            pointerDragged = false;
            startX = evt.clientX;
            startY = evt.clientY;
            // record selected node at mousedown time (may be updated by select event)
            try { window.__mw_lastMouseDownSelectedId = (jm && jm.get_selected_node && jm.get_selected_node()) ? jm.get_selected_node().id : null; } catch (e) { window.__mw_lastMouseDownSelectedId = null; }
            window.__mw_pointer_down = true;
            window.__mw_pointer_dragged = false;
            // record timestamp and expose for debugging
            try {
              var __ts = Date.now();
              window.__mw_pointer_down_ts = __ts;
              console.log('[MW][details] mousedown', { x: startX, y: startY, ts: __ts, lastSelectedId: window.__mw_lastMouseDownSelectedId });
            } catch (e) { /* ignore logging errors */ }
            //console.log('[MW][details] mousedown recorded id=', window.__mw_lastMouseDownSelectedId);
          } catch (e) { /* ignore */ }
        }, { passive: true });

        jsmindInner.addEventListener('mousemove', function (evt) {
          try {
            if (!pointerDown) return;
            const dx = Math.abs(evt.clientX - startX);
            const dy = Math.abs(evt.clientY - startY);
            if (!pointerDragged && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
              pointerDragged = true;
              window.__mw_pointer_dragged = true;
              try {
                var __now = Date.now();
                var __dt = window.__mw_pointer_down_ts ? (__now - window.__mw_pointer_down_ts) : null;
                console.log('[MW][details] pointer considered dragged', { dx: dx, dy: dy, threshold: DRAG_THRESHOLD, elapsedMs: __dt, start: { x: startX, y: startY }, now: { x: evt.clientX, y: evt.clientY } });
                console.log('[MW][details] ENTER DRAG via pointermove', { start: { x: startX, y: startY }, now: { x: evt.clientX, y: evt.clientY }, elapsedMs: __dt });
              } catch (e) { /* ignore logging errors */ }
              //console.log('[MW][details] pointer considered dragged');
            }
          } catch (e) { /* ignore */ }
        }, { passive: true });

        jsmindInner.addEventListener('mouseup', function (evt) {
          try {
            if (!pointerDown) { return; }
            pointerDown = false;
            window.__mw_pointer_down = false;
            // if we did not drag and details enabled and not batch dragging -> show details for last selected
            const wasDragged = !!window.__mw_pointer_dragged;
            window.__mw_pointer_dragged = false;
            // debug info: end coords, duration, drag flag
            try {
              var __endX = evt.clientX;
              var __endY = evt.clientY;
              var __endTs = Date.now();
              var __startTs = window.__mw_pointer_down_ts || null;
              var __duration = (__startTs != null) ? (__endTs - __startTs) : null;
              console.log('[MW][details] mouseup', { x: __endX, y: __endY, durationMs: __duration, wasDragged: wasDragged, lastSelectedId: window.__mw_lastMouseDownSelectedId });
            } catch (e) { /* ignore logging errors */ }
            const lastId = window.__mw_lastMouseDownSelectedId || window.__mw_lastSelectedNodeId || null;

            // additional guard: only show details if mouseup happened on the same jmnode that was mousedowned
            var targetNodeId = null;
            var targetElem = null;
            try {
              // 优先使用 closest（兼容 class 或 属性 标识的节点）
              var targ = evt && evt.target;
              var found = null;
              try {
                if (targ && targ.closest) {
                  found = targ.closest('.jmnode, [nodeid], [data-nodeid], [node-id]');
                }
              } catch (e) { found = null; }
              // 若 closest 未命中，再基于坐标使用 elementFromPoint 做二次探测（覆盖层 / 文本节点场景）
              if (!found && typeof evt === 'object' && typeof evt.clientX === 'number' && typeof evt.clientY === 'number' && document.elementFromPoint) {
                try {
                  var elAtPoint = document.elementFromPoint(evt.clientX, evt.clientY);
                  if (elAtPoint && elAtPoint.closest) {
                    found = elAtPoint.closest('.jmnode, [nodeid], [data-nodeid], [node-id]');
                  }
                } catch (e) { /* ignore elementFromPoint errors */ }
              }
              // 最后回退到 mousedown 时记录的 id（若存在）
              if (found) {
                try {
                  targetNodeId = found.getAttribute('nodeid') || found.getAttribute('data-nodeid') || found.getAttribute('node-id') || null;
                } catch (e) { targetNodeId = null; }
              } else {
                targetNodeId = window.__mw_lastMouseDownSelectedId || null;
              }
            } catch (e) { targetNodeId = null; }

            if (!wasDragged && lastId && !!window.__nodeDetailsEnabled && !(window.__batchDragData && window.__batchDragData.isBatchDragging) && targetNodeId && String(targetNodeId) === String(lastId)) {
              try {
                const node = jm.get_node && jm.get_node(lastId);
                if (node) {
                  console.log('[MW][details] mouseup -> showNodeDetails id=', lastId, ' targetNodeId=', targetNodeId);
                  // 仅在非由输入域发起的捕获期间才立即显示详情；若捕获自输入域则跳过以避免抢焦点
                  if (!(window.__mw_input_focus_guard && window.__mw_input_focus_guard.installed && window.__mw_input_focus_guard.capturing)) {
                    showNodeDetails(node);
                  } else {
                    // 捕获自输入域：跳过立即显示详情以避免在 mouseup 时抢占输入焦点
                    console.log('[MW][details] skipped showNodeDetails due to active input capture');
                  }
                }
              } catch (e) { console.warn('[MW][details] mouseup showNodeDetails failed', e); }
            } else {
              console.log('[MW][details] mouseup skipped show', { wasDragged: !!wasDragged, detailsEnabled: !!window.__nodeDetailsEnabled, lastId: lastId, targetNodeId: targetNodeId, batchDragging: !!(window.__batchDragData && window.__batchDragData.isBatchDragging) });
            }
          } catch (e) { /* ignore */ }
        }, { passive: true });

      } catch (e) { console.warn('[MW][details] pointer handlers install failed', e); }
    }

    // 已移除冗余滚动调试输出
  }, 500); // 延迟500ms确保jsmind完成DOM创建
}

// 加载NodeTree数据
function loadNodeTree(nodeTreeData) {
  if (!jm) return;

  // 防止嵌套调用：loadNodeTree 内部调用 jm.show 会触发数据重置，
  // 如果外部再次调用 loadNodeTree 会导致 jm 状态异常
  if (window.__mw_loadNodeTreeInProgress) {
    console.warn('[MW][loadNodeTree] 已有loadNodeTree在执行中，跳过重复调用');
    return;
  }
  window.__mw_loadNodeTreeInProgress = true;

  try {

    // 如果没有提供数据，尝试从localStorage获取
    if (!nodeTreeData) {
      const cachedData = localStorage.getItem('mindword_nodetree_data');
      console.log('[MW][loadNodeTree] 从localStorage读取, 有缓存:', !!cachedData);
      if (cachedData) {
        try {
          nodeTreeData = JSON.parse(cachedData);
          window.__mw_showingDefaultNodeTree = false;
          console.log('[MW][loadNodeTree] 解析缓存成功, root:', nodeTreeData?.data?.topic || nodeTreeData?.topic);
          if (isDefaultNodeTreeData(nodeTreeData)) {
            console.log('[MW][loadNodeTree] 检测到默认样本数据, 尝试从markdown恢复');
            var realMarkdown = '';
            try { realMarkdown = localStorage.getItem('mindword_markdown_data') || ''; } catch (e) { realMarkdown = ''; }
            if (realMarkdown.trim() && hasRealMarkdownCache() && window.converter && typeof window.converter.mdToNodeTree === 'function') {
              nodeTreeData = window.converter.mdToNodeTree(realMarkdown);
              console.log('[MW][loadNodeTree] 从markdown恢复成功');
            }
          }
        } catch (error) {
          console.error('[MW][loadNodeTree] 解析缓存失败, 使用默认数据:', error);
          nodeTreeData = getDefaultNodeTree();
          window.__mw_showingDefaultNodeTree = true;
        }
      } else {
        var cachedMarkdown = '';
        try { cachedMarkdown = localStorage.getItem('mindword_markdown_data') || ''; } catch (e) { cachedMarkdown = ''; }
        console.log('[MW][loadNodeTree] 无nodetree缓存, 尝试从markdown加载, 有markdown:', !!cachedMarkdown.trim());
        if (cachedMarkdown.trim() && window.converter && typeof window.converter.mdToNodeTree === 'function') {
          try {
            nodeTreeData = window.converter.mdToNodeTree(cachedMarkdown);
            window.__mw_showingDefaultNodeTree = false;
            console.log('[MW][loadNodeTree] 从markdown加载成功');
          } catch (error) {
            console.warn('[MW][loadNodeTree] markdown -> nodeTree失败, 使用默认:', error);
            nodeTreeData = getDefaultNodeTree();
            window.__mw_showingDefaultNodeTree = true;
          }
        } else {
          console.log('[MW][loadNodeTree] 无markdown缓存, 使用默认数据');
          nodeTreeData = getDefaultNodeTree();
          window.__mw_showingDefaultNodeTree = true;
        }
      }
    } else {
      window.__mw_showingDefaultNodeTree = isDefaultNodeTreeData(nodeTreeData);
      console.log('[MW][loadNodeTree] 使用传入数据, 是否默认:', window.__mw_showingDefaultNodeTree);
    }

    try {
      // 确保数据格式正确
      if (typeof nodeTreeData === 'string') {
        nodeTreeData = JSON.parse(nodeTreeData);
      }

      // 在显示前保存视口（以便在重新渲染后恢复）
      let viewportState = null;
      try {
        viewportState = window.MW_saveViewport ? window.MW_saveViewport() : saveViewport();
      } catch (e) { }
      console.log('[MW][loadNodeTree] 调用jm.show, root:', nodeTreeData?.data?.topic || nodeTreeData?.topic);
      jm.show(nodeTreeData);
      console.log('[MW][loadNodeTree] jm.show成功');
      window.__mw_showingDefaultNodeTree = isDefaultNodeTreeData(nodeTreeData);
      currentNodeTree = nodeTreeData;
      try {
        if (window.MW_restoreViewport && viewportState) {
          window.MW_restoreViewport(viewportState, { avoidReselect: true });
        } else {
          restoreViewport();
        }
      } catch (e) { }
      window.MW_scheduleOnce('restoreViewportAfterShow', function () {
        try {
          if (window.MW_restoreViewport && viewportState) {
            window.MW_restoreViewport(viewportState, { avoidReselect: true });
          } else {
            restoreViewport();
          }
        } catch (e) { }
      }, 30);

      // 更新ViewStateManager状态
      if (window.viewStateManager) {
        try {
          window.viewStateManager.updateToolbarButtons();
          window.viewStateManager.updateBreadcrumb();
        } catch (e) {
          console.warn('[MW][ViewStateManager] 更新状态失败:', e);
        }
      }

      // 兼容补丁：在 jm.show 后可能有其他逻辑（restoreViewport / setZoom / style 调整）覆盖初始 scroll，
      // 此处再延迟一次强制应用 view.initial_offset_x（以像素为单位，乘以 actualZoom）
      // 目的：确保用户配置的 initial_offset_x 在初始化后最终生效（例如 -600 向左偏移）。
      // 注意：只在首次加载时应用偏移，避免刷新时重复添加导致画布偏移
      try {
        // 标记是否已经应用过初始偏移
        if (window._mwInitialOffsetApplied) {
          console.log('[MW][offset-fix] 初始偏移已应用，跳过');
        } else {
          window._mwInitialOffsetApplied = true;
          setTimeout(function () {
            try {
              var container = document.getElementById('fullScreenMindmap');
              console.log('[MW][offset-fix] running post-show offset fix, container=', !!container);
              if (!container) return;
              var inner = container.querySelector('.jsmind-inner') || container;
              console.log('[MW][offset-fix] inner found=', !!inner);
              if (!inner) return;
              if (!jm || !jm.view) {
                console.log('[MW][offset-fix] jm or jm.view missing', { jm: !!jm, view: !!(jm && jm.view) });
                return;
              }
              var off = (jm.view.opts && typeof jm.view.opts.initial_offset_x !== 'undefined') ? jm.view.opts.initial_offset_x : 0;
              var zoom = (typeof jm.view.actualZoom === 'number') ? jm.view.actualZoom : null;
              try { console.log('[MW][offset-fix] initial_offset_x=', off, 'actualZoom=', zoom, 'inner.scrollLeft(before)=', inner.scrollLeft); } catch (e) { /* ignore */ }

              // 支持百分比字符串（例如 "10%" 或 "-5%"）或像素数值。
              // 百分比基准使用 jm.view.size.w（视图宽度），然后再乘以 actualZoom 应用到 scrollLeft。
              function _parseInitialOffset(o) {
                try {
                  if (o == null) return 0;
                  if (typeof o === 'string') {
                    var s = o.trim();
                    if (s.endsWith('%')) {
                      var v = parseFloat(s.slice(0, -1));
                      if (isNaN(v)) return 0;
                      var vw_source = null;
                      var vw = 0;
                      // 优先使用显式的 .jsmind-inner.jmnode-overflow-wrap 容器宽度（更贴近可视画布）
                      var explicitInner = null;
                      try {
                        var rootContainer = document.getElementById('fullScreenMindmap');
                        if (rootContainer) {
                          explicitInner = rootContainer.querySelector('.jsmind-inner.jmnode-overflow-wrap') || rootContainer.querySelector('.jsmind-inner');
                        } else {
                          explicitInner = document.querySelector('.jsmind-inner.jmnode-overflow-wrap') || document.querySelector('.jsmind-inner');
                        }
                      } catch (e) { explicitInner = null; }

                      if (explicitInner && explicitInner.clientWidth) {
                        vw_source = '.jsmind-inner.jmnode-overflow-wrap';
                        vw = explicitInner.clientWidth;
                      } else if (jm && jm.view && jm.view.size && typeof jm.view.size.w === 'number') {
                        vw_source = 'jm.view.size.w';
                        vw = jm.view.size.w;
                      } else if (inner && inner.clientWidth) {
                        vw_source = 'inner.clientWidth';
                        vw = inner.clientWidth;
                      } else {
                        vw_source = 'unknown';
                        vw = 0;
                      }
                      try { console.log('[MW][offset-fix] percent baseline=', vw_source, 'explicitInner.clientWidth=', (explicitInner && explicitInner.clientWidth), 'jm.view.size.w=', (jm && jm.view && jm.view.size && jm.view.size.w), 'inner.clientWidth=', (inner && inner.clientWidth), 'pct=', v); } catch (e) { /* ignore */ }
                      return Math.round(v / 100 * vw);
                    }
                    // fallback: try parse as number string
                    var n = parseFloat(s);
                    return isNaN(n) ? 0 : n;
                  }
                  // if numeric already
                  var num = Number(o);
                  return isNaN(num) ? 0 : num;
                } catch (ee) { return 0; }
              }

              var pixelOff = _parseInitialOffset(off);
              try { console.log('[MW][offset-fix] parsed initial_offset_x -> pixelOff=', pixelOff); } catch (e) { /* ignore */ }

              // 将偏移按当前缩放比例应用（保持与 _center_root 计算一致）
              if (pixelOff && zoom != null) {
                try {
                  var delta = pixelOff * zoom;
                  console.log('[MW][offset-fix] applying delta=', delta);
                  inner.scrollLeft = (inner.scrollLeft || 0) + delta;
                  console.log('[MW][offset-fix] inner.scrollLeft(after)=', inner.scrollLeft);
                } catch (e) {
                  console.error('[MW][offset-fix] apply error', e);
                }
              } else {
                console.log('[MW][offset-fix] nothing to apply (pixelOff or zoom invalid)');
              }
            } catch (e) {
              console.error('[MW][offset-fix] unexpected error', e);
            }
          }, 180);
        } // 结束 if (!window._mwInitialOffsetApplied)
      } catch (e) { console.error('[MW][offset-fix] outer error', e); }

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

      // 派发mindmapReady事件，通知mindmap.html思维导图已准备就绪
      try {
        window.dispatchEvent(new Event('mindmapReady'));
        console.log('[MW] 已派发 mindmapReady 事件');
      } catch (e) {
        console.warn('[MW] 派发 mindmapReady 事件失败:', e);
      }
    } catch (error) {
      // 如果加载失败，尝试加载默认数据
      console.error('[MW][loadNodeTree] jm.show失败, 切换到默认数据:', error);
      try {
        window.__mw_showingDefaultNodeTree = true;
        jm.show(getDefaultNodeTree());
        console.log('[MW][loadNodeTree] 已加载默认数据');
      } catch (defaultError) {
        console.error('[MW][loadNodeTree] 加载默认数据也失败:', defaultError);
      }
    }
  } finally {
    window.__mw_loadNodeTreeInProgress = false;
  }
}
// 获取当前NodeTree
function getCurrentNodeTree() {
  // 如果处于下钻模式，返回原始完整数据
  if (window.viewStateManager && window.viewStateManager.isInDrillDownMode()) {
    return window.viewStateManager.originalData || (jm ? jm.get_data() : null);
  }
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
  // 切换为“表单”状态：隐藏空视图，显示表单
  try {
    var empty = document.getElementById('nodeDetailsEmpty');
    var form = document.getElementById('nodeDetailsForm');
    if (empty) empty.style.display = 'none';
    if (form) form.style.display = 'block';
  } catch (e) { /* ignore */ }

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
  let pureTopic = snapshot.topic;
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

  // 检测是否为移动端
  const isMobile = (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches));

  // 移除之前的事件监听避免重复
  nodeTopic.removeEventListener('input', handleAutoUpdate);
  nodeNotes.removeEventListener('input', handleAutoUpdate);
  nodeTopic.removeEventListener('change', handleAutoUpdate);
  nodeNotes.removeEventListener('change', handleAutoUpdate);

  // 添加新的事件监听
  nodeTopic.addEventListener('input', handleAutoUpdate);
  nodeNotes.addEventListener('input', handleAutoUpdate);

  // 移动端额外添加change事件确保数据保存
  if (isMobile) {
    nodeTopic.addEventListener('change', handleAutoUpdate);
    nodeNotes.addEventListener('change', handleAutoUpdate);
  }


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
    // 文本框失焦时记录历史记录
    handleBlurHistoryRecord();
  }

  try {
    nodeTopic.addEventListener('focus', _mw_onInputFocus, { passive: true });
    nodeTopic.addEventListener('blur', function (e) {
      try {
        var shouldDelay = false;
        try {
          if (window.__mw_input_focus_guard && window.__mw_input_focus_guard.installed && window.__mw_input_focus_guard.capturing) shouldDelay = true;
        } catch (ee) { /* ignore */ }
        try {
          if (document && document.activeElement === document.body) shouldDelay = true;
        } catch (ee) { /* ignore */ }
        try {
          if (!e || !e.relatedTarget) shouldDelay = true;
        } catch (ee) { /* ignore */ }

        if (shouldDelay) {
          // 延迟判断：只有当捕获结束或焦点不再为 body 时才执行 blur 行为
          setTimeout(function () {
            try {
              var stillCapturing = false;
              try { stillCapturing = !!(window.__mw_input_focus_guard && window.__mw_input_focus_guard.capturing); } catch (er) { stillCapturing = false; }
              var activeIsBody = false;
              try { activeIsBody = !!(document && document.activeElement === document.body); } catch (er) { activeIsBody = false; }
              var activeIsCanvas = false;
              try {
                var ae = document && document.activeElement;
                if (ae) {
                  if (ae.classList && ae.classList.contains && ae.classList.contains('jsmind-inner')) activeIsCanvas = true;
                  else if (ae.closest && ae.closest('.jsmind-inner')) activeIsCanvas = true;
                }
              } catch (er2) { activeIsCanvas = false; }
              // 如果既不在捕获中、也不在body、且不是画布，则认为是真正失焦才执行 blur
              if (!stillCapturing && !activeIsBody && !activeIsCanvas) {
                _mw_onInputBlur.call(nodeTopic, e);
              }
            } catch (ee) { try { _mw_onInputBlur.call(nodeTopic, e); } catch (er) { } }
          }, 20);
          return;
        }
      } catch (ee) { /* ignore */ }
      _mw_onInputBlur.call(nodeTopic, e);
    }, { passive: true });
    nodeNotes.addEventListener('focus', _mw_onInputFocus, { passive: true });
    nodeNotes.addEventListener('blur', function (e) {
      try {
        var shouldDelay = false;
        try {
          if (window.__mw_input_focus_guard && window.__mw_input_focus_guard.installed && window.__mw_input_focus_guard.capturing) shouldDelay = true;
        } catch (ee) { /* ignore */ }
        try {
          if (document && document.activeElement === document.body) shouldDelay = true;
        } catch (ee) { /* ignore */ }
        try {
          if (!e || !e.relatedTarget) shouldDelay = true;
        } catch (ee) { /* ignore */ }

        if (shouldDelay) {
          setTimeout(function () {
            try {
              var stillCapturing = false;
              try { stillCapturing = !!(window.__mw_input_focus_guard && window.__mw_input_focus_guard.capturing); } catch (er) { stillCapturing = false; }
              var activeIsBody = false;
              try { activeIsBody = !!(document && document.activeElement === document.body); } catch (er) { activeIsBody = false; }
              var activeIsCanvas = false;
              try {
                var ae = document && document.activeElement;
                if (ae) {
                  if (ae.classList && ae.classList.contains && ae.classList.contains('jsmind-inner')) activeIsCanvas = true;
                  else if (ae.closest && ae.closest('.jsmind-inner')) activeIsCanvas = true;
                }
              } catch (er2) { activeIsCanvas = false; }
              if (!stillCapturing && !activeIsBody && !activeIsCanvas) {
                _mw_onInputBlur.call(nodeNotes, e);
              }
            } catch (ee) { try { _mw_onInputBlur.call(nodeNotes, e); } catch (er) { } }
          }, 20);
          return;
        }
      } catch (ee) { /* ignore */ }
      _mw_onInputBlur.call(nodeNotes, e);
    }, { passive: true });
  } catch (e) { }
}

// 处理自动更新
let autoUpdateTimer = null;
// 处理文本框失焦时的历史记录记录
function handleBlurHistoryRecord() {
  // 延迟执行，确保所有更新都已完成
  setTimeout(() => {
    if (window.undoManager && !window.undoManager.isRestoring) {
      try {
        window.undoManager.recordIfChanged();
      } catch (e) {
        console.warn('记录历史记录失败:', e);
      }
    }
  }, 100);
}

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
      selected.notes = newNotes;
      hasChanges = true;
    }

    if (hasChanges) {
      // 如果备注有变化，需要调用update_node来触发视图更新（包括备注图标）
      if (newNotes !== prevNotes) {
        jm.update_node(selected.id, selected.topic);
      }
      refreshAllNotesDisplay();
      saveToLocalStorage();

      // 注意：在文本框输入时不自动记录历史记录，让用户使用文本框自带的撤销功能
      // 历史记录将在文本框失焦时通过 blur 事件处理

      showAutoUpdateIndicator();
    }
  }, 500);
}

/*
  图标数据已迁移到 jsmind/icons.js（MWIcons），
  这里改为在运行时读取 window.availableIcons 或 MWIcons.get()
  保留向后兼容的行为。
*/
var availableIcons = (window && window.availableIcons && window.availableIcons.length) ? window.availableIcons
  : (window && window.MWIcons && typeof window.MWIcons.get === 'function' ? window.MWIcons.get() : [
    { emoji: '✅', name: '绿色钩' }, { emoji: '❌', name: '红色叉' }, { emoji: '⚠️', name: '警告' },
    { emoji: '❗', name: '重要' }, { emoji: '❓', name: '疑问' }, { emoji: '💡', name: '想法' },
    { emoji: '🎯', name: '目标' }, { emoji: '📋', name: '任务' }, { emoji: '📌', name: '固定' },
    { emoji: '⭐', name: '星标' }, { emoji: '🔥', name: '热门' }, { emoji: '💯', name: '满分' },
    { emoji: '✨', name: '闪光' }, { emoji: '🎉', name: '庆祝' }, { emoji: '🚀', name: '启动' },
    { emoji: '💪', name: '力量' }
  ]);
// 将模块内定义的图标暴露到 window，兼容非模块脚本读取（createToolbarIconGrid）
try { window.availableIcons = availableIcons; } catch (e) { /* ignore */ }

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
  console.log("进入函数：showAutoUpdateIndicator");
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
try {
  // 将模块内的关键方法暴露到 window，便于 mindmap.html 直接调用
  if (typeof window !== 'undefined') {
    window.refreshAllNotesDisplay = window.refreshAllNotesDisplay || (typeof refreshAllNotesDisplay === 'function' ? refreshAllNotesDisplay : undefined);
    window.saveToLocalStorage = window.saveToLocalStorage || (typeof saveToLocalStorage === 'function' ? saveToLocalStorage : undefined);
    window.showAutoUpdateIndicator = window.showAutoUpdateIndicator || (typeof showAutoUpdateIndicator === 'function' ? showAutoUpdateIndicator : undefined);
    window.debouncedSave = window.debouncedSave || (typeof debouncedSave === 'function' ? debouncedSave : undefined);
    window.showNodeDetails = window.showNodeDetails || (typeof showNodeDetails === 'function' ? showNodeDetails : undefined);
    try {
      console.debug('[MW][core] expose funcs', {
        refreshAllNotesDisplay: typeof window.refreshAllNotesDisplay,
        saveToLocalStorage: typeof window.saveToLocalStorage,
        showAutoUpdateIndicator: typeof window.showAutoUpdateIndicator,
        debouncedSave: typeof window.debouncedSave,
        showNodeDetails: typeof window.showNodeDetails
      });
    } catch (e) { /* ignore */ }
  }
} catch (e) {
  try { console.warn('[MW][core] expose funcs failed', e); } catch (_) { }
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
    selected.notes = newNotes;
    hasChanges = true;
    // 如果备注有变化，需要调用update_node来触发视图更新（包括备注图标）
    jm.update_node(selected.id, selected.topic);
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

  // 记录历史记录（仅在非撤销/重做恢复期间，且不在文本框编辑中）
  if (window.undoManager && !window.undoManager.isRestoring) {
    // 检查当前是否正在编辑文本框，如果是，则不记录历史（让文本框的blur事件处理）
    const activeElement = document.activeElement;
    const isEditingTextarea = activeElement && (
      activeElement.id === 'nodeNotes' ||
      activeElement.id === 'nodeTopic'
    );

    if (!isEditingTextarea) {
      try {
        window.undoManager.recordIfChanged();
      } catch (e) {
        console.warn('记录历史记录失败:', e);
      }
    }
  }

  // 使用轻量的面板内提示代替全局通知
  try { showAutoUpdateIndicator(); } catch (e) { try { showSuccess('节点更新成功！'); } catch (e2) { } }
}

// 刷新所有备注显示
function refreshAllNotesDisplay() {
  console.log("进入函数：refreshAllNotesDisplay");
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
    // 注意：不再直接 return —— 继续执行后续绑定以支持移动端的空格+拖拽与单指拖拽交互
  }

  const container = document.getElementById('fullScreenMindmap');
  if (!container) return;

  // 在 jsmind 内部容器内绘制框选矩形，确保坐标与滚动一致
  const inner = container.querySelector('.jsmind-inner') || container;
  // 使容器可聚焦，确保在 iframe 中可接收空格键
  inner.setAttribute('tabindex', '0');
  inner.style.outline = 'none';
  // 精确的聚焦策略：
  // - 不在 mouseenter/mousedown 时聚焦，避免划过或未完成交互时抢走焦点
  // - 在真实 click 时聚焦（用户明确点击）
  // - 支持 Space + 指针在画布上的平移聚焦体验（按空格且指针在画布上时聚焦）
  (function () {
    let lastPointerOverCanvas = false;
    // pointer 进入/离开画布，维护指针是否在画布上
    inner.addEventListener('pointerover', () => { lastPointerOverCanvas = true; });
    inner.addEventListener('pointerout', () => { lastPointerOverCanvas = false; });

    // 真实点击时聚焦（前置 guard：若输入捕获中则跳过）
    inner.addEventListener('click', (e) => {
      try {
        if (window.__mw_input_focus_guard && window.__mw_input_focus_guard.installed && window.__mw_input_focus_guard.capturing) return;
      } catch (err) { }
      try { inner.focus({ preventScroll: true }); } catch (err) { }
    });

    // 已移除按空格聚焦画布的功能：画布只在点击时聚焦，按空格不再触发聚焦或启用画布拖拽。
    // window.addEventListener('keydown', onKeyDown, true);
    // window.addEventListener('keyup', onKeyUp, true);
    // 清理（页面卸载时）— 无需移除空间键相关监听器（因未注册）
    window.addEventListener('beforeunload', function () {
      try {
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
      } catch (e) { }
    }, { passive: true });
  })();
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

    // 更新AI快捷操作按钮的可见性
    updateAIQuickActionsVisibility();

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

  // 检查是否为单选状态（只有一个节点被选中，且不是多选模式）
  function isSingleSelection() {
    // 如果多选集合中有且仅有一个节点，认为是单选
    if (multiSelected.size === 1) {
      return true;
    }

    // 如果多选集合为空，检查jsMind的单选状态
    if (multiSelected.size === 0) {
      const selectedNode = (window.jm && typeof jm.get_selected_node === 'function') ? jm.get_selected_node() : null;
      return selectedNode !== null;
    }

    // 多选模式下返回false
    return false;
  }

  // 更新AI快捷操作按钮的可见性
  function updateAIQuickActionsVisibility() {
    const aiQuickActions = document.getElementById('aiQuickActions');
    if (!aiQuickActions) return;

    const buttons = aiQuickActions.querySelectorAll('button');
    const isSingleSelect = isSingleSelection();

    buttons.forEach(button => {
      const onclick = button.getAttribute('onclick');
      // 只控制特定的按钮：创建子级、创建同级、扩写备注、修改、删除
      if (onclick && (
        onclick.includes('aiCreateChild()') ||
        onclick.includes('aiCreateSibling()') ||
        onclick.includes('aiExpandNotes()') ||
        onclick.includes('quickModifyNode()') ||
        onclick.includes('quickDeleteNode()')
      )) {
        button.style.display = isSingleSelect ? 'inline-block' : 'none';
      }
      // 生成初始树按钮（迷你模式）不受控制，始终显示
    });
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
      // 不再因点击空白而隐藏详情面板；若开关为开，则显示“请选择一个节点”提示
      try {
        if (window.__nodeDetailsEnabled !== false && typeof window.showEmptyDetailsPrompt === 'function') {
          try { console.log('[MW][details] blank-click -> window.showEmptyDetailsPrompt()'); } catch (e) { }
          window.showEmptyDetailsPrompt();
        } else {
          try { console.log('[MW][details] blank-click -> skip empty (enabled=', window.__nodeDetailsEnabled, ', fn=', typeof window.showEmptyDetailsPrompt, ')'); } catch (e) { }
        }
      } catch (e) { }
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
        try { console.log('[MW][details] ENTER BATCH DRAG via mousedown', { selectedCount: multiSelected.size, selectedNodes: Array.from(multiSelected).slice(0, 10) }); } catch (e) { }
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
      const threshold = 14; // px 阈值（提高以减少误触；原为10）
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
          try { console.log('[MW][details] ENTER BATCH DRAG via pendingSingleSelect (mousemove)', { pendingId: pendingSingleSelectId, selectedCount: multiSelected.size }); } catch (e) { }
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
      if (type === window.jsMind.event_type.move_node) {
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
      if (type === 'drag_start' || type === window.jsMind.event_type.drag_start) {
        if (multiSelected && multiSelected.size > 0) {
          // 只有在批量拖拽锁定未激活时才阻止拖拽
          if (!window.__batchDragLocked) {
            return false; // 阻止拖拽
          }
        }
      }

      // 监听节点选择变化（可能表示拖拽结束）
      if (type === window.jsMind.event_type.select_node || type === window.jsMind.event_type.select_clear) {
        if (isDraggingNode) {
          setTimeout(() => {
            isDraggingNode = false;
          }, 100);
        }
        // 更新AI快捷操作按钮可见性
        updateAIQuickActionsVisibility();
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
        let viewportState = null;
        try {
          viewportState = window.MW_saveViewport ? window.MW_saveViewport() : saveViewport();
        } catch (e) { }
        ids.filter(id => id && id !== 'root').forEach(id => {
          try { jm.remove_node(id); } catch (err) { }
        });
        if (typeof window.clearMultiSelection === 'function') window.clearMultiSelection();
        if (typeof debouncedSave === 'function') debouncedSave();
        // 延迟恢复视口，等DOM与jsMind重建完成
        setTimeout(function () {
          try {
            if (window.MW_restoreViewport && viewportState) {
              window.MW_restoreViewport(viewportState);
            } else {
              restoreViewport();
            }
          } catch (e) { }
        }, 160);
      }
    }
  }, true);

  // 复制功能（Ctrl+C）- 复制选中的节点及其子级
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      // 检查是否正在编辑节点详情（节点主题或备注输入框）或内联编辑器
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.id === 'nodeTopic' ||
        activeElement.id === 'nodeNotes' ||
        (activeElement.tagName && activeElement.tagName.toLowerCase() === 'textarea' &&
          (activeElement.closest('#nodeDetails') || activeElement.closest('.node-details-panel'))) ||
        (activeElement.tagName && activeElement.tagName.toLowerCase() === 'input' &&
          activeElement.classList && activeElement.classList.contains('jsmind-editor'))
      )) {
        // 如果在节点详情编辑模式或内联编辑模式下，允许默认的文本复制行为
        console.log('[复制] 检测到编辑模式，跳过节点复制，允许文本复制');
        return;
      }

      // 检查是否有选中的节点
      const selectedNodes = window.getMultiSelection ? window.getMultiSelection() : [];
      const currentNode = window.jm && window.jm.get_selected_node ? window.jm.get_selected_node() : null;

      // 如果有选中节点（多选或单选）
      if ((Array.isArray(selectedNodes) && selectedNodes.length > 0) || currentNode) {
        e.preventDefault();
        e.stopPropagation();

        try {
          // 获取要复制的节点列表
          const nodesToCopy = [];

          if (Array.isArray(selectedNodes) && selectedNodes.length > 0) {
            // 多选模式：复制所有选中的节点
            selectedNodes.forEach(nodeId => {
              if (nodeId && nodeId !== 'root') {
                const node = window.jm.get_node(nodeId);
                if (node) {
                  nodesToCopy.push(node);
                }
              }
            });
          } else if (currentNode && currentNode.id !== 'root') {
            // 单选模式：复制当前选中的节点
            nodesToCopy.push(currentNode);
          }

          if (nodesToCopy.length === 0) {
            console.log('[复制] 没有有效的节点可复制');
            return;
          }

          // 使用getNodeTreeRecursive获取每个节点及其子级的完整数据
          const copiedData = [];
          nodesToCopy.forEach(node => {
            const nodeTree = getNodeTreeRecursive(node, true);
            if (nodeTree) {
              copiedData.push(nodeTree);
            }
          });

          if (copiedData.length > 0) {
            // 存储复制的数据到全局变量
            window.MW.copiedNodes = copiedData;
            window.MW.copyTimestamp = Date.now();

            // 同时复制到系统剪贴板（便于调试和外部使用）
            const clipboardText = JSON.stringify(copiedData, null, 2);
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(clipboardText).then(() => {
                console.log(`[复制] 成功复制 ${copiedData.length} 个节点到剪贴板`);
                if (window.showSuccess) {
                  showSuccess(`已复制 ${copiedData.length} 个节点`);
                }
              }).catch(err => {
                console.warn('[复制] 复制到系统剪贴板失败:', err);
                console.log('[复制] 复制的节点数据:', clipboardText);
                if (window.showSuccess) {
                  showSuccess(`已复制 ${copiedData.length} 个节点（无法访问系统剪贴板）`);
                }
              });
            } else {
              // 降级方案：显示在控制台
              console.log('[复制] 复制的节点数据:', clipboardText);
              if (window.showSuccess) {
                showSuccess(`已复制 ${copiedData.length} 个节点`);
              }
            }
          } else {
            console.warn('[复制] 未能获取节点数据');
          }
        } catch (error) {
          console.error('[复制] 复制节点失败:', error);
          if (window.showError) {
            showError('复制节点失败');
          }
        }
      }
    }
  }, true);

  // 剪切功能（Ctrl+X）- 复制并删除选中的节点
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {

      // 检查是否正在编辑节点详情（节点主题或备注输入框）或内联编辑器
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.id === 'nodeTopic' ||
        activeElement.id === 'nodeNotes' ||
        (activeElement.tagName && activeElement.tagName.toLowerCase() === 'textarea' &&
          (activeElement.closest('#nodeDetails') || activeElement.closest('.node-details-panel'))) ||
        (activeElement.tagName && activeElement.tagName.toLowerCase() === 'input' &&
          activeElement.classList && activeElement.classList.contains('jsmind-editor'))
      )) {
        // 如果在节点详情编辑模式或内联编辑模式下，允许默认的文本剪切行为
        console.log('[剪切‘] 检测到编辑模式，跳过节点剪切，允许文本剪切');
        return;
      }


      // 获取选中的节点
      const selectedNodes = window.getMultiSelection ? window.getMultiSelection() : [];
      const singleNode = window.jm && window.jm.get_selected_node ? window.jm.get_selected_node() : null;

      let nodesToCut = [];

      if (selectedNodes && selectedNodes.length > 0) {
        // 使用多选节点
        nodesToCut = selectedNodes;
      } else if (singleNode && singleNode.id && singleNode.id !== 'root') {
        // 使用单选节点（排除根节点）
        nodesToCut = [singleNode.id];
      }

      if (nodesToCut.length === 0) {
        console.log('[剪切] 没有选中的节点');
        if (window.showWarning) {
          showWarning('请先选择要剪切的节点');
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      try {
        console.log(`[剪切] 开始剪切 ${nodesToCut.length} 个节点`);

        // 第一步：复制节点（复用复制功能的逻辑）
        const copiedNodes = [];

        nodesToCut.forEach(nodeId => {
          const node = window.jm.get_node(nodeId);
          if (node && node.id) {
            const nodeData = getNodeTreeRecursive(node);
            copiedNodes.push(nodeData);
            console.log(`[剪切] 复制节点: ${node.topic}`);
          }
        });

        if (copiedNodes.length === 0) {
          console.warn('[剪切] 没有成功复制任何节点');
          if (window.showError) {
            showError('剪切节点失败');
          }
          return;
        }

        // 将复制的节点存储到全局变量
        window.MW.copiedNodes = copiedNodes;
        window.MW.copyTimestamp = Date.now();

        // 第二步：删除原节点
        let deletedCount = 0;
        nodesToCut.forEach(nodeId => {
          if (nodeId && nodeId !== 'root') {
            try {
              window.jm.remove_node(nodeId);
              deletedCount++;
              console.log(`[剪切] 删除原节点: ${nodeId}`);
            } catch (error) {
              console.error(`[剪切] 删除节点失败: ${nodeId}`, error);
            }
          }
        });

        console.log(`[剪切] 成功剪切 ${deletedCount} 个节点`);
        if (window.showSuccess) {
          showSuccess(`成功剪切 ${deletedCount} 个节点`);
        }

        // 清除多选状态
        if (typeof window.clearMultiSelection === 'function') {
          window.clearMultiSelection();
        }

        // 触发保存
        if (typeof debouncedSave === 'function') {
          debouncedSave();
        }

      } catch (error) {
        console.error('[剪切] 剪切过程失败:', error);
        if (window.showError) {
          showError('剪切节点失败');
        }
      }
    }
  }, true);

  // 粘贴功能（Ctrl+V）- 将复制的节点插入到目标节点下
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      // 检查是否正在编辑节点详情（节点主题或备注输入框）或内联编辑器
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.id === 'nodeTopic' ||
        activeElement.id === 'nodeNotes' ||
        (activeElement.tagName && activeElement.tagName.toLowerCase() === 'textarea' &&
          (activeElement.closest('#nodeDetails') || activeElement.closest('.node-details-panel'))) ||
        (activeElement.tagName && activeElement.tagName.toLowerCase() === 'input' &&
          activeElement.classList && activeElement.classList.contains('jsmind-editor'))
      )) {
        // 如果在节点详情编辑模式或内联编辑模式下，允许默认的文本粘贴行为
        console.log('[粘贴] 检测到编辑模式，跳过节点粘贴，允许文本粘贴');
        return;
      }

      // 检查是否有复制的数据
      if (!window.MW.copiedNodes || !Array.isArray(window.MW.copiedNodes) || window.MW.copiedNodes.length === 0) {
        console.log('[粘贴] 没有可复制的数据');
        if (window.showWarning) {
          showWarning('请先复制节点');
        }
        return;
      }

      // 获取目标节点（当前选中的节点）
      const targetNode = window.jm && window.jm.get_selected_node ? window.jm.get_selected_node() : null;
      if (!targetNode || !targetNode.id) {
        console.log('[粘贴] 没有选中的目标节点');
        if (window.showWarning) {
          showWarning('请先选择要粘贴到的目标节点');
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();


      try {
        console.log(`[粘贴] 开始粘贴 ${window.MW.copiedNodes.length} 个节点到目标节点: ${targetNode.topic}`);

        // 保存视口以便粘贴后恢复位置
        let viewportState = null;
        try {
          viewportState = window.MW_saveViewport ? window.MW_saveViewport() : saveViewport();
        } catch (e) { }

        let pastedCount = 0;

        // 遍历所有要粘贴的节点
        window.MW.copiedNodes.forEach((nodeData, index) => {
          try {
            // 为复制的节点生成新的ID（避免重复）
            const generateNewId = (originalId) => {
              if (!originalId) return 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              return originalId + '_copy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            };

            // 递归更新节点树中的所有ID
            const updateNodeIds = (node) => {
              if (node && node.id) {
                node.id = generateNewId(node.id);
              }
              if (node.children && Array.isArray(node.children)) {
                node.children.forEach(child => updateNodeIds(child));
              }
            };

            // 创建节点数据的深拷贝并更新ID
            const copiedNodeData = JSON.parse(JSON.stringify(nodeData));
            updateNodeIds(copiedNodeData);

            // 使用insertNodeTreeChildren插入节点树
            if (typeof insertNodeTreeChildren === 'function') {
              // 构建完整的节点树对象（包含当前节点及其子节点）
              const nodeTree = {
                topic: copiedNodeData.topic,
                notes: copiedNodeData.notes,
                data: copiedNodeData.data,
                children: copiedNodeData.children || []
              };

              // 插入节点及其子节点
              insertNodeTreeChildren(targetNode.id, nodeTree, 'paste_' + Date.now());
              pastedCount++;
              console.log(`[粘贴] 成功粘贴节点: ${copiedNodeData.topic}`);
            } else {
              // 降级方案：直接添加节点
              const newNodeId = generateNewId(copiedNodeData.id);
              window.jm.add_node(targetNode.id, newNodeId, copiedNodeData.topic);

              // 如果有备注，设置备注
              if (copiedNodeData.notes) {
                const newNode = window.jm.get_node(newNodeId);
                if (newNode) {
                  newNode.notes = copiedNodeData.notes;
                }
              }

              pastedCount++;
              console.log(`[粘贴] 使用降级方案粘贴节点: ${copiedNodeData.topic}`);
            }
          } catch (error) {
            console.error(`[粘贴] 粘贴节点失败（索引 ${index}）:`, error);
          }
        });

        if (pastedCount > 0) {
          console.log(`[粘贴] 成功粘贴 ${pastedCount} 个节点`);
          if (window.showSuccess) {
            showSuccess(`成功粘贴 ${pastedCount} 个节点`);
          }

          // 触发保存
          if (typeof debouncedSave === 'function') {
            debouncedSave();
          }

          // 延迟恢复视口，等DOM更新完成
          setTimeout(function () {
            try {
              if (window.MW_restoreViewport && viewportState) {
                window.MW_restoreViewport(viewportState);
              } else {
                restoreViewport();
              }
              // 可选：选中第一个粘贴的节点
              // 由于ID已变更，这里不自动选中新节点
            } catch (e) {
              console.warn('[粘贴] 恢复视口失败:', e);
            }
          }, 160);
        } else {
          console.warn('[粘贴] 没有成功粘贴任何节点');
          if (window.showError) {
            showError('粘贴节点失败');
          }
        }

      } catch (error) {
        console.error('[粘贴] 粘贴过程失败:', error);
        if (window.showError) {
          showError('粘贴节点失败');
        }
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
    // 临时调试：当变为 false 时打印调用栈与关键信息，便于定位是谁/何时关闭编辑模式
    if (!isEditing) {
      try {
      } catch (e) { /* ignore logging errors */ }
    }

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
          "id": "node_1",
          "topic": "第一层节点",
          "direction": "right",
          "children": [
            {
              "id": "node_2",
              "topic": "第二层节点A",
              "data": {
                "notes": "这是第二层节点A的备注"
              },
              "children": [
                {
                  "id": "node_3",
                  "topic": "第三层节点A1",
                  "data": {
                    "notes": "这是第三层节点A1的备注"
                  },
                  "children": [
                    {
                      "id": "node_4",
                      "topic": "第四层节点A1-1",
                      "data": {
                        "notes": "这是第四层节点A1-1的备注"
                      }
                    },
                    {
                      "id": "node_5",
                      "topic": "第四层节点A1-2",
                      "data": {
                        "notes": "这是第四层节点A1-2的备注"
                      }
                    }
                  ]
                },
                {
                  "id": "node_6",
                  "topic": "第三层节点A2",
                  "data": {
                    "notes": "这是第三层节点A2的备注"
                  }
                }
              ]
            },
            {
              "id": "node_7",
              "topic": "第二层节点B",
              "data": {
                "notes": "这是第二层节点B的备注"
              },
              "children": [
                {
                  "id": "node_8",
                  "topic": "第三层节点B1",
                  "data": {
                    "notes": "这是第三层节点B1的备注"
                  }
                }
              ]
            }
          ]
        },
        {
          "id": "node_9",
          "topic": "第一层右侧节点",
          "direction": "right",
          "data": {
            "notes": "这是第一层右侧节点的备注"
          }
        }
      ]
    }
  };
}

// 保存当前数据到localStorage
function isDefaultNodeTreeData(nodeTreeData) {
  try {
    var root = nodeTreeData && nodeTreeData.data ? nodeTreeData.data : nodeTreeData;
    if (!root || root.topic !== '欢迎使用思维导图') return false;
    var children = Array.isArray(root.children) ? root.children : [];
    var hasLeft = children.some(function (node) { return node && node.topic === '第一层节点'; });
    var hasRight = children.some(function (node) { return node && node.topic === '第一层右侧节点'; });
    return hasLeft && hasRight;
  } catch (e) {
    return false;
  }
}

function hasRealMarkdownCache() {
  try {
    var md = localStorage.getItem('mindword_markdown_data') || '';
    if (!md.trim()) return false;
    return md.indexOf('欢迎使用思维导图') === -1 ||
      md.indexOf('第一层节点') === -1 ||
      md.indexOf('第一层右侧节点') === -1;
  } catch (e) {
    return false;
  }
}

function saveToLocalStorage() {
  console.log('进入函数：saveToLocalStorage');



  if (!jm) return;

  try {
    var currentForGuard = jm.get_data();
    if ((window.__mw_showingDefaultNodeTree || isDefaultNodeTreeData(currentForGuard)) && hasRealMarkdownCache()) {
      console.warn('[MW] blocked default sample mindmap from overwriting current markdown');
      return;
    }
  } catch (e) {
    console.warn('[MW] default sample overwrite guard failed:', e);
  }

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

  // 在下钻模式下，始终同步完整数据
  let currentData;
  if (window.viewStateManager && window.viewStateManager.isInDrillDownMode() && window.viewStateManager.originalData) {
    currentData = window.viewStateManager.originalData;
  } else {
    currentData = jm.get_data();
  }
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

    // 只有在非撤销/重做恢复期间才调用recordIfChanged
    if (window.undoManager && !window.undoManager.isRestoring) {
      try {
        if (typeof window.undoManager.recordIfChanged === 'function') {
          window.undoManager.recordIfChanged();
        }
      } catch (e) {
        // 忽略记录错误
      }
    }

    // 如果当前是在恢复状态，保存完成后重置标志
    if (window.undoManager && window.undoManager.isRestoring) {
      console.log('[debouncedSave] 恢复期间的保存完成，重置isRestoring标志');
      window.undoManager.isRestoring = false;
    }
  }, 0);
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

  // 如果节点已经有显式的类型信息（从原始数据中保存的），且与参考类型不同，优先保留原始类型
  // 这确保 AI 生成的列表节点不会被错误地转换为标题节点
  const hasExplicitType = (node.data && node.data.type !== undefined) ||
    (node.data && node.data.data && node.data.data.type !== undefined) ||
    (node.type !== undefined);

  if (hasExplicitType && curType !== undefined && curType !== refType) {
    // 节点已有显式类型且与参考类型不同，保留原始类型，不覆盖
    return;
  }

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
      window.jsMind.event_type.edit,
      window.jsMind.event_type.add_node,
      window.jsMind.event_type.remove_node,
      window.jsMind.event_type.move_node,
      window.jsMind.event_type.move
    ];

    if (saveEvents.includes(type)) {
      // 专门处理 move_node：用事件返回的 [nodeId, beforeId, parentId, direction] 先强制重挂载，再归一/保存
      try {
        if (type === window.jsMind.event_type.move_node && data && Array.isArray(data.data) && data.data.length >= 3) {
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

  // 使用setInterval定期检查变化（每1000ms检查一次，减少性能开销）
  setInterval(checkLocalStorageChange, 1000);

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
/**
 * PNG下载管理函数
 * @param {string} action - 操作类型: 'show' 显示模态框, 'close' 关闭模态框, 'confirm' 确认下载
 */
function handlePNGDownload(action) {
  switch (action) {
    case 'show':
      if (!jm) return;
      showPNGDownloadModal();
      break;

    case 'close':
      const modal = document.getElementById('pngDownloadModal');
      if (modal) {
        modal.remove();
      }
      break;

    case 'copy':
      handlePNGDownload('process', true); // true表示复制模式
      break;

    case 'download':
      handlePNGDownload('process', false); // false表示下载模式
      break;

    case 'process':
      const isCopyMode = arguments[1];
      processPNGDownload(isCopyMode);
      break;

    case 'confirm': // 保留旧的confirm case以保持兼容性
      processPNGDownload(false);
      break;
  }
}

/**
 * 获取当前主题的背景色
 * @returns {string} 主题背景色值
 */
function getCurrentThemeBackgroundColor() {
  // 获取当前主题
  const currentTheme = document.body.getAttribute('data-mindmap-theme') || 'primary';

  // 主题背景色映射
  const themeBackgrounds = {
    'primary': '#f8f9fa',        // 经典蓝 - 浅灰背景
    'modern-minimal': '#ffffff',  // 现代极简 - 白色背景
    'dark': '#1e1e1e',           // 深色模式 - 深灰背景
    'colorful': '#fafbfc',       // 彩虹多彩 - 浅蓝灰背景
    'warm': '#faf8f5',           // 暖色调 - 暖米色背景
    'forest': '#f5f9f5'          // 森林绿 - 浅绿背景
  };

  // 尝试从实际 DOM 元素获取背景色
  const mindmapInner = document.querySelector('.jsmind-inner');
  if (mindmapInner) {
    const computedStyle = window.getComputedStyle(mindmapInner);
    const bgColor = computedStyle.backgroundColor;
    // 如果获取到有效的背景色（不是透明），则使用它
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return bgColor;
    }
  }

  // 返回映射的背景色，如果没有找到则返回默认白色
  return themeBackgrounds[currentTheme] || '#ffffff';
}

function processPNGDownload(isCopyMode) {
  const bgColor = document.querySelector('input[name="bgColor"]:checked').value;
  const isFilledBackground = bgColor === 'filled';
  const filenameInput = document.getElementById('pngFilename');
  const filename = filenameInput ? filenameInput.value.trim() || '思维导图' : '思维导图';
  const showWatermark = document.getElementById('showWatermark') ? document.getElementById('showWatermark').checked : true;
  const nodeScope = document.querySelector('input[name="nodeScope"]:checked').value;
  const screenshotMode = nodeScope === 'all' ? 'all' : 'visible';

  try {
    // 设置背景色
    if (jm.screenshot && typeof jm.screenshot.setBackgroundColor === 'function') {
      if (isFilledBackground) {
        // 获取当前主题的背景色
        const themeBgColor = getCurrentThemeBackgroundColor();
        jm.screenshot.setBackgroundColor(themeBgColor);
      } else {
        // 透明背景
        jm.screenshot.setBackgroundColor(false);
      }
    } else if (jm.screenshot && typeof jm.screenshot.setWhiteBackground === 'function') {
      // 兼容旧版本
      jm.screenshot.setWhiteBackground(false);
    }

    if (showWatermark) {
      // 如果需要水印，先获取截图数据，然后添加水印
      if (jm.screenshot && typeof jm.screenshot.shootAsDataURL === 'function') {
        jm.screenshot.shootAsDataURL(function (dataUrl) {
          if (dataUrl) {
            if (isCopyMode) {
              // 复制模式：先添加水印再复制
              addWatermarkToImage(dataUrl, function (error, watermarkedDataUrl) {
                if (error) {
                  console.error('添加水印失败:', error);
                  // 如果水印添加失败，仍然复制原图
                  copyImageToClipboard(dataUrl);
                } else {
                  copyImageToClipboard(watermarkedDataUrl);
                }
              });
            } else {
              downloadWatermarkedImage(dataUrl, filename + '.png');
            }
          } else {
            alert('截图失败，请重试');
          }
        }, screenshotMode);
      } else {
        console.warn('截图插件不支持获取DataURL，使用普通下载');
        // 降级处理：使用普通下载
        if (jm.screenshot && typeof jm.screenshot.shootDownload === 'function') {
          if (isCopyMode) {
            alert('复制功能需要浏览器支持，请使用下载功能');
          } else {
            jm.screenshot.shootDownload(filename + '.png', screenshotMode);
          }
        }
      }
    } else {
      // 不需要水印，直接处理
      if (jm.screenshot && typeof jm.screenshot.shootAsDataURL === 'function') {
        jm.screenshot.shootAsDataURL(function (dataUrl) {
          if (dataUrl) {
            if (isCopyMode) {
              copyImageToClipboard(dataUrl);
            } else {
              downloadImage(dataUrl, filename + '.png');
            }
          } else {
            alert('截图失败，请重试');
          }
        }, screenshotMode);
      } else {
        console.warn('截图插件未正确加载或API不兼容');
        alert('处理失败，截图插件未正确加载');
      }
    }
  } catch (error) {
    console.error('下载思维导图失败:', error);
    alert('下载失败，请检查浏览器控制台了解详情');
  }

  handlePNGDownload('close');
}


// 添加水印到图片
function addWatermarkToImage(dataUrl, callback) {
  const img = new Image();
  const watermarkImg = new Image();

  img.onload = function () {
    watermarkImg.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 设置画布尺寸与原图相同
        canvas.width = img.width;
        canvas.height = img.height;

        // 绘制原图
        ctx.drawImage(img, 0, 0);

        // 计算水印尺寸（原图的1/8宽度，保持比例）
        const watermarkWidth = Math.max(100, img.width / 8);
        const watermarkHeight = (watermarkImg.height * watermarkWidth) / watermarkImg.width;

        // 设置水印位置（左上角，留边距）
        const padding = 20;
        const x = padding;
        const y = padding;

        // 绘制水印（带轻微透明度）
        ctx.globalAlpha = 0.8;
        ctx.drawImage(watermarkImg, x, y, watermarkWidth, watermarkHeight);
        ctx.globalAlpha = 1.0;

        // 转换为data URL
        const resultDataUrl = canvas.toDataURL('image/png');
        callback(null, resultDataUrl);
      } catch (error) {
        callback(error);
      }
    };

    watermarkImg.onerror = function () {
      callback(new Error('水印图片加载失败'));
    };

    // 设置水印图片源
    watermarkImg.src = '/res/MindWord二维码.png';
  };

  img.onerror = function () {
    callback(new Error('截图图片加载失败'));
  };

  img.src = dataUrl;
}

// 下载带水印的图片
function downloadWatermarkedImage(dataUrl, filename) {
  addWatermarkToImage(dataUrl, function (error, watermarkedDataUrl) {
    if (error) {
      console.error('添加水印失败:', error);
      // 如果水印添加失败，仍然下载原图
      downloadImage(dataUrl, filename);
      return;
    }

    downloadImage(watermarkedDataUrl, filename);
  });
}

// 复制图片到剪切板
function copyImageToClipboard(dataUrl) {
  try {
    // 确保文档有焦点（剪贴板API需要）
    if (!document.hasFocus()) {
      window.focus();
      document.body.focus();
    }

    // 将dataUrl转换为blob
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        // 创建ClipboardItem
        const item = new ClipboardItem({ 'image/png': blob });
        // 写入剪切板
        navigator.clipboard.write([item]).then(() => {
          alert('图片已复制到剪切板');
        }).catch(err => {
          console.error('复制到剪切板失败:', err);
          // 如果是权限错误，给出更友好的提示
          if (err.name === 'NotAllowedError') {
            alert('复制失败：请确保页面处于激活状态，或尝试点击页面后再复制');
          } else {
            alert('复制失败，请检查浏览器权限或使用下载功能');
          }
        });
      })
      .catch(err => {
        console.error('转换图片失败:', err);
        alert('图片处理失败，请使用下载功能');
      });
  } catch (error) {
    console.error('复制图片失败:', error);
    alert('复制功能不可用，请使用下载功能');
  }
}

// 下载图片（通用的图片下载函数）
function downloadImage(dataUrl, filename) {
  try {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('下载图片失败:', error);
    alert('下载失败，请检查浏览器控制台了解详情');
  }
}

// 显示PNG下载设置模态框
function showPNGDownloadModal() {
  // 获取根节点名称作为默认文件名
  let defaultFilename = '思维导图';
  if (jm && jm.get_root && jm.get_root()) {
    const rootNode = jm.get_root();
    if (rootNode && rootNode.topic) {
      defaultFilename = rootNode.topic.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50); // 清理非法字符，限制长度
    }
  }

  const modalHtml = `
    <div id="pngDownloadModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 8px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0; font-size: 18px; color: #333;">PNG下载设置</h3>
          <button onclick="handlePNGDownload('close')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">×</button>
        </div>
        
        <div style="margin-bottom: 16px; display: flex; align-items: center;">
          <label style="font-weight: 500; color: #555; min-width: 80px; margin-right: 12px;">文件名：</label>
          <input type="text" id="pngFilename" value="${defaultFilename}" placeholder="请输入文件名" style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 16px; display: flex; align-items: center;">
          <label style="font-weight: 500; color: #555; min-width: 80px; margin-right: 12px;">背景色：</label>
          <div style="display: flex; gap: 12px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="radio" name="bgColor" value="transparent" style="margin-right: 6px;">
              <span>透明背景</span>
            </label>
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="radio" name="bgColor" value="filled" checked style="margin-right: 6px;">
              <span>填充背景</span>
            </label>
          </div>
        </div>
        
        <div style="margin-bottom: 16px; display: flex; align-items: center;">
          <label style="font-weight: 500; color: #555; min-width: 80px; margin-right: 12px;">节点范围：</label>
          <div style="display: flex; gap: 12px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="radio" name="nodeScope" value="visible" checked style="margin-right: 6px;">
              <span>仅可见节点</span>
            </label>
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="radio" name="nodeScope" value="all" style="margin-right: 6px;">
              <span>全部节点</span>
            </label>
          </div>
        </div>
        
        <div style="margin-bottom: 24px; display: flex; align-items: center;">
          <label style="font-weight: 500; color: #555; min-width: 80px; margin-right: 12px;">水印：</label>
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="showWatermark" style="margin-right: 6px;">
            <span>显示水印</span>
          </label>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="handlePNGDownload('close')" style="padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; font-size: 14px;">取消</button>
          <button onclick="handlePNGDownload('copy')" style="padding: 8px 16px; border: 1px solid #4c9aff; background: white; color: #4c9aff; border-radius: 4px; cursor: pointer; font-size: 14px;">复制图片</button>
          <button onclick="handlePNGDownload('download')" style="padding: 8px 16px; border: none; background: #4c9aff; color: white; border-radius: 4px; cursor: pointer; font-size: 14px;">下载</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}
// 暴露PNG下载相关函数到全局作用域
try {
  window.downloadMindmap = () => handlePNGDownload('show');
  window.handlePNGDownload = handlePNGDownload;
} catch (e) { /* ignore */ }



// 页面加载完成后初始化
/* === 全局输入域指针捕获与焦点保留补丁（确保从输入内部拖出到外部时不丢失焦点） ===
   插入位置：在 window.load 回调前注入 installGlobalPointerFocusGuard() 并在 load 时调用。
   原理：
   - 在 editable 元素上用 pointerdown 捕获指针（优先），降级到 mouse/touch；
   - 在捕获期间拦截外部 pointerdown/focusin 防止其它元素抢占焦点；
   - pointerup/mouseup/touchend 时恢复焦点并释放捕获；
*/
(function installGlobalPointerFocusGuard() {
  try {
    // 匹配的输入选择器（可按需扩展）
    const EDITABLE_SELECTOR = 'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"], [contenteditable=""], [contenteditable="true"]';

    // 状态
    let activeEl = null;
    let activePointerId = null;
    let capturing = false;
    // 全局可读 guard（确保外部代码随时可检查状态）
    try {
      if (!window.__mw_input_focus_guard) {
        window.__mw_input_focus_guard = { installed: true, capturing: false, activeEl: null };
      } else {
        window.__mw_input_focus_guard.installed = true;
        // 保持已有字段，确保存在 capturing/activeEl
        window.__mw_input_focus_guard.capturing = !!window.__mw_input_focus_guard.capturing;
        window.__mw_input_focus_guard.activeEl = window.__mw_input_focus_guard.activeEl || null;
      }
    } catch (e) { /* ignore */ }

    function isEditable(el) {
      return !!(el && el.matches && el.matches(EDITABLE_SELECTOR));
    }

    function blockExternalPointerDown(ev) {
      if (!capturing) return;
      if (!activeEl) return;
      const target = ev.target;
      if (activeEl.contains(target) || (document.getElementById('nodeDetails') && document.getElementById('nodeDetails').contains(target))) {
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }

    function blockExternalFocusIn(ev) {
      if (!capturing) return;
      if (!activeEl) return;
      const target = ev.target;
      if (activeEl.contains(target) || (document.getElementById('nodeDetails') && document.getElementById('nodeDetails').contains(target))) {
        return;
      }
      // 防止在捕获期间外部元素获得焦点，延迟恢复焦点
      ev.preventDefault();
      ev.stopImmediatePropagation();
      setTimeout(() => { if (capturing && activeEl) try { activeEl.focus({ preventScroll: true }); } catch (e) { } }, 0);
    }

    // 在 editable 元素上开始捕获
    function onPointerDown(e) {
      const el = e.target;
      if (!isEditable(el)) return;
      activeEl = el;
      capturing = true;
      // 同步到全局 guard
      try {

        window.__mw_input_focus_guard.capturing = true;
        window.__mw_input_focus_guard.activeEl = activeEl;
      } catch (err) { /* ignore */ }
      try {
        // 不在可编辑元素上使用指针捕获，以避免影响首次点击的插入点定位
        activePointerId = null;
      } catch (e) { activePointerId = null; }
      // 拦截外部的 pointerdown/focusin（捕获阶段）
      window.addEventListener('pointerdown', blockExternalPointerDown, true);
      window.addEventListener('focusin', blockExternalFocusIn, true);
    }

    function onPointerUp(e) {
      if (!capturing) return;
      try {
        if (activePointerId != null && activeEl && activeEl.releasePointerCapture) {
          try { activeEl.releasePointerCapture(activePointerId); } catch (err) { /* ignore */ }
        }
      } catch (e) { }
      // 尝试把焦点保持/恢复到起始元素（用户可能仍在交互）
      try { if (activeEl && typeof activeEl.focus === 'function') activeEl.focus({ preventScroll: true }); } catch (e) { }
      // 同步到全局 guard：结束捕获
      try {
        if (window.__mw_input_focus_guard) {
          window.__mw_input_focus_guard.capturing = false;
          window.__mw_input_focus_guard.activeEl = null;
        }
      } catch (err) { /* ignore */ }
      capturing = false;
      activeEl = null;
      activePointerId = null;
      window.removeEventListener('pointerdown', blockExternalPointerDown, true);
      window.removeEventListener('focusin', blockExternalFocusIn, true);
    }

    // 降级：鼠标
    function onMouseDown(e) {
      const el = e.target;
      if (!isEditable(el)) return;
      activeEl = el;
      capturing = true;
      // 同步到全局 guard
      try {
        if (!window.__mw_input_focus_guard) window.__mw_input_focus_guard = { installed: true, capturing: false, activeEl: null };
        window.__mw_input_focus_guard.capturing = true;
        window.__mw_input_focus_guard.activeEl = activeEl;
      } catch (err) { /* ignore */ }
      window.addEventListener('mousedown', blockExternalPointerDown, true);
      window.addEventListener('focusin', blockExternalFocusIn, true);

      const onMouseUp = function (upEvent) {
        try {
          if (activeEl && typeof activeEl.focus === 'function') activeEl.focus({ preventScroll: true });
        } catch (e) { }
        // 同步到全局 guard：结束捕获
        try {
          if (window.__mw_input_focus_guard) {
            window.__mw_input_focus_guard.capturing = false;
            window.__mw_input_focus_guard.activeEl = null;
          }
        } catch (err) { /* ignore */ }
        capturing = false;
        activeEl = null;
        window.removeEventListener('mousedown', blockExternalPointerDown, true);
        window.removeEventListener('focusin', blockExternalFocusIn, true);
        document.removeEventListener('mouseup', onMouseUp, true);
      };
      document.addEventListener('mouseup', onMouseUp, true);
    }

    // 降级：触摸
    function onTouchStart(e) {
      const el = e.target;
      if (!isEditable(el)) return;
      activeEl = el;
      capturing = true;
      // 同步到全局 guard
      try {
        if (!window.__mw_input_focus_guard) window.__mw_input_focus_guard = { installed: true, capturing: false, activeEl: null };
        window.__mw_input_focus_guard.capturing = true;
        window.__mw_input_focus_guard.activeEl = activeEl;
      } catch (err) { /* ignore */ }
      window.addEventListener('touchstart', blockExternalPointerDown, true);
      window.addEventListener('focusin', blockExternalFocusIn, true);

      const onTouchEnd = function () {
        try {
          if (activeEl && typeof activeEl.focus === 'function') activeEl.focus({ preventScroll: true });
        } catch (e) { }
        // 同步到全局 guard：结束捕获
        try {
          if (window.__mw_input_focus_guard) {
            window.__mw_input_focus_guard.capturing = false;
            window.__mw_input_focus_guard.activeEl = null;
          }
        } catch (err) { /* ignore */ }
        capturing = false;
        activeEl = null;
        window.removeEventListener('touchstart', blockExternalPointerDown, true);
        window.removeEventListener('focusin', blockExternalFocusIn, true);
        document.removeEventListener('touchend', onTouchEnd, true);
        document.removeEventListener('touchcancel', onTouchEnd, true);
      };
      document.addEventListener('touchend', onTouchEnd, true);
      document.addEventListener('touchcancel', onTouchEnd, true);
    }

    // 全局绑定（事件委托，减少绑定数量）
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('touchstart', onTouchStart, true);

    // 页面卸载时清理
    window.addEventListener('beforeunload', function cleanup() {
      try {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('pointerup', onPointerUp, true);
        document.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('touchstart', onTouchStart, true);
        window.removeEventListener('pointerdown', blockExternalPointerDown, true);
        window.removeEventListener('focusin', blockExternalFocusIn, true);
      } catch (e) { }
    }, { passive: true });

    // 暴露调试接口（可选）
    window.__mw_input_focus_guard = window.__mw_input_focus_guard || {};
    window.__mw_input_focus_guard.installed = true;
  } catch (e) {
    console.warn('[MW] installGlobalPointerFocusGuard failed', e);
  }
})();

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
          if (type === window.jsMind.event_type.select || type === window.jsMind.event_type.select_node) {
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
        let zoom = null;
        try {
          if (window.jm && jm.view && typeof jm.view.actualZoom !== 'undefined') {
            zoom = jm.view.actualZoom;
          }
        } catch (e) { }

        let viewState = null;
        try {
          if (window.viewStateManager) {
            viewState = {
              mode: window.viewStateManager.currentViewMode,
              rootId: window.viewStateManager.currentRootId,
              drillDownHistoryStack: [...window.viewStateManager.drillDownHistoryStack]
            };
          }
        } catch (e) { viewState = null; }

        return {
          scrollTop: inner.scrollTop,
          scrollLeft: inner.scrollLeft,
          zoom: zoom,
          selectedId: selectedId,
          viewState: viewState
        };
      } catch (e) { return null; }
    };
  }
  if (!window.MW_restoreViewport) {
    window.MW_restoreViewport = function (state, opts) {
      try {
        if (!state) return;
        const container = document.getElementById('fullScreenMindmap');
        if (!container) return;
        const inner = container.querySelector('.jsmind-inner') || container;
        try {
          var _avoid = opts && opts.avoidReselect === true;
          if (_avoid) {
            if (window.jm && typeof jm.select_clear === 'function') jm.select_clear();
          }
        } catch (e) { }

        if (state.viewState && window.viewStateManager) {
          try {
            if (state.viewState.mode === 'drilldown' && state.viewState.rootId) {
              const originalData = window.viewStateManager.originalData;
              window.viewStateManager.currentViewMode = state.viewState.mode;
              window.viewStateManager.currentRootId = state.viewState.rootId;
              window.viewStateManager.drillDownHistoryStack = [...state.viewState.drillDownHistoryStack];
              if (originalData) {
                window.viewStateManager.applyFilteredView();
              }
            } else if (state.viewState.mode === 'full') {
              if (window.viewStateManager.currentViewMode !== 'full') {
                window.viewStateManager.returnToFullView(false);
              }
            }
          } catch (e) {
            console.warn('[MW_restoreViewport] restore drilldown failed:', e);
          }
        }

        try {
          if (window.jm && jm.view && state.zoom != null) {
            jm.view.actualZoom = state.zoom;
            var panel = jm.view.e_panel;
            if (panel) {
              for (var i = 0; i < panel.children.length; i++) {
                panel.children[i].style.zoom = state.zoom;
              }
            }
          }
        } catch (e) { console.warn('[MW_restoreViewport] restore zoom failed:', e); }

        try { inner.scrollTop = state.scrollTop || 0; } catch (e) { }
        try { inner.scrollLeft = state.scrollLeft || 0; } catch (e) { }

        requestAnimationFrame(function () {
          try { inner.scrollTop = state.scrollTop || 0; } catch (e) { }
          try { inner.scrollLeft = state.scrollLeft || 0; } catch (e) { }
        });

        const avoidReselect = opts && opts.avoidReselect !== undefined ? opts.avoidReselect : true;
        if (!avoidReselect && state.selectedId && window.jm && typeof jm.get_node === 'function' && jm.get_node(state.selectedId)) {
          try { jm.select_node(state.selectedId); } catch (e) { }
        }
      } catch (e) { console.warn('[MW_restoreViewport] failed:', e); }
    };
  }
  if (!window.MW_preserveViewportAround) {
    window.MW_preserveViewportAround = function (fn, restoreDelayMs, opts) {
      // 保存当前的原始数据引用（如果在下钻模式下）
      let originalData = null;
      if (window.viewStateManager && window.viewStateManager.isInDrillDownMode()) {
        originalData = window.viewStateManager.originalData;
      }

      // 保存视口状态（包含下钻状态）
      const st = window.MW_saveViewport && window.MW_saveViewport();

      try { fn && fn(); } catch (e) { }

      const delay = typeof restoreDelayMs === 'number' ? restoreDelayMs : 100;
      setTimeout(function () {
        try {
          // 如果在下钻模式下，恢复原始数据引用
          if (window.viewStateManager && originalData) {
            window.viewStateManager.originalData = originalData;
          }

          // 恢复视口状态（包含下钻状态）
          window.MW_restoreViewport && window.MW_restoreViewport(st, opts);
        } catch (e) { }
      }, delay);
    };
  }

  // 初始化 UndoManager（如果已注入）
  try {
    if (window.UndoManager && jm) {

      // 构造一个撤销管理器
      window.undoManager = new UndoManager({
        maxCapacity: 10,
        getSnapshot: function () {
          try {
            // 获取当前视图状态
            const viewState = window.viewStateManager ? window.viewStateManager.getCurrentState() : null;

            // 获取思维导图数据
            let mindmapData;
            if (window.viewStateManager && window.viewStateManager.isInDrillDownMode() && window.viewStateManager.originalData) {
              // 在下钻模式下，始终保存完整数据
              mindmapData = window.viewStateManager.originalData;
            } else {
              mindmapData = jm.get_data();
            }

            // 返回包含视图状态的快照
            const snapshot = {
              data: mindmapData,
              viewState: viewState
            };

            return JSON.stringify(snapshot);
          } catch (e) { return null; }
        },
        getCurrentDocumentId: function () {
          // 使用当前活动文档ID，如果没有则使用文件名，最后使用默认
          try {
            return window.localStorage.getItem('mw_active_doc') || window.currentFileName || 'default';
          } catch (e) {
            return 'default';
          }
        },
        restoreSnapshot: function (s) {
          try {
            const parsed = JSON.parse(s);

            // 提取数据和视图状态
            const mindmapData = parsed.data || parsed; // 兼容旧格式
            const viewState = parsed.viewState;

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
              jm.show(mindmapData);
            }, 120, { avoidReselect: true });

            // 更新原始数据缓存（如果在下钻模式下）
            if (window.viewStateManager && window.viewStateManager.isInDrillDownMode()) {
              window.viewStateManager.originalData = JSON.parse(JSON.stringify(mindmapData));
              console.log('[UndoManager] 已更新原始数据缓存');
            }

            // 如果有视图状态，恢复视图状态
            if (viewState && window.viewStateManager) {
              setTimeout(function () {
                try {
                  // 恢复视图状态
                  if (viewState.mode === 'drilldown' && viewState.rootId) {
                    // 如果保存的是下钻状态，恢复到该下钻状态
                    window.viewStateManager.drillDownToNode(viewState.rootId, false);
                  } else if (viewState.mode === 'full') {
                    // 如果保存的是完整视图状态，确保回到完整视图
                    if (window.viewStateManager.currentViewMode !== 'full') {
                      window.viewStateManager.returnToFullView(false);
                    }
                  }
                } catch (e) {
                  console.warn('[UndoManager] 恢复视图状态失败:', e);
                }
              }, 50);
            }

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
            // 延迟保存，等待视图状态完全恢复后再执行
            setTimeout(function () {
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
            }, 100); // 延迟100ms，确保视图状态恢复完成

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
    console.log('[UndoManager] 初始化成功 (maxCapacity=' + window.undoManager.maxCapacity + ', debounce=' + window.undoManager.debounce + '), getCurrentDocumentId=' + window.undoManager.getCurrentDocumentId());
  } catch (e) {
    console.warn('初始化 UndoManager 失败:', e);
  }

  // 初始化AI扩写功能
  if (window.AIExpander) {
    window.aiExpander = new window.AIExpander();
    window.aiExpander.init(jm);
  }

  // 控制台工具：查看所有文档的撤销堆栈
  window.showAllUndoStacks = function () {
    if (window.undoManager && typeof window.undoManager.getAllDocumentStacks === 'function') {
      var allStacks = window.undoManager.getAllDocumentStacks();
      console.log('=== 所有文档的撤销堆栈信息 ===');
      console.table(Object.keys(allStacks).map(function (docId) {
        var stacks = allStacks[docId];
        return {
          '文档ID': docId,
          '文档标题': stacks.title || '未命名',
          '撤销操作数': stacks.undo,
          '重做操作数': stacks.redo,
          '最后撤销时间': stacks.undoStack.length > 0 ? new Date(stacks.undoStack[stacks.undoStack.length - 1].timestamp).toLocaleString() : '无',
          '最后重做时间': stacks.redoStack.length > 0 ? new Date(stacks.redoStack[stacks.redoStack.length - 1].timestamp).toLocaleString() : '无'
        };
      }));
      console.log('详细堆栈信息:', allStacks);
      return allStacks;
    } else {
      console.error('撤销管理器未初始化或getAllDocumentStacks方法不可用');
      return null;
    }
  };

  // 控制台工具：查看当前文档的撤销堆栈详情
  window.showCurrentUndoStack = function () {
    if (window.undoManager && typeof window.undoManager.getStacks === 'function') {
      var currentDocId = window.undoManager._getCurrentDocumentId();
      var docTitle = window.undoManager._getDocumentTitle ? window.undoManager._getDocumentTitle(currentDocId) : '未命名文档';
      var stacks = window.undoManager.getStacks();
      console.log('=== 当前文档的撤销堆栈详情 (' + currentDocId + ' - ' + docTitle + ') ===');
      console.log('撤销堆栈 (' + stacks.undo.length + ' 个操作):');
      stacks.undo.forEach(function (item, index) {
        console.log('  [' + index + '] ' + new Date(item.ts).toLocaleString() + ' - ' + (item.snapshot ? item.snapshot.substring(0, 100) + '...' : 'null'));
      });
      console.log('重做堆栈 (' + stacks.redo.length + ' 个操作):');
      stacks.redo.forEach(function (item, index) {
        console.log('  [' + index + '] ' + new Date(item.ts).toLocaleString() + ' - ' + (item.snapshot ? item.snapshot.substring(0, 100) + '...' : 'null'));
      });
      return stacks;
    } else {
      console.error('撤销管理器未初始化或getStacks方法不可用');
      return null;
    }
  };

  // 监听 jsmind 的事件
  jm.add_event_listener(function (type, data) {
    if (type === window.jsMind.event_type.select) {
      updateSingleSelectionButtons();
    }
  });

  // 更新需要单选的按钮的可见性
  function updateSingleSelectionButtons() {
    const buttons = document.querySelectorAll('.requires-single-selection');
    const shouldShow = !!jm.get_selected_node();
    buttons.forEach(button => {
      button.classList.toggle('visible', shouldShow);
    });
  }

  // 初始加载时更新一次
  updateSingleSelectionButtons();
});

// 焦点丢失监听
document.addEventListener('focusout', (e) => {
  const from = e.target;
  const to = e.relatedTarget || document.activeElement;

  console.log(`[focusout] 焦点从`, from, `转移到`, to);
  console.trace('焦点丢失调用栈');


});

// 右键菜单功能
(function () {
  let contextMenuNodeId = null;

  // 获取右键菜单元素
  const contextMenu = document.getElementById('nodeContextMenu');

  // 显示右键菜单
  function showContextMenu(nodeId, x, y) {
    if (!contextMenu || !nodeId) return;

    contextMenuNodeId = nodeId;

    // 在显示菜单前更新翻译（确保当前语言正确）
    if (window.i18nManager) {
      window.i18nManager.updateContextMenuTranslations();
    }

    // 设置菜单位置
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';

    // 确保菜单不会超出屏幕边界
    const rect = contextMenu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (rect.right > windowWidth) {
      contextMenu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > windowHeight) {
      contextMenu.style.top = (y - rect.height) + 'px';
    }
  }

  // 隐藏右键菜单
  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.style.display = 'none';
      contextMenuNodeId = null;
    }
  }

  // 从右键菜单删除节点 - 复用已有的删除功能
  window.deleteNodeFromContextMenu = function () {
    if (!contextMenuNodeId || contextMenuNodeId === 'root') {
      hideContextMenu();
      return;
    }

    try {
      // 使用节点操作器删除节点（复用已有功能）
      const nodeOperator = getMindNodeOperator();
      if (nodeOperator) {
        const success = nodeOperator.removeNode(contextMenuNodeId);
        if (success) {

          // 清除多选状态
          if (window.clearMultiSelection && typeof window.clearMultiSelection === 'function') {
            window.clearMultiSelection();
          }
        }
      }

    } catch (error) {
      console.error('删除节点失败:', error);
    }

    hideContextMenu();
  };

  // 从右键菜单添加子树
  window.addSubtreeFromContextMenu = function () {
    if (!contextMenuNodeId) {
      hideContextMenu();
      return;
    }

    try {
      // 先选中节点
      const node = jm.get_node(contextMenuNodeId);
      if (node) {
        jm.select_node(node);
        // 调用添加子树功能
        addSubtree();
      }
    } catch (error) {
      console.error('添加子树失败:', error);
    }

    hideContextMenu();
  };

  // 从右键菜单添加子节点（相当于按Tab）
  window.addChildNodeFromContextMenu = function () {
    if (!contextMenuNodeId) {
      hideContextMenu();
      return;
    }

    try {
      // 使用节点操作器添加子节点
      const nodeOperator = getMindNodeOperator();
      if (nodeOperator) {
        const newNode = nodeOperator.addChildNode(contextMenuNodeId, null, '新子节点');
        if (newNode) {
          // 选中新创建的节点
          jm.select_node(newNode);
          // 进入编辑模式
          jm.begin_edit(newNode);
        }
      }
    } catch (error) {
      console.error('添加子节点失败:', error);
    }

    hideContextMenu();
  };

  // 从右键菜单添加同级节点（相当于按Enter）
  window.addSiblingNodeFromContextMenu = function () {
    if (!contextMenuNodeId || contextMenuNodeId === 'root') {
      hideContextMenu();
      return;
    }

    try {
      // 使用节点操作器添加同级节点
      const nodeOperator = getMindNodeOperator();
      if (nodeOperator) {
        const newNode = nodeOperator.addSiblingNode(contextMenuNodeId, null, '新同级节点');
        if (newNode) {
          // 选中新创建的节点
          jm.select_node(newNode);
          // 进入编辑模式
          jm.begin_edit(newNode);
        }
      }
    } catch (error) {
      console.error('添加同级节点失败:', error);
    }

    hideContextMenu();
  };

  // 从右键菜单显示节点详情
  window.showNodeDetailsFromContextMenu = function () {
    quickModifyNode();
    hideContextMenu();
  };

  // 从右键菜单快速生成子节点（相当于极速模式的AI扩展子节点）
  window.aiCreateChildQuickFromContextMenu = function () {
    if (!contextMenuNodeId) {
      hideContextMenu();
      return;
    }

    try {
      // 先选中节点
      const node = jm.get_node(contextMenuNodeId);
      if (node) {
        jm.select_node(node);
        // 调用快速生成函数
        if (typeof aiCreateChildQuick === 'function') {
          aiCreateChildQuick();
        } else {
          console.error('快速生成功能不可用');
          try {
            if (typeof showError === 'function') showError('快速生成功能不可用');
          } catch (_) { }
        }
      }
    } catch (error) {
      console.error('快速生成子节点失败:', error);
      try {
        if (typeof showError === 'function') showError('快速生成子节点失败');
      } catch (_) { }
    }

    hideContextMenu();
  };

  // 处理节点上的右键点击事件（PC端）
  document.addEventListener('contextmenu', function (e) {
    // jsMind使用自定义标签jmnode，不是类名
    const nodeElement = e.target.tagName === 'JMNODE' ? e.target : e.target.closest('jmnode');
    if (nodeElement) {
      e.preventDefault();
      e.stopPropagation();

      const nodeId = nodeElement.getAttribute('nodeid');
      if (nodeId) {
        showContextMenu(nodeId, e.clientX, e.clientY);
      }
    } else {
      // 如果点击的不是节点，隐藏菜单
      hideContextMenu();
    }
  }, true);

  // 检测是否为移动端
  function isMobileDevice() {
    return (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches));
  }

  // 处理触摸事件（移动端）：点击直接显示菜单并选中节点
  if (isMobileDevice()) {
    let touchStartTime = 0;
    let touchStartTarget = null;
    let touchMoved = false;

    document.addEventListener('touchstart', function (e) {
      // jsMind使用自定义标签jmnode，不是类名
      const nodeElement = e.target.tagName === 'JMNODE' ? e.target : e.target.closest('jmnode');
      if (nodeElement) {
        touchStartTime = Date.now();
        touchStartTarget = nodeElement;
        touchMoved = false;
      } else {
        touchStartTarget = null;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      // 移动时标记为已移动
      if (touchStartTarget) {
        touchMoved = true;
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      // 点击节点时直接显示菜单并选中节点
      if (touchStartTarget && !touchMoved) {
        const nodeId = touchStartTarget.getAttribute('nodeid');
        if (nodeId) {
          e.preventDefault();
          e.stopPropagation();

          // 选中节点
          try {
            const node = jm.get_node(nodeId);
            if (node) {
              jm.select_node(node);
            }
          } catch (err) {
            console.warn('选中节点失败:', err);
          }

          // 显示菜单
          const touch = e.changedTouches[0];
          if (touch) {
            showContextMenu(nodeId, touch.clientX, touch.clientY);
          }
        }
      }

      // 重置状态
      touchStartTime = 0;
      touchStartTarget = null;
      touchMoved = false;
    }, { passive: false });
  }

  // 点击其他地方隐藏菜单
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.node-context-menu')) {
      hideContextMenu();
    }
  }, true);

  // 点击画布空白处隐藏菜单
  document.addEventListener('mousedown', function (e) {
    // jsMind使用自定义标签jmnode，不是类名
    const nodeElement = e.target.tagName === 'JMNODE' ? e.target : e.target.closest('jmnode');
    const contextMenuElement = e.target.closest('.node-context-menu');

    if (!nodeElement && !contextMenuElement) {
      hideContextMenu();
    }
  }, true);

  // ESC键隐藏菜单
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  }, true);

  // 窗口大小改变时隐藏菜单
  window.addEventListener('resize', hideContextMenu);

  // 滚动时隐藏菜单
  window.addEventListener('scroll', hideContextMenu, true);

  console.log('[ContextMenu] 右键菜单功能已初始化');
})();

// 从父页面同步语言设置（iframe环境）
(function () {
  let lastLanguage = null;

  // 从localStorage读取语言设置
  function readLanguageFromStorage() {
    try {
      return localStorage.getItem('mw_lang');
    } catch (e) {
      return null;
    }
  }

  // 同步语言设置
  function syncLanguage() {
    if (!window.i18nManager) return;

    const currentLang = readLanguageFromStorage();
    if (currentLang && currentLang !== lastLanguage && currentLang !== window.i18nManager.currentLanguage) {
      console.log('[LanguageSync] 同步语言:', currentLang);
      window.i18nManager.setLanguage(currentLang);
      lastLanguage = currentLang;
    }
  }

  // 监听storage事件（同一浏览器标签页间的同步）
  window.addEventListener('storage', function (e) {
    if (e.key === 'mw_lang') {
      syncLanguage();
    }
  });

  // 监听来自父页面的消息（跨iframe通信）
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'languageChanged' && e.data.language) {
      console.log('[LanguageSync] 收到父页面语言变更:', e.data.language);
      if (window.i18nManager && window.i18nManager.currentLanguage !== e.data.language) {
        window.i18nManager.setLanguage(e.data.language);
        lastLanguage = e.data.language;
      }
    }
  });

  // 页面加载完成后同步语言
  function initLanguageSync() {
    syncLanguage();
    // 只在iframe环境中请求父页面语言
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'getLanguage' }, '*');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguageSync);
  } else {
    initLanguageSync();
  }

  console.log('[LanguageSync] 语言同步功能已初始化');
})();
