// ============================================================
// ai-handler.js （重构且保留全部细节行为）
// - 外部接口保持不变： aiCreateChild, aiCreateSibling, aiExpandNotes, aiGenerateInitialTree
// - 保留模板读取、占位符注入、md->AST->nodeTree 转换、insertNodeTreeChildren分发等
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
    console.log('🟢 ai-handler.js 接收消息:', JSON.stringify(msg, null, 2));
    var isSave = !!(msg && msg.type === 'AI_MODAL_RESULT'); //是AI模块的返回结果
    // 获取请求ID
    var requestId = msg.requestId;
    // 请求ID匹配
    var okId = !!((requestId === window.__tmp_rid) || (requestId === window.__mw_ai_active_requestId));

    // 三个任意一个不满足就不处理了
    if (!msg || msg.type !== 'AI_MODAL_RESULT' || !okId) {
      console.info('ID不匹配或不是AI组件的消息，不需处理：', {
        msg: msg,
        msgRequestId: requestId,
        tmpRid: window.__tmp_rid,
        activeRequestId: window.__mw_ai_active_requestId,
        isMatching: okId
      });
      return
    };

    // 如果是取消且在用户已处理的请求ID中，直接返回
    if (msg.type === 'AI_MODAL_RESULT' && msg.status === 'cancel') {
      try {
        if (window.__mw_handled_requests && window.__mw_handled_requests[requestId]) {
          console.warn('该消息是取消状态已处理过了：', requestId);
          return
        };
      } catch (_) { }
    }

    // 消费该条消息ID
    console.info('基础校验通过，开始处理该消息：', msg);
    delete window.__tmp_rid;
    // clearTimeout(timeoutT);
    try { delete window.__mw_ai_active_requestId; } catch (_) { }

    if (msg.type === 'AI_MODAL_RESULT' && (msg.status === 'ok' || msg.status === 'success')) {
      try {
        console.info('是AI组件返回的处理成功消息：', msg);

        // 停止加载动画并恢复按钮状态
        try {
          if (window.__mw_ai_loading_button) {
            window.__mw_ai_loading_button.classList.remove('loading');
            window.__mw_ai_loading_button.style.pointerEvents = '';
            delete window.__mw_ai_loading_button;
          }
        } catch (_) { }

        const currentSelectedNode = jm.get_selected_node ? jm.get_selected_node() : null;
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

        // 获取操作类型
        var requestedAction = msg.actionType || msg.type;
        console.log('🟡 ai-handler.js 获取操作类型:', requestedAction, '原始msg.type:', msg.type, 'msg.actionType:', msg.actionType);

        if (requestedAction === 'expand_notes') {
          var node = currentSelectedNode;
          if (node) {
            node.data = node.data || {};
            var newText = normalized;
            // 获取节点已有的备注内容（如果不存在则为空字符串）
            var oldText = '';
            try {
              oldText = String((node.data && node.data.notes) || '').replace(/\r/g, '');
            } catch (_) {
              oldText = '';
            }

            // 合并新旧备注：如果已有内容，先移除末尾空白，添加换行符，再追加新内容
            if (oldText) {
              // 移除旧内容末尾的空白字符，添加两个换行符，然后追加新内容
              node.data.notes = oldText.replace(/\s+$/, '') + '\n\n' + newText;
            } else {
              // 如果没有旧内容，直接使用新内容
              node.data.notes = newText;
            }
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
        }


        // 处理AI结果（非备注）
        var converterInserted = false;

        /// 转为nodetree
        if (window && window.converter && typeof window.converter.mdToNodeTree === 'function') {
          try {
            // 使用父页面converter直接处理markdown
            const nodeTree = window.converter.mdToNodeTree(normalized);

            if (nodeTree) {
              // 生成初始树
              if (requestedAction === 'generate_initial_tree') {
                try {

                  // 直接使用 jm.show() 替换整个思维导图
                  jm.show(nodeTree);
                  _show('success', '已生成初始思维导图');
                  if (typeof debouncedSave === 'function') debouncedSave();

                  // 快速AI模式下，关闭输入弹窗
                  if (window.__quickAIEnabled) {
                    // 尝试关闭思维导图页面的输入弹窗
                    try {
                      if (window.parent && window.parent.closeAIGenerateModal) {
                        window.parent.closeAIGenerateModal();
                      } else {
                        // 尝试通过消息通知关闭弹窗
                        window.postMessage({ type: 'AI_INITIAL_TREE_GENERATED' }, '*');
                      }
                    } catch (e) {
                      console.warn('关闭输入弹窗失败:', e);
                    }
                  }

                } catch (e) {
                  console.error('生成初始树失败:', e);
                }
                return;
              }

              // 创建同级节点
              if (requestedAction === 'create_sibling') {
                try {

                  // 拿父级ID
                  var parentId = null;
                  try {
                    parentId = currentSelectedNode.parent;
                  } catch (e) { parentId = null; }

                  // 检查nodeTree结构：如果只有一个根节点且有子节点，创建包含子节点的节点树对象
                  var processedNodeTree = nodeTree;
                  if (nodeTree && nodeTree.data) {
                    var data = nodeTree.data;
                    // 如果是单个根节点且有子节点，创建新的节点树对象，包含子节点
                    if (data.children && data.children.length > 0) {
                      processedNodeTree = {
                        data: {
                          children: data.children
                        }
                      };
                    } else if (!data.children || data.children.length === 0) {
                      // 单个叶子节点，保持原样
                      processedNodeTree = nodeTree;
                    }
                  }

                  // 把子树插入当前节点的父级下
                  try {
                    insertNodeTreeChildren(parentId, processedNodeTree, requestId || null);
                    _show('success', '已通过 converter.mdToNodeTree 解析并插入同级节点');
                    if (typeof debouncedSave === 'function') debouncedSave();
                  } catch (e) { console.error('DEBUG: insertNodeTreeChildren error:', e); }

                  return;
                } catch (e) {
                  console.error('DEBUG: create_sibling error:', e);
                }
              }

              // 创建子节点
              if (requestedAction === 'create_child') {

                // 检查nodeTree结构：如果只有一个根节点且有子节点，创建包含子节点的节点树对象
                var processedNodeTree = nodeTree;
                if (nodeTree && nodeTree.data) {
                  var data = nodeTree.data;
                  // 如果是单个根节点且有子节点，创建新的节点树对象，包含子节点
                  if (data.children && data.children.length > 0) {
                    processedNodeTree = {
                      data: {
                        children: data.children
                      }
                    };
                  } else if (!data.children || data.children.length === 0) {
                    // 单个叶子节点，保持原样
                    processedNodeTree = nodeTree;
                  }
                }

                // 默认操作类型：create_child
                insertNodeTreeChildren(currentSelectedNode.id, processedNodeTree, requestId || null);
                try { _show('success', '已通过 converter.mdToNodeTree 解析并插入子树'); } catch (_) { }
                try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                return;
              }
            }
          } catch (convErr) {
            console.error('DEBUG: mdToNodeTree error:', convErr);
          }
          converterInserted = true; // 标记已成功通过converter处理
        }


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
      // 停止加载动画并恢复按钮状态
      try {
        if (window.__mw_ai_loading_button) {
          window.__mw_ai_loading_button.classList.remove('loading');
          window.__mw_ai_loading_button.style.pointerEvents = '';
          delete window.__mw_ai_loading_button;
        }
      } catch (_) { }

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
  } finally {
    // 兜底隐藏加载弹窗，确保无论如何都会执行
    if (typeof hideLoadingModal === 'function') {
      hideLoadingModal();
    }
  }
}; // end onMessage


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

      // 辅助函数：清理内容中的特殊字符，避免分隔符冲突
      const cleanContent = (content) => {
        if (!content) return '';
        return String(content).replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ').trim();
      };

      lines.push('当前节点名称: ' + cleanContent(topic));
      const rawVal = _safe(() => node.data.data.raw, '') || '';
      if (rawVal) lines.push('当前节点的markdown原始内容: ' + cleanContent(rawVal));
      if (notes) lines.push('当前节点备注: ' + cleanContent(notes));
      const parent = (jm && jm.get_parent) ? jm.get_parent(node.id) : null;
      if (parent && (parent.topic || '')) lines.push('当前节点的直属父节点: ' + cleanContent(parent.topic));
      lines.push('当前节点及所有父级全路径: ' + cleanContent(fullPath));

      // 添加所有父级节点及其备注信息
      const allParentsInfo = [];
      let currentNode = node;
      while (currentNode) {
        const parentNode = (jm && jm.get_parent) ? jm.get_parent(currentNode.id) : null;
        if (!parentNode || !parentNode.topic) break;
        const parentNotes = (parentNode.data && parentNode.data.notes) ? parentNode.data.notes : '';
        const cleanTopic = cleanContent(parentNode.topic);
        const cleanNotes = cleanContent(parentNotes);
        if (cleanNotes) {
          allParentsInfo.push(`${cleanTopic} (${cleanNotes})`);
        } else {
          allParentsInfo.push(cleanTopic);
        }
        currentNode = parentNode;
      }
      if (allParentsInfo.length > 0) {
        lines.push('所有父级节点及其备注: ' + allParentsInfo.join(' → '));
      }

      if (siblingNodes) lines.push('当前节点已有同级兄弟节点: ' + cleanContent(siblingNodes));
      const childTitles = (node && Array.isArray(node.children)) ? node.children.map(c => c.topic || '').filter(Boolean).join(', ') : '';
      if (childTitles) lines.push('当前节点已有子节点: ' + cleanContent(childTitles));

      // 使用更清晰的分隔符，避免与内容冲突
      return lines.join(' || ');
    } catch (e) {
      console.warn('[AI] 上下文构建失败:', e);
      return '当前节点名称: ' + cleanContent(topic) + ' | 当前节点及所有父级全路径: ' + cleanContent(fullPath);
    }
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
  // ctx expected: { selectedNode, itemsToInsert, childNodes, childTitles, parsedText, placeholders, nodeTree }
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

    // 优先使用nodeTree，如果没有则使用itemsToInsert
    let items = [];
    if (ctx.nodeTree) {
      // 如果有nodeTree，提取其中的子节点作为items
      const children = ctx.nodeTree.children || (ctx.nodeTree.data && ctx.nodeTree.data.children) || [];
      items = Array.isArray(children) ? children : [];
    } else {
      // 回退到原来的itemsToInsert逻辑
      items = Array.isArray(ctx.itemsToInsert) ? ctx.itemsToInsert : [];
    }

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
            if (n.notes) nodeData.notes = n.notes;
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



