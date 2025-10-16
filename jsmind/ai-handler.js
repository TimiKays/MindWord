// ============================================================
// ai-handler.js （重构且保留全部细节行为）
// - 外部接口保持不变： aiCreateChild, aiCreateSibling, aiExpandNotes, aiGenerateInitialTree
// - 保留模板读取、占位符注入、md->AST->nodeTree 转换、insertNodeTreeChildren、applyAIAction 分发等
// - 精简日志，仅保留必要的用户提示（showError/showWarning/showSuccess）
// - 兼容原有全局函数与变量（jm, debouncedSave, window.converter, setNodeLevel, ...）
// ============================================================

// -------------------- 辅助提示 --------------------
function _show(msgType, text) {
  try {
    if (msgType === 'error' && typeof showError === 'function') return showError(text);
    if (msgType === 'warn' && typeof showWarning === 'function') return showWarning(text);
    if (msgType === 'success' && typeof showSuccess === 'function') return showSuccess(text);
  } catch (_) { }
  // 兜底
  try { if (msgType === 'error') console.error(text); else console.log(text); } catch (_) { }
}

// -------------------- 基础工具 --------------------
function _genRequestId() { return 'r_' + Math.random().toString(36).slice(2, 10); }

function _safe(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

// 获取最新节点对象（优先 jm.get_node）
function _getRealNode(selected) {
  try { return jm && jm.get_node ? jm.get_node(selected.id) : selected; } catch (_) { return selected; }
}

// 获取选中节点（用于入口）
function _ensureSelected() {
  const sel = jm && typeof jm.get_selected_node === 'function' ? jm.get_selected_node() : null;
  if (!sel) {
    _show('warn', '请先选择一个节点');
    return null;
  }
  return sel;
}

// 读取模板（优先使用 window.__prompt_templates）
function _loadTemplateByKey(key) {
  try {
    const tplList = window.__prompt_templates;
    if (Array.isArray(tplList)) {
      for (let i = 0; i < tplList.length; i++) {
        const t = tplList[i];
        if (t && t.name === key) return t.content || '';
      }
    }
  } catch (_) { }
  return (key && typeof key === 'string') ? key : '{{name}}';
}

// 组装占位符上下文（兼容原实现）
function _buildPlaceholders(selectedNode) {
  const node = _getRealNode(selectedNode);
  const topic = (node && node.topic) ? node.topic : '';
  // notes 优先使用 node.data.notes 回退 textarea
  let notes = '';
  try { notes = (node && node.data && node.data.notes) ? node.data.notes : (document.getElementById && document.getElementById('nodeNotes') ? document.getElementById('nodeNotes').value : ''); } catch (_) { notes = ''; }
  // fullPath 计算
  let fullPath = '';
  try {
    if (typeof window.getNodeFullPath === 'function') {
      fullPath = window.getNodeFullPath(node) || '';
    } else {
      const path = [];
      let cur = node;
      while (cur) {
        path.unshift(cur.topic || '');
        cur = (jm && jm.get_parent && cur && cur.id) ? jm.get_parent(cur.id) : null;
      }
      fullPath = path.join(' / ');
    }
  } catch (_) { fullPath = topic || ''; }

  // siblings （尝试从 node.data.siblingNodes 优先读取）
  let siblingNodes = '';
  try {
    const _sib = (node && node.data && (node.data.siblingNodes || (node.data.data && node.data.data.siblingNodes))) || null;
    if (Array.isArray(_sib)) siblingNodes = _sib.filter(Boolean).join(', ');
    else if (typeof _sib === 'string') siblingNodes = _sib;
    else {
      // fallback: collect from parent.children
      const parent = (jm && jm.get_parent) ? jm.get_parent(node.id) : null;
      if (parent && Array.isArray(parent.children)) {
        siblingNodes = parent.children.filter(n => n && n.id !== node.id).map(n => n.topic || '').filter(Boolean).join(', ');
      }
    }
  } catch (_) { siblingNodes = ''; }

  // build context summary (original had a context field)
  const context = (function () {
    try {
      const lines = [];
      lines.push('节点: ' + (topic || ''));
      lines.push('路径: ' + (fullPath || ''));
      const rawVal = _safe(() => node.data.data.raw, '') || '';
      if (rawVal) lines.push('raw: ' + rawVal);
      if (notes) lines.push('备注: ' + notes);
      const parent = (jm && jm.get_parent) ? jm.get_parent(node.id) : null;
      if (parent && (parent.topic || '')) lines.push('父节点: ' + (parent.topic || ''));
      if (siblingNodes) lines.push('同级兄弟: ' + siblingNodes);
      const childTitles = (node && Array.isArray(node.children)) ? node.children.map(c => c.topic || '').filter(Boolean).join(', ') : '';
      if (childTitles) lines.push('已有子节点: ' + childTitles);
      return lines.join('\n');
    } catch (e) { return topic + '\n' + fullPath; }
  })();

  return {
    name: { desc: '节点主题', value: topic },
    notes: { desc: '节点备注', value: notes },
    fullPath: { desc: '节点完整路径', value: fullPath },
    siblingNodes: { desc: '同级兄弟节点（以逗号分隔）', value: siblingNodes },
    nodeId: { desc: '节点ID', value: (selectedNode && selectedNode.id) || '' },
    context: { desc: '节点上下文摘要', value: context }
  };
}

// -------------------- applyAIAction（保留并重构） --------------------
// 保留原 applyAIAction 的分发能力（create_child / create_sibling / expand_notes / generate_initial_tree）
// 但把子功能拆成小函数并复用原逻辑（addMany / parseTextToItems / buildTreeFromItems / insertTreeNodes 等）
function applyAIAction(actionType, ctx) {
  // ctx expected: { selectedNode, itemsToInsert, childNodes, childTitles, parsedText, placeholders }
  try {
    const sel = ctx.selectedNode;
    if (!sel) {
      _show('warn', '请先选择一个节点');
      return;
    }

    const items = Array.isArray(ctx.itemsToInsert) ? ctx.itemsToInsert : [];

    // --- addMany: enhanced batch insertion (保留原行为) ---
    const addMany = function (parentId) {

      // parse text to items (原实现的 parseTextToItems)
      function parseTextToItems(text) {
        const lines = String(text || '').replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/\t/g, '    '));
        const result = [];
        for (let rawLine of lines) {
          const line = rawLine.replace(/\u00A0/g, '');
          if (line.trim() === '') continue;
          const m = line.match(/^(\s*)([-*+]|\d+\.)?\s*(.*)$/);
          if (!m) continue;
          const indent = m[1] ? m[1].length : 0;
          const content = (m[3] || '').trim();
          const level = Math.floor(indent / 4);
          result.push({ topic: content, raw: rawLine, level, marker: m[2] || null });
        }
        return result;
      }

      // build tree from flat items (original)
      function buildTreeFromItems(flatItems) {
        const root = { children: [] };
        const stack = [{ level: -1, node: root }];
        flatItems.forEach(it => {
          const node = Object.assign({ topic: String(it.topic || ''), raw: it.raw || '' }, it);
          node.children = [];
          while (stack.length > 0 && stack[stack.length - 1].level >= (node.level || 0)) stack.pop();
          stack[stack.length - 1].node.children.push(node);
          stack.push({ level: node.level || 0, node });
        });
        return root.children;
      }

      // insert tree nodes recursively (original style, with nodeData)
      function insertTreeNodes(parentIdLocal, nodes) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;
        nodes.forEach(n => {
          try {
            const topicStr = String(n.topic || '');
            if (!topicStr) return;
            const nid = 'n_' + Math.random().toString(36).slice(2, 9);
            const nodeData = {};
            if (n.raw) nodeData.raw = n.raw;
            if (n.level !== undefined && n.level !== null) nodeData.level = n.level;
            try {
              if (Object.keys(nodeData).length > 0) jm.add_node(parentIdLocal, nid, topicStr, nodeData);
              else jm.add_node(parentIdLocal, nid, topicStr);
            } catch (err) {
              try { jm.add_node(parentIdLocal, nid, topicStr); } catch (_) { /* ignore */ }
            }
            if (Array.isArray(n.children) && n.children.length > 0) insertTreeNodes(nid, n.children);
          } catch (e) {
            /* ignore single node insert error */
          }
        });
      }

      try {
        const hasLevelField = items.some(i => i && typeof i === 'object' && (i.level !== undefined && i.level !== null));
        if (hasLevelField) {
          // convert items to flat then build tree
          const flat = items.map(it => {
            if (typeof it === 'string') return { topic: it, raw: it, level: 0 };
            const topic = (it && typeof it === 'object') ? (it.topic !== undefined ? String(it.topic) : String(it)) : String(it);
            const level = (it && typeof it === 'object' && (it.level !== undefined && it.level !== null)) ? parseInt(it.level, 10) || 0 : 0;
            const raw = (it && typeof it === 'object' && it.raw) ? it.raw : topic;
            return { topic, raw, level };
          });
          const tree = buildTreeFromItems(flat);
          insertTreeNodes(parentId, tree);
        } else {
          // merge strings and objects into combined list, then build tree
          const combined = [];
          items.forEach(it => {
            if (typeof it === 'string') {
              const parsed = parseTextToItems(it);
              if (parsed.length > 0) parsed.forEach(p => combined.push(p));
            } else if (it && typeof it === 'object') {
              const topic = (it.topic !== undefined) ? String(it.topic) : '';
              const raw = it.raw || topic;
              const lvl = (it.level !== undefined && it.level !== null) ? parseInt(it.level, 10) || 0 : 0;
              combined.push({ topic, raw, level: lvl });
            } else {
              combined.push({ topic: String(it), raw: String(it), level: 0 });
            }
          });
          const tree = buildTreeFromItems(combined);
          insertTreeNodes(parentId, tree);
        }
      } catch (e) {
        // fallback:逐项插入（兼容性保底）
        items.forEach(function (item) {
          try {
            var topicStr = '';
            var nodeData = {};
            if (typeof item === 'string') topicStr = item;
            else if (item && typeof item === 'object') {
              topicStr = (item.topic !== undefined) ? String(item.topic) : '';
              if (item.level !== undefined && item.level !== null) nodeData.level = item.level;
              if (item.raw) nodeData.raw = item.raw;
              if (item.notes) nodeData.notes = item.notes;
            } else topicStr = String(item);
            if (!topicStr) return;
            const nid = 'n_' + Math.random().toString(36).slice(2, 9);
            try {
              if (Object.keys(nodeData).length > 0) jm.add_node(parentId, nid, topicStr, nodeData);
              else jm.add_node(parentId, nid, topicStr);
            } catch (_err) { try { jm.add_node(parentId, nid, topicStr); } catch (_) { } }
          } catch (e2) { /* ignore */ }
        });
      }
    }; // end addMany

    // dispatch actions (preserve original behaviors)
    switch (actionType) {
      case 'create_sibling': {
        // try to find real parent id
        var nodeObj = null, parent = null;
        try { nodeObj = jm.get_node ? jm.get_node(sel.id) : sel; } catch (_) { nodeObj = sel; }
        try { parent = (nodeObj && nodeObj.parent) ? nodeObj.parent : null; } catch (_) { parent = null; }
        if (!parent) {
          try { parent = (jm.get_parent && sel && sel.id) ? jm.get_parent(sel.id) : null; } catch (_) { parent = null; }
        }
        if (parent && parent.id) addMany(parent.id);
        else {
          // 根无法添加同级，降级为添加子级并提示
          addMany(sel.id);
          try { _show('warn', '根节点无法添加同级，已改为添加子级'); } catch (_) { }
        }
        break;
      }
      case 'expand_notes': {
        try {
          var node = jm.get_node ? jm.get_node(sel.id) : sel;
          if (node) {
            node.data = node.data || {};
            var newText = String(ctx.parsedText || '').replace(/\r/g, '').trim();
            var oldText = '';
            try { oldText = String((node.data && node.data.notes) || '').replace(/\r/g, ''); } catch (_) { oldText = ''; }
            node.data.notes = oldText ? (oldText.replace(/\s+$/, '') + '\n\n' + newText) : newText;
            try { node.notes = node.data.notes; } catch (_) { }
            jm.update_node(node.id, node.topic || '');
            // 同步详情面板 textarea 并触发输入事件以复用保存流程
            try {
              var ta = document.getElementById('nodeNotes');
              if (ta) {
                ta.value = node.data.notes || '';
                ta.dispatchEvent(new Event('input', { bubbles: true }));
              }
            } catch (_) { }
            try { if (typeof refreshAllNotesDisplay === 'function') refreshAllNotesDisplay(); } catch (_) { }
            try { if (typeof saveToLocalStorage === 'function') saveToLocalStorage(); } catch (_) { }
            try { if (typeof showAutoUpdateIndicator === 'function') showAutoUpdateIndicator(); } catch (_) { }
            try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
          }
        } catch (e) {
          _show('error', '更新备注失败');
        }
        break;
      }
      case 'generate_initial_tree': {
        try {


          // parsedText 或 itemsToInsert -> md
          var md = '';
          try { md = (typeof ctx.parsedText === 'string') ? ctx.parsedText : ''; } catch (_) { md = ''; }
          if (!md) {
            var itemsList = Array.isArray(ctx.itemsToInsert) ? ctx.itemsToInsert : [];
            md = itemsList.map(function (it) {
              if (typeof it === 'string') return it;
              if (it && typeof it === 'object') return (it.raw || it.topic || '');
              return String(it || '');
            }).filter(Boolean).join(String.fromCharCode(10));
          }
          md = String(md || '');
          if (!md.trim()) { _show('warn', 'AI 未返回有效 Markdown，无法生成初始树'); break; }

          // 优先走父页统一应用路径：让父页更新当前活动文档并广播三端，无需刷新
          var posted = false;
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'mw_apply_markdown',
                payload: { md: md, images: [] },
                requestId: (window.__mw_ai_active_requestId || null),
                source: 'mindmap'
              }, '*');
              posted = true;
              try { _show('success', 'AI 内容已提交，正在应用到文档'); } catch (_) { }
            }
          } catch (ePost) {
            posted = false;
          }

          if (!posted) {
            // 兜底：旧逻辑，直接尝试操作编辑器 iframe（尽量不走到这里）
            // find editor iframe in parent
            var editorFrame = null;
            try { editorFrame = window.parent && window.parent.document && window.parent.document.querySelector('iframe[data-panel="editor"]'); } catch (_) { editorFrame = null; }
            if (!editorFrame) {
              try { editorFrame = window.parent && window.parent.document && window.parent.document.getElementById('iframe-editor'); } catch (_) { editorFrame = null; }
            }
            if (!editorFrame) {
              try { editorFrame = window.parent && window.parent.document && window.parent.document.querySelector('iframe[src*="editor/editor.html"]'); } catch (_) { editorFrame = null; }
            }
            var targetWin = (editorFrame && editorFrame.contentWindow) ? editorFrame.contentWindow : null;
            if (!targetWin) { _show('error', '未找到编辑器面板，无法替换文档内容'); break; }

            try {
              targetWin.postMessage({ type: 'editor-set-markdown', markdown: md, requestId: (window.__mw_ai_active_requestId || null), source: 'mindmap' }, '*');
            } catch (e1) { }
            setTimeout(function () {
              try { targetWin.postMessage({ type: 'editor-save-or-sync', reason: 'generate_initial_tree', requestId: (window.__mw_ai_active_requestId || null), source: 'mindmap' }, '*'); } catch (e2) { }
            }, 50);
            try { _show('success', '已将内容发送到编辑器并触发保存/同步'); } catch (_) { }
          }
        } catch (e) {
          _show('error', '生成初始树失败');
        }
        break;
      }
      case 'create_child':
      default: {
        // 默认插入为子级（使用 addMany）
        addMany(sel.id);
        break;
      }
    } // end switch

    // 尝试保存 debounce（仅当本地有实际变动时；生成初始树交由父页应用Markdown，不在此保存旧导图）
    if (actionType !== 'generate_initial_tree') {
      try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
    }
  } catch (e) {
    _show('error', '处理 AI 动作失败');
  }
} // end applyAIAction

