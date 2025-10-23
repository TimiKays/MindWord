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
// 用来随机请求ID：生成以 r 开头的随机请求 ID，利用 Math 点 random 生成随机数再转换为 36 进制字符串并截取部分字符。
function _genRequestId() {
  const rid = 'r_' + Math.random().toString(36).slice(2, 10);
  window.__tmp_rid = rid;   // 生成即挂到 window，供顶层 onMessage 直接读取
  return rid;
}

// 消息处理函数（复制自expandWithAI，用于处理AI响应）
// 等 AI 弹窗把结果通过 postMessage 发回来，然后处理结果
const onMessage = function (event) {
  try {
    // 验证消息，并从事件对象中提取消息数据
    const msg = event && event.data;  //拆包
    var isSave = !!(msg && msg.type === 'AI_MODAL_RESULT'); //是AI模块的返回结果
    // 获取请求ID
    var requestId = msg && msg.requestId;
    // 请求ID匹配
    var okId = !!(msg && ((msg.requestId === window.__tmp_rid) || (isSave && !msg.requestId && window.__mw_ai_active_requestId === requestId)));
    // 三个任意一个不满足就不处理了
    if (!msg || msg.type !== 'AI_MODAL_RESULT' || !okId) return;

    // 如果是取消且在用户已处理的请求ID中，直接返回
    if (msg.type === 'AI_MODAL_RESULT' && msg.status === 'cancel') {
      try { if (window.__mw_handled_requests && window.__mw_handled_requests[requestId]) return; } catch (_) { }
    }

    // 清理监听和计时，并消费该条消息ID
    // window.removeEventListener('message', onMessage);
    delete window.__tmp_rid;        // 收完包把 listener 和临时的消息id变量一起清掉
    // clearTimeout(timeoutT);
    try { delete window.__mw_ai_active_requestId; } catch (_) { }

    if (msg.type === 'AI_MODAL_RESULT' && (msg.status === 'ok' || msg.status === 'success')) {
      try {
        const detail = msg.detail || {};
        // 不同AI平台会把返回结果放在不同的字段中，这里尝试提取
        // 支持迷你模式下的 output 字段和传统模式的 detail.text 字段
        const outText = msg.output || detail.output || detail.text || (detail.result && detail.result.text) || '';
        if (!outText) { _show('warn', 'AI 未返回有效内容'); return; }

        // 标记已处理
        try {
          window.__mw_handled_requests[requestId] = true;
          window.__mw_lastHandledId = requestId;
        } catch (_) { }

        // 提取[OUTPUT] 中间的核心内容并去掉头尾空格，去掉\r
        let parsed = outText;
        const m = /\[OUTPUT\]([\s\S]*)\[\/OUTPUT\]/i.exec(outText);
        if (m && m[1]) parsed = m[1].trim();
        var normalized = (parsed || '').replace(/\r/g, '').replace(/\[OUTPUT\]|\[\/OUTPUT\]/gi, '');

        // 处理AI结果 - 直接调用applyAIAction，里面会根据actionType判断进一步处理方式
        // detect markdown
        // var looksLikeMarkdown = /(^\s*#{1,6}\s+)|(^\s*[-\*\+]\s+)|(^\s*\d+[\.\、]\s+)/m.test(normalized);
        var looksLikeMarkdown = true;
        var converterInserted = false;

        if (looksLikeMarkdown) {
          // 直接使用父页面全局converter，无需重复加载
          if (window && window.converter && typeof window.converter.mdToNodeTree === 'function') {
            try {
              // 使用父页面converter直接处理markdown
              const nodeTree = window.converter.mdToNodeTree(normalized);

              if (nodeTree) {

                // helper: insert children from nodeTree
                function insertNodeTreeChildrenLocal(parentIdLocal, ntNodeLocal, requestIdLocal) {
                  if (!ntNodeLocal) return;
                  // reuse global insertNodeTreeChildren to preserve original behavior
                  try {
                    insertNodeTreeChildren(parentIdLocal, ntNodeLocal, requestIdLocal);
                  } catch (e) { }
                }

                var requestedAction = msg.type;
                if (requestedAction && requestedAction !== 'create_child') {
                  try {
                    if (requestedAction === 'generate_initial_tree') {
                      try {
                        // Get the currently selected node since selectedNode is not available in this scope
                        const currentSelectedNode = jm.get_selected_node ? jm.get_selected_node() : null;
                        if (typeof applyAIAction === 'function') {
                          applyAIAction('generate_initial_tree', {
                            selectedNode: currentSelectedNode,
                            itemsToInsert: [],
                            parsedText: normalized,
                            // placeholders: (payload && payload.templateData && payload.templateData.placeholders) ? payload.templateData.placeholders : {}
                          });
                        }
                      } catch (e) { }
                      return;
                    }

                    if (requestedAction === 'create_sibling') {
                      try {
                        // Get the currently selected node since selectedNode is not available in this scope
                        const currentSelectedNode = jm.get_selected_node ? jm.get_selected_node() : null;
                        if (!currentSelectedNode) {
                          _show('warn', '请先选择一个节点');
                          return;
                        }
                        var parentId = null;
                        try {
                          var selNodeObj = jm.get_node ? jm.get_node(currentSelectedNode.id) : currentSelectedNode;
                          if (selNodeObj && selNodeObj.parent) parentId = selNodeObj.parent;
                          else if (jm.get_parent) {
                            var p = jm.get_parent(currentSelectedNode.id);
                            if (p && p.id) parentId = p.id;
                          }
                        } catch (e) { parentId = null; }
                        if (!parentId) parentId = currentSelectedNode.id;

                        // 调试：查看nodeTree的结构
                        console.log('DEBUG: nodeTree structure:', nodeTree);
                        console.log('DEBUG: nodeTree.children:', nodeTree && nodeTree.children);
                        console.log('DEBUG: nodeTree.data:', nodeTree && nodeTree.data);

                        // 尝试多种方式获取子节点：nodeTree.data.children是对的。
                        var children = [];
                        if (nodeTree) {
                          if (nodeTree.children && Array.isArray(nodeTree.children)) {
                            children = nodeTree.children;
                          } else if (nodeTree.data && nodeTree.data.children && Array.isArray(nodeTree.data.children)) {
                            children = nodeTree.data.children;
                          } else if (Array.isArray(nodeTree)) {
                            // nodeTree本身就是数组
                            children = nodeTree;
                          }
                        }

                        console.log('DEBUG: extracted children:', children);
                        var wrapper = { children: children };

                        try {
                          insertNodeTreeChildren(parentId, wrapper, requestId || null);
                          _show('success', '已插入同级节点');
                          if (typeof debouncedSave === 'function') debouncedSave();
                        } catch (e) { console.error('DEBUG: insertNodeTreeChildren error:', e); }

                        return;
                      } catch (e) {
                        console.error('DEBUG: create_sibling error:', e);
                      }
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
                      // Get the currently selected node since selectedNode is not available in this scope
                      const currentSelectedNode = jm.get_selected_node ? jm.get_selected_node() : null;
                      if (!currentSelectedNode) {
                        _show('warn', '请先选择一个节点');
                        return;
                      }
                      var items = extractItemsFromNodeTree(nodeTree);
                      applyAIAction(requestedAction, {
                        selectedNode: currentSelectedNode,
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
                // Get the currently selected node since selectedNode is not available in this scope
                const currentSelectedNode = jm.get_selected_node ? jm.get_selected_node() : null;
                if (!currentSelectedNode) {
                  _show('warn', '请先选择一个节点');
                  return;
                }
                insertNodeTreeChildren(currentSelectedNode.id, nodeTree, requestId || null);
                try { _show('success', '已通过 converter.mdToNodeTree 解析并插入子树'); } catch (_) { }
                try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                return;
              }
            } catch (convErr) {
              console.error('DEBUG: mdToNodeTree error:', convErr);
            }
            converterInserted = true; // 标记已成功通过converter处理
          }
        }
        // end looksLikeMarkdown branch

        // 如果converter处理失败，显示错误信息并返回
        if (!converterInserted) {
          _show('error', 'AI 内容解析失败，请检查内容格式');
          return;
        }

      } catch (err) {
        _show('error', '处理 AI 结果失败');
      }
    } else {
      // error or cancel
      const detailMsg = (msg.detail && msg.detail.message) ? msg.detail.message : 'AI 返回错误';
      // 用户主动关闭弹窗时不显示错误提示
      if (detailMsg === 'user_closed') {
        // 静默处理，不显示任何提示
      } else {
        _show('error', 'AI 生成失败: ' + detailMsg);
      }
    }
  } catch (err) {
    console.error('DEBUG: onMessage error:', err);
    // swallow internal onMessage error
  }
}; // end onMessage


// // 设置超时处理（30秒）
// const timeoutT = setTimeout(function () {
//   try {
//     window.removeEventListener('message', onMessage);
//     delete window.__tmp_rid;        // 收完包把 listener 和临时的消息id变量一起清掉
//     const isEmbedded = (window.parent && window.parent !== window);
//     if (isEmbedded) {
//       // parent/modal should handle
//       return;
//     }
//     _show('error', 'AI 响应超时（30s）');
//   } catch (e) { }
//   // 超时也要把临时变量清掉，防止旧 ID 残留
//   delete window.__tmp_rid;
// }, 30000);

// // 添加消息监听器
window.addEventListener('message', onMessage);

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

/* -------------------- applyAIAction（保留并重构） --------------------
 真正把AI返回的文本解析成树节点并应用到当前选中节点
 保留原 applyAIAction 的分发能力（create_child / create_sibling / expand_notes / generate_initial_tree）
 但把子功能拆成小函数并复用原逻辑（addMany / parseTextToItems / buildTreeFromItems / insertTreeNodes 等）
 */
function applyAIAction(actionType, ctx) {
  // ctx expected: { selectedNode, itemsToInsert, childNodes, childTitles, parsedText, placeholders }
  try {
    const sel = ctx.selectedNode;
    if (!sel) {
      _show('warn', '请先选择一个节点');
      return;
    }

    // AI操作前保存状态（用于撤销管理）
    let preActionState = null;
    if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
      try {
        // 先记录当前状态
        window.undoManager.recordIfChanged();
      } catch (e) {
        console.warn('[AI] 无法记录操作前状态:', e);
      }
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

        // 批量插入完成后记录状态变化（用于撤销管理）
        if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
          try {
            window.undoManager.recordIfChanged();
          } catch (e) {
            console.warn('[AI] 无法记录批量插入节点后的状态:', e);
          }
        }
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

      // 批量插入完成后记录状态变化（用于撤销管理）
      if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
        try {
          window.undoManager.recordIfChanged();
        } catch (e) {
          console.warn('[AI] 无法记录批量插入节点后的状态:', e);
        }
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

        // AI操作完成后记录状态变化（用于撤销管理）
        if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
          try {
            window.undoManager.recordIfChanged();
          } catch (e) {
            console.warn('[AI] 无法记录创建同级节点后的状态:', e);
          }
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

            // AI操作完成后记录状态变化（用于撤销管理）
            if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
              try {
                window.undoManager.recordIfChanged();
              } catch (e) {
                console.warn('[AI] 无法记录备注更新后的状态:', e);
              }
            }
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
                actionType: payload.actionType,
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


/*
 *  expandWithAI 主实现（统一 AI 请求 + 复杂 onMessage 处理） 
 * 
 * 1. 检查是否有选中节点
 * 2. 生成唯一请求ID
 * 3. 准备模板和占位符数据
 * 4. 发送 AI 请求
 * 5. 处理 AI 响应
*/
function expandWithAI() {
  try {
    // 获取当前选中的节点
    const selectedNode = jm.get_selected_node ? jm.get_selected_node() : null;
    if (!selectedNode) { _show('warn', '请先选择一个节点'); return; }

    // 生成唯一的请求ID，用于跟踪这次AI请求
    const requestId = _genRequestId();
    // 将当前请求ID保存到全局变量，用于后续的消息匹配
    try { window.__mw_ai_active_requestId = requestId; } catch (_) { }
    // 初始化已处理请求的记录对象
    try { window.__mw_handled_requests = window.__mw_handled_requests || {}; } catch (_) { window.__mw_handled_requests = {}; }


    // ---------准备模板和占位符数据（使用 MindNodeOperator）--------------
    // 获取选中节点的主题文本
    var topic = selectedNode.topic || '';
    // 初始化变量
    var notes = '';
    var realSel = null;

    // 获取全局节点操作器实例
    var nodeOperator = window.mindNodeOperator || (window.jm ? new MindNodeOperator(window.jm) : null);

    // 获取完整节点对象
    realSel = nodeOperator.getNode(selectedNode.id);
    // 获取节点备注
    notes = nodeOperator.getNodeNotes(selectedNode.id);

    // 获取完整路径
    var fullPath = nodeOperator.getNodeFullPath(selectedNode.id);

    // 获取同级节点列表
    var siblingNodes = nodeOperator.getSiblingTopics(selectedNode.id);

    // 获取 AI 提示模板：从本地存储或全局变量中查找
    var templateText = '';
    try {
      // 首先尝试从 localStorage 获取提示模板列表
      var tplList = localStorage.getItem('promptTemplates');
      if (tplList) {
        try { tplList = JSON.parse(tplList); } catch (e) { tplList = null; }
      }
      // 如果 localStorage 中没有，尝试使用全局变量
      if (!tplList) {
        try { tplList = window.__prompt_templates || tplList; } catch (_) { tplList = tplList || null; }
      }
      // 如果找到了模板列表，根据模板键查找对应模板
      if (Array.isArray(tplList)) {
        // 使用全局变量中设置的模板键，默认为"扩展子节点"
        var key = window.__mw_next_templateKey ? window.__mw_next_templateKey : '扩展子节点';
        for (var ti = 0; ti < tplList.length; ti++) {
          var t = tplList[ti];
          if (t && t.name === key) {
            templateText = t.content || '';  // 找到匹配的模板内容
            break;
          }
        }
      }
    } catch (e) {
      templateText = '';  // 出错时置空
    }
    // 如果最终没有找到模板内容，使用节点主题或默认占位符
    if (!templateText || !String(templateText).trim()) templateText = "请根据用户需求给出回复：{{name}}";

    // “打包”一份传给 AI 的数据（payload），里面包含了当前节点及其周边环境的所有信息，方便 AI 据此生成内容
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
                var parent = nodeOperator ? nodeOperator.getParentNode(selectedNode.id) : (jm.get_parent ? jm.get_parent(selectedNode.id) : null);
                if (parent && (parent.topic || '')) lines.push('父节点: ' + (parent.topic || ''));
                if (siblingNodes) lines.push('同级兄弟: ' + siblingNodes);
                var children = nodeOperator ? nodeOperator.getChildNodes(selectedNode.id) : (selectedNode.children || []);
                var childTitles = children.map(function (c) { return c.topic || ''; }).filter(Boolean).join(', ');
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

    // 设置模板KEY
    try { payload.templateData.templateKey = (window.__mw_next_templateKey || '扩展子节点'); } catch (_) { }
    // 合并所有占位符到 params 字段，方便 AI 直接使用
    try { payload.params = payload.templateData.placeholders; } catch (_) { }
    // 设置操作类型
    try { payload.actionType = (window.__mw_next_actionType || 'create_child'); } catch (_) { }

    // 添加监听器，监听弹窗返回的消息  
    window.addEventListener('message', onMessage);

    // timeout handling (30s)
    const timeoutT = setTimeout(function () {
      try {
        // window.removeEventListener('message', onMessage);
        delete window.__tmp_rid;        // 收完包把 listener 和临时的消息id变量一起清掉
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

      // 如果快速AI开关开启，使用无弹窗模式
      if (window.__quickAIEnabled) {
        payload.mode = 'direct';
      }

      window.parent.postMessage({
        type: 'AI_MODAL_OPEN_REQUEST',
        actionType: payload.actionType,
        requestId: requestId,
        payload: payload
      }, '*');


      // clear one-time preset keys
      try { delete window.__mw_next_actionType; delete window.__mw_next_templateKey; delete window.__mw_next_placeholders; } catch (_) { }
    } catch (e) {
      clearTimeout(timeoutT);
      // window.removeEventListener('message', onMessage);
      delete window.__tmp_rid;        // 收完包把 listener 和临时的消息id变量一起清掉
      _show('error', '发送 AI 请求失败');
    }

  } catch (e) {
    _show('error', 'AI 扩写出错');
    console.error('[AI] 扩写出错:', e);
  }
} // end expandWithAI

// ------------- 入口快捷函数（保留原调用方式） -----------------
function aiCreateChild() {
  // AI操作前保存状态（用于撤销管理）
  if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
    try {
      window.undoManager.recordIfChanged();
    } catch (e) {
      console.warn('[AI] 无法记录创建子节点前的状态:', e);
    }
  }

  window.__mw_next_actionType = 'create_child';
  window.__mw_next_templateKey = '扩展子节点';
  expandWithAI();
}

function aiCreateSibling() {
  // AI操作前保存状态（用于撤销管理）
  if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
    try {
      window.undoManager.recordIfChanged();
    } catch (e) {
      console.warn('[AI] 无法记录创建同级节点前的状态:', e);
    }
  }

  window.__mw_next_actionType = 'create_sibling';
  window.__mw_next_templateKey = '创建同级';
  expandWithAI();
}

function aiExpandNotes() {
  // AI操作前保存状态（用于撤销管理）
  if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
    try {
      window.undoManager.recordIfChanged();
    } catch (e) {
      console.warn('[AI] 无法记录扩写备注前的状态:', e);
    }
  }

  window.__mw_next_actionType = 'expand_notes';
  window.__mw_next_templateKey = '扩写备注';
  expandWithAI();
}

// 老的aiGenerateInitialTree函数已删除，统一使用aiGenerateInitialTreeMini函数

/**
 * 生成初始思维导图
 * 只干“拼 payload → 发消息 → 注册/卸载监听”三件事
 * 绕过初始弹窗，让用户在 AI 组件的迷你输入框里直接键入主题即可生成。
 *
 * @param   {Object}  [options={}]           可选配置
 * @param   {string}  [options.templateKey]  提示词模板键名，默认 "生成初始树"
 * @param   {string}  [options.miniPrompt]   迷你输入框占位文字，默认 "请输入思维导图主题"
 * @param   {Object}  [options.placeholders] 额外占位符，会与默认 { name: … } 合并
 * @param   {boolean} [options.autoRun]      是否立即发送请求，默认 false（等待用户回车）
 *
 * @returns {void}                           无返回值；成功/失败通过全局提示或控制台输出
 *
 * @example
 * // 基本用法
 * aiGenerateInitialTreeMini();
 *
 * // 自定义模板与占位符
 * aiGenerateInitialTreeMini({
 *   templateKey: '生成学习大纲',
 *   miniPrompt: '请输入学习主题',
 *   placeholders: { type: '学习' }
 * });
 */
function aiGenerateInitialTreeMini(options) {
  try {
    // AI操作前保存状态（用于撤销管理）
    if (window.undoManager && typeof window.undoManager.recordIfChanged === 'function') {
      try {
        window.undoManager.recordIfChanged();
      } catch (e) {
        console.warn('[AI] 无法记录生成初始树前的状态:', e);
      }
    }

    // 设置默认参数
    options = options || {};
    var templateKey = options.templateKey || '生成初始树';
    var miniPrompt = options.miniPrompt || '请输入思维导图主题';

    // 选择根节点
    var selectedNode = null;
    try {
      var root = jm.get_root && jm.get_root();
      if (root && root.id) {
        jm.select_node(root.id);
        selectedNode = root;
      }
    } catch (_) {
      // 如果无法获取根节点，创建一个临时节点对象
      selectedNode = { id: 'root', topic: '' };
    }

    // 生成请求ID（关键：用于匹配请求和响应）
    var requestId = _genRequestId();
    try { window.__mw_ai_active_requestId = requestId; } catch (_) { }
    try { window.__mw_handled_requests = window.__mw_handled_requests || {}; } catch (_) { window.__mw_handled_requests = {}; }

    // 设置必要的全局变量（供AIServiceModal.html使用）
    window.__mw_next_actionType = 'generate_initial_tree';
    window.__mw_next_templateKey = templateKey;
    window.__mw_next_placeholders = Object.assign({
      name: { desc: '初始主题', value: '' } // 值将在迷你模式中由用户输入
    }, options.placeholders || {});

    // 构建发送到AI模态框的payload
    var payload = {
      actionType: 'generate_initial_tree',
      templateKey: templateKey,
      title: '生成初始树',
      initialView: 'mini', // 关键：指定迷你模式
      miniPrompt: miniPrompt, // 迷你输入框的占位符
      placeholders: window.__mw_next_placeholders,
      autoRun: options.autoRun || false // 是否自动运行
    };

    // 注册顶层通用回包处理器（无参版）
    window.addEventListener('message', onMessage);
    // 30s 超时器
    window.__mw_ai_timeout_handle = setTimeout(() => {
      // window.removeEventListener('message', onMessage);
      if (!(window.parent && window.parent !== window)) _show('error', 'AI 响应超时（30s）');
    }, 30000);

    // 发送打开AI模态框的请求，父窗口会通过迷你模式打开弹窗
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'AI_MODAL_OPEN_REQUEST',
        actionType: payload.actionType,
        requestId: requestId,
        payload: payload
      }, '*');

      console.log('[ai-handler] 已发送迷你模式AI模态框请求', { requestId: requestId, payload: payload });

    } else {
      // 如果没有父窗口，清理监听器并使用expandWithAI
      // window.removeEventListener('message', onMessage);
      delete window.__tmp_rid;        // 收完包把 listener 和临时的消息id变量一起清掉
      clearTimeout(timeoutT);
      console.warn('[ai-handler] 未找到父窗口，回退到标准模式');
      expandWithAI();
    }

  } catch (e) {
    _show('error', '调用AI迷你模式失败: ' + e.message);
    console.error('[ai-handler] aiGenerateInitialTreeMini error:', e);
  }
}

// 多节点AI操作管理器
class MultiNodeAIManager {
  constructor() {
    this.pendingOperations = new Map(); // 存储待处理的节点操作
    this.operationBatchId = null; // 当前批处理ID
  }

  // 开始多节点AI操作批处理
  startMultiNodeBatch(nodeIds, operationType) {
    this.operationBatchId = 'batch_' + Date.now();

    // 保存批处理前的整体状态
    if (window.undoManager && window.undoManager.recordIfChanged) {
      try {
        window.undoManager.recordIfChanged();
      } catch (e) {
        console.warn('[AI] 无法记录多节点批处理前的状态:', e);
      }
    }

    this.pendingOperations.set(this.operationBatchId, {
      nodeIds: nodeIds,
      operationType: operationType,
      startTime: Date.now(),
      completedNodes: new Set(),
      results: new Map()
    });

    return this.operationBatchId;
  }

  // 记录单个节点完成
  recordNodeComplete(batchId, nodeId, result) {
    const batch = this.pendingOperations.get(batchId);
    if (!batch) return;

    batch.completedNodes.add(nodeId);
    batch.results.set(nodeId, result);

    // 检查是否所有节点都完成
    if (batch.completedNodes.size === batch.nodeIds.length) {
      this.completeBatch(batchId);
    }
  }

  // 完成整个批处理
  completeBatch(batchId) {
    const batch = this.pendingOperations.get(batchId);
    if (!batch) return;

    // 批处理完成后记录最终状态
    setTimeout(() => {
      if (window.undoManager && window.undoManager.recordIfChanged) {
        try {
          window.undoManager.recordIfChanged();
        } catch (e) {
          console.warn('[AI] 无法记录多节点批处理后的状态:', e);
        }
      }
    }, 100); // 延迟确保所有DOM更新完成

    // 清理批处理记录
    this.pendingOperations.delete(batchId);
    this.operationBatchId = null;

    console.log(`[AI] 多节点批处理完成: ${batchId}, 处理了 ${batch.completedNodes.size} 个节点`);
  }

  // 取消批处理
  cancelBatch(batchId) {
    const batch = this.pendingOperations.get(batchId);
    if (!batch) return;

    console.log(`[AI] 取消多节点批处理: ${batchId}`);
    this.pendingOperations.delete(batchId);

    if (this.operationBatchId === batchId) {
      this.operationBatchId = null;
    }
  }

  // 获取当前活动的批处理
  getActiveBatch() {
    if (!this.operationBatchId) return null;
    return this.pendingOperations.get(this.operationBatchId);
  }
}

// 全局实例
window.multiNodeAIManager = new MultiNodeAIManager();

// 多节点AI操作函数
function aiMultiNodeExpand(nodeIds, operationType = 'expand_notes') {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    console.warn('[AI] 没有指定要处理的节点');
    return;
  }

  const batchId = window.multiNodeAIManager.startMultiNodeBatch(nodeIds, operationType);

  console.log(`[AI] 开始多节点批处理: ${batchId}, 节点数: ${nodeIds.length}`);

  // 为每个节点创建AI操作
  nodeIds.forEach((nodeId, index) => {
    setTimeout(() => {
      try {
        // 选择节点
        jm.select_node(nodeId);

        // 设置批处理ID
        window.__mw_multi_node_batch_id = batchId;
        window.__mw_multi_node_node_id = nodeId;

        // 调用相应的AI操作
        switch (operationType) {
          case 'expand_notes':
            aiExpandNotes();
            break;
          case 'create_child':
            aiCreateChild();
            break;
          case 'create_sibling':
            aiCreateSibling();
            break;
          default:
            console.warn(`[AI] 不支持的操作类型: ${operationType}`);
        }
      } catch (e) {
        console.error(`[AI] 处理节点 ${nodeId} 失败:`, e);
        window.multiNodeAIManager.recordNodeComplete(batchId, nodeId, { success: false, error: e.message });
      }
    }, index * 500); // 错开处理时间，避免并发问题
  });

  return batchId;
}

// 修改原有的AI结果处理逻辑，支持多节点批处理
const originalApplyAIAction = window.applyAIAction;
window.applyAIAction = function (actionType, context) {
  const result = originalApplyAIAction.call(this, actionType, context);

  // 检查是否是多节点批处理的一部分
  const batchId = window.__mw_multi_node_batch_id;
  const nodeId = window.__mw_multi_node_node_id;

  if (batchId && nodeId) {
    // 记录节点处理完成
    window.multiNodeAIManager.recordNodeComplete(batchId, nodeId, {
      success: true,
      actionType: actionType,
      timestamp: Date.now()
    });

    // 清理批处理标记
    delete window.__mw_multi_node_batch_id;
    delete window.__mw_multi_node_node_id;
  }

  return result;
};

// end of file