/*
 *  expandWithAI 主实现（统一 AI 请求 + 复杂 onMessage 处理） 
 * 
 * 1. 检查是否有选中节点
 * 2. 生成唯一请求ID
 * 3. 准备模板和占位符数据
 * 4. 发送 AI 请求
 * 5. 绑定 AI 响应事件
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
            desc: '当前节点的上下文摘要', value: (function () {
              try {
                // 辅助函数：清理内容中的特殊字符，避免分隔符冲突
                var cleanContent = function (content) {
                  if (!content) return '';
                  return String(content).replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ').trim();
                };

                var lines = [];
                lines.push('当前节点名称（输出时避免提及）: ' + cleanContent(topic));

                var rawVal = _safe(function () { return selectedNode.data.data.raw; }, '') || '';
                lines.push('当前节点markdown原始内容（用于参照）: ' + cleanContent(rawVal));
                if (notes) lines.push('当前节点的备注内容: ' + cleanContent(notes));
                var parent = nodeOperator ? nodeOperator.getParentNode(selectedNode.id) : (jm.get_parent ? jm.get_parent(selectedNode.id) : null);
                if (parent && (parent.topic || '')) lines.push('当前节点的直属父节点（用于理解上文）: ' + cleanContent(parent.topic));
                lines.push('当前节点完整路径（从上至下，用于理解上文）: ' + cleanContent(fullPath));

                // 添加所有父级节点及其备注信息
                var allParentsInfo = [];
                var currentNode = selectedNode;
                while (currentNode) {
                  var parentNode = nodeOperator ? nodeOperator.getParentNode(currentNode.id) : (jm.get_parent ? jm.get_parent(currentNode.id) : null);
                  if (!parentNode || !parentNode.topic) break;
                  var parentNotes = (parentNode.data && parentNode.data.notes) ? parentNode.data.notes : '';
                  var cleanTopic = cleanContent(parentNode.topic);
                  var cleanNotes = cleanContent(parentNotes);
                  if (cleanNotes) {
                    allParentsInfo.push(cleanTopic + ' (' + cleanNotes + ')');
                  } else {
                    allParentsInfo.push(cleanTopic);
                  }
                  currentNode = parentNode;
                }
                if (allParentsInfo.length > 0) {
                  lines.push('所有父级节点及其备注（从下往上，用于理解完整上文）: ' + allParentsInfo.join(' → '));
                }

                if (siblingNodes) lines.push('当前节点已有同级兄弟（尽量保持相同格式但避免与其重复）: ' + cleanContent(siblingNodes));
                var children = nodeOperator ? nodeOperator.getChildNodes(selectedNode.id) : (selectedNode.children || []);
                var childTitles = children.map(function (c) { return c.topic || ''; }).filter(Boolean).join(', ');
                if (childTitles) lines.push('当前节点已有子节点（尽量保持相同格式但避免与其重复）: ' + cleanContent(childTitles));

                // 使用更清晰的分隔符，避免与内容冲突
                return lines.join(' 。\n\n ');
              } catch (e) {
                return '当前节点名称: ' + cleanContent(topic) + ' | 当前节点及所有父级全路径: ' + cleanContent(fullPath);
              }
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
    }, 60000);

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
        payload.mode = 'silent';
      }

      window.parent.postMessage({
        type: 'AI_MODAL_OPEN',
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

/**
 * 生成初始思维导图
 * 只干“拼 payload → 发消息 → 注册/卸载监听”三件事
 * 绕过初始弹窗，让用户在 AI 组件的迷你输入框里直接键入主题即可生成。
 *
 * @param   {Object}  [options={}]           可选配置
 * @param   {string}  [options.templateKey]  提示词模板键名，默认 "生成初始树"
 * @param   {string}  [options.miniPrompt]   迷你输入框占位符文本
 * @param   {boolean} [options.autoRun]      是否自动运行（跳过输入）
 * @param   {Object}  [options.placeholders] 额外占位符，会与默认 { name: … } 合并
 */