// -------------------- md->AST 转换与 nodeTree 插入（保留原复杂插入逻辑） --------------------

// Insert nodeTree's children into parentId with careful handling (locks, setNodeLevel, dedupe, normalize)
function insertNodeTreeChildren(parentId, ntNode, requestId) {
  if (!ntNode) return;
  // local lock map
  try { window._mw_ai_inserting_requests = window._mw_ai_inserting_requests || {}; } catch (e) { window._mw_ai_inserting_requests = {}; }
  if (requestId && window._mw_ai_inserting_requests[requestId]) return;
  if (requestId) { try { window._mw_ai_inserting_requests[requestId] = true; } catch (_) { window._mw_ai_inserting_requests[requestId] = true; } }
  else { try { if (window.__mw_ai_inserting) return; } catch (_) { } try { window.__mw_ai_inserting = true; } catch (_) { } }

  try {
    var children = ntNode.children || (ntNode.data && ntNode.data.children) || [];
    if (!Array.isArray(children)) return;

    // determine target level (try core getNodeLevel or use node.data.level)
    var targetLevel = null;
    try {
      var targetNodeObj = (parentId && jm.get_node) ? jm.get_node(parentId) : null;
      if (targetNodeObj && targetNodeObj.data && (targetNodeObj.data.level !== undefined && targetNodeObj.data.level !== null)) {
        targetLevel = parseInt(targetNodeObj.data.level, 10);
      } else if (typeof window.getNodeLevel === 'function') {
        targetLevel = window.getNodeLevel(targetNodeObj) || null;
      }
    } catch (e) { targetLevel = null; }
    if (targetLevel === null || isNaN(targetLevel)) targetLevel = 1;

    // helper: sibling exists under parent?
    function siblingExists(pid, topic) {
      try {
        if (!pid || !topic) return false;
        var pObj = jm.get_node ? jm.get_node(pid) : null;
        var kids = (pObj && Array.isArray(pObj.children)) ? pObj.children : [];
        for (var i = 0; i < kids.length; i++) {
          var c = kids[i];
          if (!c) continue;
          try { if (String((c.topic || '')).trim() === String(topic).trim()) return true; } catch (e) { }
        }
      } catch (e) { }
      return false;
    }

    // recursive insertion
    function _insert(pid, nodes, depthOffset) {
      if (!Array.isArray(nodes) || nodes.length === 0) return;
      nodes.forEach(function (child) {
        try {
          var topic = child.topic || (child.data && (child.data.topic || child.data.title)) || (child.title || '');
          if (!topic && child.data && child.data.raw) {
            var fl = String(child.data.raw || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
            topic = fl.length > 120 ? fl.slice(0, 120) + '...' : fl;
          }
          var hasChildren = Array.isArray(child.children) && child.children.length > 0;
          if (!topic && hasChildren) { _insert(pid, child.children, depthOffset); return; }
          if (!topic && !hasChildren) return;

          // dedupe: skip if same topic exists under pid
          if (siblingExists(pid, topic)) {
            // find existKid and insert its children to merge if needed
            try {
              var pObj = jm.get_node ? jm.get_node(pid) : null;
              var existKid = null;
              if (pObj && Array.isArray(pObj.children)) {
                for (var ii = 0; ii < pObj.children.length; ii++) {
                  var kk = pObj.children[ii];
                  if (kk && String((kk.topic || '')).trim() === String(topic).trim()) { existKid = kk; break; }
                }
              }
              if (existKid) {
                var existId = existKid.id;
                if (hasChildren) _insert(existId, child.children, depthOffset + 1);
              }
            } catch (e) { }
            return;
          }

          // generate new node id and nodeData
          var nid = 'n_' + Math.random().toString(36).slice(2, 9);
          var nodeData = {};
          try { if (child.data) nodeData = Object.assign({}, child.data); } catch (_) { nodeData = {}; }
          try { if (nodeData.raw && typeof nodeData.raw === 'string' && nodeData.raw.length > 600) delete nodeData.raw; } catch (_) { }

          try {
            if (nodeData.level !== undefined && nodeData.level !== null) {
              var requested = parseInt(nodeData.level, 10) || 0;
              nodeData.level = Math.max(1, targetLevel + requested);
            } else {
              // don't force level, leave to setNodeLevel or normalize later
            }
          } catch (e) { }

          try {
            if (Object.keys(nodeData).length > 0) jm.add_node(pid, nid, topic, nodeData);
            else jm.add_node(pid, nid, topic);
          } catch (e) {
            try { jm.add_node(pid, nid, topic); } catch (e2) { return; }
          }

          // core post-processing: setNodeLevel / applySiblingOrParentType if available
          try {
            if (typeof window.setNodeLevel === 'function') {
              if (nodeData && nodeData.level !== undefined && nodeData.level !== null) {
                try { window.setNodeLevel(nid, nodeData.level); } catch (_) { }
              } else {
                try { window.setNodeLevel(nid, Math.max(1, targetLevel + (depthOffset || 0))); } catch (_) { }
              }
            }
            if (typeof window.applySiblingOrParentType === 'function') {
              try { window.applySiblingOrParentType(nid); } catch (_) { }
            }
          } catch (e) { }

          // recursive insert children
          if (hasChildren) _insert(nid, child.children, (depthOffset || 0) + 1);

        } catch (e) {
          // ignore single child insert error
        }
      });
    } // end _insert

    _insert(parentId, children, 1);

    // try normalize/adjust functions
    try {
      if (typeof window.adjustChildrenHeadingLevel === 'function') try { window.adjustChildrenHeadingLevel(parentId); } catch (e) { }
      if (typeof window.normalizeSubtreeUnderList === 'function') try { window.normalizeSubtreeUnderList(parentId); } catch (e) { }
    } catch (e) { }

    try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }

  } finally {
    // release locks
    try { if (requestId) delete window._mw_ai_inserting_requests[requestId]; } catch (e) { }
    try { delete window.__mw_ai_inserting; } catch (e) { }
  }
} // end insertNodeTreeChildren