/**
 * 生成初始树 - 迷你模式（无弹窗或迷你弹窗）
 * @param   {Object}  options                配置选项
 * @param   {string}  [options.templateKey]  提示词模板键名，默认 "生成初始树"
 * @param   {string}  [options.miniPrompt]   迷你输入框占位符文本
 * @param   {boolean} [options.autoRun]      是否自动运行（跳过输入）
 * @param   {Object}  [options.placeholders] 占位符对象，默认为 { name: … } 合并
 */
function aiGenerateInitialTreeMini(options = {}) {
  try {
    // AI操作前保存状态（用于撤销管理）
    if (window.undoManager && window.undoManager.recordIfChanged) {
      try {
        window.undoManager.recordIfChanged();
      } catch (e) {
        console.warn('[AI] 无法记录AI操作前的状态:', e);
      }
    }

    // 获取配置参数
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

    // 获取模板内容 - 解决无头模式下模板为空的问题
    var templateContent = '';
    try {
      // 尝试从AIServiceModal.html的全局变量获取模板列表
      if (window.parent && window.parent.promptTemplates && Array.isArray(window.parent.promptTemplates)) {
        // 在父窗口中查找模板
        for (var i = 0; i < window.parent.promptTemplates.length; i++) {
          var tpl = window.parent.promptTemplates[i];
          if (tpl && tpl.name === templateKey && tpl.content) {
            templateContent = tpl.content;
            break;
          }
        }
      }

      // 如果父窗口没有找到，尝试从localStorage获取
      if (!templateContent) {
        var storedTemplates = localStorage.getItem('promptTemplates');
        if (storedTemplates) {
          var templates = JSON.parse(storedTemplates);
          if (Array.isArray(templates)) {
            for (var j = 0; j < templates.length; j++) {
              var tpl2 = templates[j];
              if (tpl2 && tpl2.name === templateKey && tpl2.content) {
                templateContent = tpl2.content;
                break;
              }
            }
          }
        }
      }

      // 如果仍然没有找到，使用默认模板
      if (!templateContent) {
        templateContent = '你是一个专业的内容创作顾问。请帮用户创作高质量的内容。\n\n创作指导原则：\n1. 明确目标受众\n2. 确定内容主题和核心信息\n3. 设计内容结构框架\n4. 提供创意角度和观点\n5. 优化内容表达方式\n6. 增强内容吸引力\n7. 考虑SEO和传播效果\n\n内容类型包括：\n- 文章写作\n- 社交媒体内容\n- 营销文案\n- 视频脚本\n- 演讲稿\n- 产品描述\n\n请根据具体内容类型提供针对性的建议。\n\n当前主题：{{name}}';
      }
    } catch (e) {
      console.warn('[ai-handler] 获取模板内容失败，使用默认模板:', e);
      templateContent = '你是一个专业的内容创作顾问。请帮用户创作高质量的内容。\n\n当前主题：{{name}}';
    }

    // 构建发送到AI模态框的payload
    var payload = {
      actionType: 'generate_initial_tree',
      templateKey: templateKey,
      title: '生成初始树',
      initialView: 'mini', // 关键：指定迷你模式
      miniPrompt: miniPrompt, // 迷你输入框的占位符
      placeholders: window.__mw_next_placeholders,
      params: window.__mw_next_placeholders, // 兼容AIServiceModal.html的params参数
      autoRun: options.autoRun || false, // 是否自动运行
      // 关键：添加templateData以确保模板内容可用
      templateData: {
        templateText: templateContent,
        templateKey: templateKey,
        placeholders: window.__mw_next_placeholders
      }
    };

    // 如果快速AI开关开启，使用无弹窗模式
    if (window.__quickAIEnabled) {
      payload.mode = 'silent';

      // 在无感模式下显示加载提示
      try {
        showLoadingModal('正在生成思维导图，请稍候...');
      } catch (e) {
        console.warn('[ai-handler] 显示加载提示失败:', e);
      }
    }

    // 注册顶层通用回包处理器（无参版）
    window.addEventListener('message', onMessage);
    // 30s 超时器
    window.__mw_ai_timeout_handle = setTimeout(() => {
      // window.removeEventListener('message', onMessage);
      if (!(window.parent && window.parent !== window)) _show('error', 'AI 响应超时（30s）');

      // 清理加载提示
      try {
        hideLoadingModal();
      } catch (e) {
        console.warn('[ai-handler] 隐藏加载提示失败:', e);
      }
    }, 60000);

    // 发送打开AI模态框的请求，父窗口会通过迷你模式打开弹窗
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'AI_MODAL_OPEN',
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

      // 清理加载提示
      try {
        hideLoadingModal();
      } catch (e) {
        console.warn('[ai-handler] 隐藏加载提示失败:', e);
      }
    }

  } catch (e) {
    _show('error', '调用AI迷你模式失败: ' + e.message);
    console.error('[ai-handler] aiGenerateInitialTreeMini error:', e);

    // 清理加载提示
    try {
      hideLoadingModal();
    } catch (e2) {
      console.warn('[ai-handler] 隐藏加载提示失败:', e2);
    }
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