// -------------------- expandWithAI 主实现（统一 AI 请求 + 复杂 onMessage 处理） --------------------
function expandWithAI() {
  try {
    const selectedNode = jm.get_selected_node ? jm.get_selected_node() : null;
    if (!selectedNode) { _show('warn', '请先选择一个节点'); return; }

    const requestId = _genRequestId();
    try { window.__mw_ai_active_requestId = requestId; } catch (_) { }
    try { window.__mw_handled_requests = window.__mw_handled_requests || {}; } catch (_) { window.__mw_handled_requests = {}; }

    // prepare template & placeholders
    var topic = selectedNode.topic || '';
    var _nodeLatest = null;
    try { _nodeLatest = jm.get_node ? jm.get_node(selectedNode.id) : selectedNode; } catch (_) { _nodeLatest = selectedNode; }
    var notes = (_nodeLatest && _nodeLatest.data && _nodeLatest.data.notes) ? _nodeLatest.data.notes : (document.getElementById('nodeNotes') ? document.getElementById('nodeNotes').value : '');

    // try find realSel for full data
    var realSel = null;
    try { realSel = jm.get_node ? jm.get_node(selectedNode.id) : selectedNode; } catch (_) { realSel = selectedNode; }

    // compute fullPath (prefer window.getNodeFullPath)
    function _computeFullPath(n) {
      try { if (typeof window.getNodeFullPath === 'function') return window.getNodeFullPath(n); } catch (_) { }
      try {
        var path = [];
        var cur = n;
        while (cur) {
          path.unshift(cur.topic || '');
          var p = jm.get_parent && cur && cur.id ? jm.get_parent(cur.id) : null;
          if (!p) break;
          cur = p;
        }
        return path.join(' / ');
      } catch (e) { return n.topic || ''; }
    }
    var fullPath = '';
    try { fullPath = (realSel && realSel.data && (realSel.data.fullPath || (realSel.data.data && realSel.data.data.fullPath))) || ''; } catch (e) { fullPath = (realSel && realSel.topic) ? realSel.topic : ''; }

    // siblingNodes (prefer data.siblingNodes)
    var siblingNodes = '';
    try {
      var sib = (realSel && realSel.data && (realSel.data.siblingNodes || (realSel.data.data && realSel.data.data.siblingNodes))) || [];
      if (Array.isArray(sib)) siblingNodes = sib.filter(Boolean).join(', ');
      else if (typeof sib === 'string') siblingNodes = sib;
    } catch (e) { siblingNodes = ''; }

    // templateText: try __prompt_templates
    var templateText = '';
    try {
      var tplList = window.__prompt_templates || null;
      if (!tplList) {
        try { tplList = window.__prompt_templates || tplList; } catch (_) { tplList = tplList || null; }
      }
      if (Array.isArray(tplList)) {
        var key = (typeof window.__mw_next_templateKey === 'string' && window.__mw_next_templateKey) ? window.__mw_next_templateKey : '扩展子节点';
        for (var ti = 0; ti < tplList.length; ti++) {
          var t = tplList[ti];
          if (t && t.name === key) { templateText = t.content || ''; break; }
        }
      }
    } catch (e) { templateText = ''; }
    if (!templateText || !String(templateText).trim()) templateText = topic || '{{name}}';

    // build payload (same shape as original)
    var payload = {
      platformConfig: {},
      modelConfig: {},
      templateData: {
        templateText: templateText,
        placeholders: {
          name: { desc: '节点主题', value: topic },
          notes: { desc: '节点备注', value: notes },
          fullPath: { desc: '节点完整路径', value: fullPath },
          siblingNodes: { desc: '同级兄弟节点（以逗号分隔）', value: siblingNodes },
          nodeId: { desc: '节点ID', value: selectedNode.id },
          context: {
            desc: '节点上下文摘要', value: (function () {
              try {
                var lines = [];
                lines.push('节点: ' + (topic || ''));
                lines.push('路径: ' + (fullPath || ''));
                var rawVal = _safe(function () { return selectedNode.data.data.raw; }, '') || '';
                lines.push('raw: ' + rawVal);
                if (notes) lines.push('备注: ' + notes);
                var parent = jm.get_parent ? jm.get_parent(selectedNode.id) : null;
                if (parent && (parent.topic || '')) lines.push('父节点: ' + (parent.topic || ''));
                if (siblingNodes) lines.push('同级兄弟: ' + siblingNodes);
                var childTitles = (selectedNode.children || []).map(function (c) { return c.topic || ''; }).filter(Boolean).join(', ');
                if (childTitles) lines.push('已有子节点: ' + childTitles);
                return lines.join('\n');
              } catch (e) { return (topic || '') + '\n' + (fullPath || ''); }
            })()
          }
        }
      },
      options: {}
    };

    // merge extra placeholders
    try {
      var extraPH = (window.__mw_next_placeholders && typeof window.__mw_next_placeholders === 'object') ? window.__mw_next_placeholders : null;
      if (extraPH) {
        Object.keys(extraPH).forEach(function (k) { payload.templateData.placeholders[k] = extraPH[k]; });
      }
    } catch (_) { }

    try { payload.templateData.templateKey = (window.__mw_next_templateKey || '扩展子节点'); } catch (_) { }
    try { payload.params = payload.templateData.placeholders; } catch (_) { }
    try { payload.actionType = (window.__mw_next_actionType || 'create_child'); } catch (_) { }

    // message handler
    const onMessage = function (e) {
      try {
        const msg = e && e.data;
        var isSave = !!(msg && msg.type === 'AI_MODAL_SAVE_OUTPUT');
        var okId = !!(msg && ((msg.requestId === requestId) || (isSave && !msg.requestId && window.__mw_ai_active_requestId === requestId)));
        if (!msg || (msg.type !== 'AI_MODAL_RESULT' && msg.type !== 'AI_MODAL_SAVE_OUTPUT') || !okId) return;

        if (msg.type === 'AI_MODAL_RESULT' && msg.status === 'cancel') {
          try { if (window.__mw_handled_requests && window.__mw_handled_requests[requestId]) return; } catch (_) { }
        }

        // cleanup
        window.removeEventListener('message', onMessage);
        clearTimeout(timeoutT);
        try { delete window.__mw_ai_active_requestId; } catch (_) { }

        if (msg.type === 'AI_MODAL_SAVE_OUTPUT' || msg.status === 'ok') {
          try {
            const detail = msg.detail || {};
            const outText = detail.output || detail.text || (detail.result && detail.result.text) || msg.output || '';
            if (!outText) { _show('warn', 'AI 未返回有效内容'); return; }

            // mark handled
            try { window.__mw_handled_requests[requestId] = true; window.__mw_lastHandledId = requestId; } catch (_) { }

            // extract output (remove [OUTPUT] wrapper if present)
            let parsed = outText;
            const m = /\[OUTPUT\]([\s\S]*)\[\/OUTPUT\]/i.exec(outText);
            if (m && m[1]) parsed = m[1].trim();
            var normalized = (parsed || '').replace(/\r/g, '').replace(/\[OUTPUT\]|\[\/OUTPUT\]/gi, '');

            // detect markdown
            var looksLikeMarkdown = /(^\s*#{1,6}\s+)|(^\s*[-\*\+]\s+)|(^\s*\d+[\.\、]\s+)/m.test(normalized);
            var converterInserted = false;

            if (looksLikeMarkdown) {
              // dynamic load md->AST converter
              var tryLoadConverter = function () {
                return import('../converter/md-to-ast.js').catch(function (e1) {
                  return import('./converter/md-to-ast.js').catch(function (e2) { return null; });
                });
              };
              var mdmod = null;
              tryLoadConverter().then(function (mod) {
                mdmod = mod;
                if (mdmod && mdmod.MdToAstConverter) {
                  try {
                    const conv = new mdmod.MdToAstConverter();
                    const ast = conv.convert(normalized);
                    var nodeTree = null;
                    try {
                      // priority: window.converter.astToNodeTree
                      if (window && window.converter && typeof window.converter.astToNodeTree === 'function') {
                        nodeTree = window.converter.astToNodeTree(ast);
                      } else {
                        // dynamic import converter.js
                        try {
                          var convModule = null;
                          try { convModule = import('../converter/converter.js'); } catch (_) { try { convModule = import('./converter/converter.js'); } catch (__) { convModule = null; } }
                          if (convModule && convModule.default && typeof convModule.default.astToNodeTree === 'function') nodeTree = convModule.default.astToNodeTree(ast);
                          else if (convModule && typeof convModule.astToNodeTree === 'function') nodeTree = convModule.astToNodeTree(ast);
                        } catch (eConv) { nodeTree = null; }
                      }
                    } catch (e) { nodeTree = null; }

                    // helper: insert children from nodeTree
                    function insertNodeTreeChildrenLocal(parentIdLocal, ntNodeLocal, requestIdLocal) {
                      if (!ntNodeLocal) return;
                      // reuse global insertNodeTreeChildren to preserve original behavior
                      try {
                        insertNodeTreeChildren(parentIdLocal, ntNodeLocal, requestIdLocal);
                      } catch (e) { }
                    }

                    if (nodeTree) {
                      var requestedAction = (payload && payload.actionType) ? payload.actionType : 'create_child';
                      if (requestedAction && requestedAction !== 'create_child') {
                        try {
                          if (requestedAction === 'generate_initial_tree') {
                            try {
                              if (typeof applyAIAction === 'function') {
                                applyAIAction('generate_initial_tree', {
                                  selectedNode: selectedNode,
                                  itemsToInsert: [],
                                  parsedText: normalized,
                                  placeholders: (payload && payload.templateData && payload.templateData.placeholders) ? payload.templateData.placeholders : {}
                                });
                              }
                            } catch (e) { }
                            return;
                          }

                          if (requestedAction === 'create_sibling') {
                            try {
                              var parentId = null;
                              try {
                                var selNodeObj = jm.get_node ? jm.get_node(selectedNode.id) : selectedNode;
                                if (selNodeObj && selNodeObj.parent) parentId = selNodeObj.parent;
                                else if (jm.get_parent) {
                                  var p = jm.get_parent(selectedNode.id);
                                  if (p && p.id) parentId = p.id;
                                }
                              } catch (e) { parentId = null; }
                              if (!parentId) parentId = selectedNode.id;
                              var wrapper = { children: (nodeTree && nodeTree.children) ? nodeTree.children : [] };
                              insertNodeTreeChildren(parentId, wrapper, requestId || null);
                              try { _show('success', '已插入同级节点'); } catch (_) { }
                              try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                              return;
                            } catch (e) { }
                          }

                          // else fallback to items extraction and applyAIAction
                          if (typeof applyAIAction === 'function') {
                            var extractItemsFromNodeTree = function (nt) {
                              var res = [];
                              if (!nt) return res;
                              var children = nt.children || (nt.data && nt.data.children) || [];
                              if (!Array.isArray(children)) return res;
                              children.forEach(function (c) {
                                try {
                                  var title = c.topic || (c.data && (c.data.topic || c.data.title)) || c.title || '';
                                  if (!title && c.data && c.data.raw) title = String(c.data.raw || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
                                  if (title) {
                                    var it = { topic: title };
                                    if (c.data && c.data.raw) it.raw = c.data.raw;
                                    res.push(it);
                                  }
                                } catch (e) { }
                              });
                              return res;
                            };
                            var items = extractItemsFromNodeTree(nodeTree);
                            applyAIAction(requestedAction, {
                              selectedNode: selectedNode,
                              itemsToInsert: items,
                              childNodes: items,
                              childTitles: items.map(function (it) { return it.topic || ''; }),
                              parsedText: normalized,
                              placeholders: (payload && payload.templateData && payload.templateData.placeholders) ? payload.templateData.placeholders : {}
                            });
                            try { _show('success', '已通过 converter.astToNodeTree 解析并分发为 ' + items.length + ' 项'); } catch (_) { }
                            try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                            return;
                          }
                        } catch (e) { }
                      }
                      // default: insert as subtree under selectedNode
                      insertNodeTreeChildren(selectedNode.id, nodeTree, requestId || null);
                      try { _show('success', '已通过 converter.astToNodeTree 解析并插入子树'); } catch (_) { }
                      try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                      return;
                    }
                  } catch (convErr) {
                    // md->AST or astToNodeTree failed: fallback to raw processing below
                  }
                }
                // end mdmod processing
                converterInserted = false;
              }).catch(function (err) {
                // dynamic import failed, will fallback to raw
                converterInserted = false;
              });
            }
            // end looksLikeMarkdown branch
            // if converterInserted is false or md not recognized or module not available -> fallback to original line-based parsing
            // fallback parsing (originally commented but we will reuse original fallback behavior)
            // parse into childNodes and childTitles
            var rawLines = normalized.split('\n');
            var childNodes = [];
            var childTitles = [];
            var lastNode = null;

            rawLines.forEach(function (raw) {
              if (!raw || !raw.trim()) return;
              var line = raw.replace(/\t/g, '  ');
              var trimmed = line.trim();

              // header like "# Title" -> level = header length
              var headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
              if (headerMatch) {
                var level = headerMatch[1].length;
                var topic = headerMatch[2].trim();
                if (topic) {
                  var nodeObj = { topic: topic, level: level, notes: '' };
                  childNodes.push(nodeObj);
                  childTitles.push(topic);
                  lastNode = nodeObj;
                }
                return;
              }

              // list items
              var listMatch = line.match(/^(\s*)(?:[-\*\+]|(\d+)[\.、])\s+(.*)$/);
              if (listMatch) {
                var indent = listMatch[1].length;
                var levelFromIndent = Math.floor(indent / 2) + 1;
                var topic = (listMatch[3] || '').trim();
                if (topic) {
                  var nodeObj = { topic: topic, level: levelFromIndent, notes: '' };
                  childNodes.push(nodeObj);
                  childTitles.push(topic);
                  lastNode = nodeObj;
                }
                return;
              }

              // other lines -> append to lastNode notes
              var nonTitleText = trimmed;
              if (nonTitleText) {
                if (lastNode) {
                  lastNode.notes = lastNode.notes ? (lastNode.notes + '\n' + nonTitleText) : nonTitleText;
                } else if (childNodes.length > 0) {
                  var prev = childNodes[childNodes.length - 1];
                  if (prev) {
                    prev.notes = prev.notes ? (prev.notes + '\n' + nonTitleText) : nonTitleText;
                    lastNode = prev;
                  }
                } else {
                  var nodeObj2 = { topic: nonTitleText, level: 1, notes: '' };
                  childNodes.push(nodeObj2);
                  childTitles.push(nonTitleText);
                  lastNode = nodeObj2;
                }
              }
              return;
            }); // end rawLines.forEach

            if (childTitles.length === 0) {
              // fallback to paragraph split
              var paras = normalized.split(/\n{2,}/).map(function (s) { return (s || '').trim(); }).filter(function (s) { return !!s; });
              paras.forEach(function (p) {
                var firstLine = (p.split('\n')[0] || '').trim();
                if (firstLine) childTitles.push(firstLine);
              });
            }

            // dispatch per actionType
            var itemsToInsert = (typeof childNodes !== 'undefined' && Array.isArray(childNodes) && childNodes.length > 0) ? childNodes : childTitles;
            applyAIAction((payload && payload.actionType) ? payload.actionType : 'create_child', {
              selectedNode: selectedNode,
              itemsToInsert: itemsToInsert,
              childNodes: childNodes,
              childTitles: childTitles,
              parsedText: normalized,
              placeholders: (payload && payload.templateData && payload.templateData.placeholders) ? payload.templateData.placeholders : {}
            });
            try { _show('success', 'AI 处理完成，解析到 ' + childTitles.length + ' 项'); } catch (_) { }
            return;

          } catch (err) {
            _show('error', '处理 AI 结果失败');
          }
        } else {
          // error
          const detailMsg = (msg.detail && msg.detail.message) ? msg.detail.message : 'AI 返回错误';
          _show('error', 'AI 生成失败: ' + detailMsg);
        }
      } catch (e) {
        // swallow internal onMessage error
      }
    }; // end onMessage

    window.addEventListener('message', onMessage);

    // timeout handling (30s)
    const timeoutT = setTimeout(function () {
      try {
        window.removeEventListener('message', onMessage);
        const isEmbedded = (window.parent && window.parent !== window);
        if (isEmbedded) {
          // parent/modal should handle
          return;
        }
        _show('error', 'AI 响应超时（30s）');
      } catch (e) { }
    }, 30000);

    // send open request to parent modal
    try {
      // 动态计算窗口标题并注入到 payload，供弹窗显示
      try {
        const actionKey = (payload && payload.actionType) ? payload.actionType : (window.__mw_next_actionType || 'create_child');
        const actionNameMap = {
          create_child: '扩展子节点',
          create_sibling: '创建同级',
          expand_notes: '扩写备注',
          generate_initial_tree: '生成初始树'
        };
        const actionName = actionNameMap[actionKey] || actionKey;
        const nodeTitleForWin = (topic && String(topic).trim())
          ? String(topic).trim()
          : ((realSel && realSel.topic) ? String(realSel.topic).trim() : '');
        payload.title = nodeTitleForWin ? (actionName + '：' + nodeTitleForWin) : actionName;
      } catch (_) { /* noop */ }

      window.parent.postMessage({ type: 'AI_MODAL_OPEN_REQUEST', requestId: requestId, payload: payload }, '*');
      // clear one-time preset keys
      try { delete window.__mw_next_actionType; delete window.__mw_next_templateKey; delete window.__mw_next_placeholders; } catch (_) { }
    } catch (e) {
      clearTimeout(timeoutT);
      window.removeEventListener('message', onMessage);
      _show('error', '发送 AI 请求失败');
    }

  } catch (e) {
    _show('error', 'AI 扩写出错');
  }
} // end expandWithAI

// ------------- 入口快捷函数（保留原调用方式） -----------------
function aiCreateChild() {
  window.__mw_next_actionType = 'create_child';
  window.__mw_next_templateKey = '扩展子节点';
  expandWithAI();
}

function aiCreateSibling() {
  window.__mw_next_actionType = 'create_sibling';
  window.__mw_next_templateKey = '创建同级';
  expandWithAI();
}

function aiExpandNotes() {
  window.__mw_next_actionType = 'expand_notes';
  window.__mw_next_templateKey = '扩写备注';
  expandWithAI();
}

function aiGenerateInitialTree() {
  try {
    var theme = prompt('请输入初始主题（根节点）');
    if (!theme) { _show('warn', '请输入主题'); return; }
    try {
      var root = jm.get_root && jm.get_root();
      if (root && root.id) jm.select_node(root.id);
    } catch (_) { }
    window.__mw_next_actionType = 'generate_initial_tree';
    window.__mw_next_templateKey = '生成初始树';
    window.__mw_next_placeholders = { name: { desc: '初始主题', value: theme } };
    expandWithAI();
  } catch (e) { _show('error', '生成初始树失败'); }
}

// end of file
