
// 动作分发器：根据 actionType 处理不同入口
// ctx: { selectedNode, itemsToInsert, childNodes, childTitles, parsedText }
function applyAIAction(actionType, ctx) {
  try {
    const sel = ctx.selectedNode;
    if (!sel) {
      showWarning && showWarning('请先选择一个节点');
      return;
    }
    const items = Array.isArray(ctx.itemsToInsert) ? ctx.itemsToInsert : [];
    // 新版 addMany：支持从带缩进/Markdown 的多层列表文本构建树并递归插入
    const addMany = function (parentId) {
      // 如果 items 已经包含对象并带有 level 字段，则优先按 level 插入（兼容旧行为）
      const hasLevelField = items.some(i => i && typeof i === 'object' && (i.level !== undefined && i.level !== null));

      // 辅助：将多行文本解析为节点项数组，支持 Markdown 无序/有序列表与缩进
      function parseTextToItems(text) {
        const lines = String(text || '').replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/\t/g, '    '));
        const result = [];
        for (let rawLine of lines) {
          const line = rawLine.replace(/\u00A0/g, ''); // 去除不间断空格
          if (line.trim() === '') continue;
          // 匹配前导空格数和列表标记（-, *, +, 或数字.）
          const m = line.match(/^(\s*)([-*+]|\d+\.)?\s*(.*)$/);
          if (!m) continue;
          const indent = m[1] ? m[1].length : 0;
          const marker = m[2] || null;
          const content = (m[3] || '').trim();
          // 计算层级：每4个空格为一级（经验值），同时如果有列表标记也视为有效项
          const level = Math.floor(indent / 4);
          result.push({ topic: content, raw: rawLine, level, marker });
        }
        return result;
      }

      // 辅助：把扁平的带 level 项转换成树结构（parent->children）
      function buildTreeFromItems(flatItems) {
        const root = { children: [] };
        const stack = [{ level: -1, node: root }];
        flatItems.forEach(it => {
          const node = Object.assign({ topic: String(it.topic || ''), raw: it.raw || '' }, it);
          node.children = [];
          // 找到合适的父层：从栈顶往下找第一个 level < node.level
          while (stack.length > 0 && stack[stack.length - 1].level >= (node.level || 0)) {
            stack.pop();
          }
          stack[stack.length - 1].node.children.push(node);
          stack.push({ level: node.level || 0, node });
        });
        return root.children;
      }

      // 递归插入树节点
      function insertTreeNodes(parentId, nodes) {
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
              if (Object.keys(nodeData).length > 0) {
                jm.add_node(parentId, nid, topicStr, nodeData);
              } else {
                jm.add_node(parentId, nid, topicStr);
              }
            } catch (err) {
              try { jm.add_node(parentId, nid, topicStr); } catch (_) { console.warn('插入节点失败', _); }
            }
            // 递归插入子节点
            if (Array.isArray(n.children) && n.children.length > 0) {
              insertTreeNodes(nid, n.children);
            }
          } catch (e) {
            console.warn('插入树节点失败', e);
          }
        });
      }

      try {
        if (hasLevelField) {
          // 如果 items 已含层级信息，先将 items 转换为扁平结构并按 level 构建树
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
          // 否则将所有字符串项合并为文本并解析为带层级的项
          const combined = [];
          items.forEach(it => {
            if (typeof it === 'string') {
              // 如果字符串含多行，则解析多行
              const parsed = parseTextToItems(it);
              if (parsed.length > 0) parsed.forEach(p => combined.push(p));
            } else if (it && typeof it === 'object') {
              // 对象项按 topic 字段处理（保留 raw/notes）
              const topic = (it.topic !== undefined) ? String(it.topic) : '';
              const raw = it.raw || topic;
              const lvl = (it.level !== undefined && it.level !== null) ? parseInt(it.level, 10) || 0 : 0;
              combined.push({ topic, raw, level: lvl });
            } else {
              combined.push({ topic: String(it), raw: String(it), level: 0 });
            }
          });
          // 构建树并插入
          const tree = buildTreeFromItems(combined);
          insertTreeNodes(parentId, tree);
        }
      } catch (e) {
        console.warn('addMany 批量插入（分层）失败，回退到逐项插入：', e);
        // 回退：保持原来的逐项插入行为，保证兼容性
        items.forEach(function (item) {
          try {
            var topicStr = '';
            var nodeData = {};
            if (typeof item === 'string') {
              topicStr = item;
            } else if (item && typeof item === 'object') {
              topicStr = (item.topic !== undefined) ? String(item.topic) : '';
              if (item.level !== undefined && item.level !== null) nodeData.level = item.level;
              if (item.raw) nodeData.raw = item.raw;
              if (item.notes) nodeData.notes = item.notes;
            } else {
              topicStr = String(item);
            }
            if (!topicStr) return;
            const nid = 'n_' + Math.random().toString(36).slice(2, 9);
            try {
              if (Object.keys(nodeData).length > 0) {
                jm.add_node(parentId, nid, topicStr, nodeData);
              } else {
                jm.add_node(parentId, nid, topicStr);
              }
            } catch (_err) {
              jm.add_node(parentId, nid, topicStr);
            }
          } catch (e) { console.warn('批量插入节点项失败', e); }
        });
      }
    };

    switch (actionType) {
      case 'create_sibling': {
        // 插入同级：优先通过真实节点对象的 parent，兼容回退到 jm.get_parent(id)
        var nodeObj = null, parent = null;
        try { nodeObj = jm.get_node ? jm.get_node(sel.id) : sel; } catch (_) { nodeObj = sel; }
        try { parent = (nodeObj && nodeObj.parent) ? nodeObj.parent : null; } catch (_) { parent = null; }
        if (!parent) {
          try { parent = (jm.get_parent && sel && sel.id) ? jm.get_parent(sel.id) : null; } catch (_) { parent = null; }
        }
        if (parent && parent.id) {
          addMany(parent.id);
        } else {
          // 根节点无同级：降级为添加子级并提示
          addMany(sel.id);
          try { showWarning && showWarning('根节点无法添加同级，已改为添加子级'); } catch (_) { }
        }
        break;
      }
      case 'expand_notes': {
        // 扩写备注：将解析文本追加到选中节点备注（用空行隔开），无备注则直接写入
        try {
          var node = jm.get_node ? jm.get_node(sel.id) : sel;
          if (node) {
            node.data = node.data || {};
            var newText = String(ctx.parsedText || '').replace(/\r/g, '').trim();
            var oldText = '';
            try { oldText = String((node.data && node.data.notes) || '').replace(/\r/g, ''); } catch (_) { oldText = ''; }
            console.debug('[MW][AI][expand_notes] before', { id: node.id, oldLen: (oldText || '').length, appendLen: (newText || '').length });
            node.data.notes = oldText ? (oldText.replace(/\\s+$/, '') + '\\n\\n' + newText) : newText;
            try { node.notes = node.data.notes; } catch (_) { }
            console.debug('[MW][AI][expand_notes] after', { id: node.id, totalLen: ((node.data && node.data.notes) ? node.data.notes.length : 0) });
            jm.update_node(node.id, node.topic || '');
            // 同步详情面板 textarea 并触发输入事件，复用 handleAutoUpdate 的保存/同步流程
            try {
              var ta = document.getElementById('nodeNotes');
              if (ta) {
                ta.value = node.data.notes || '';
                console.debug('[MW][AI][expand_notes] sync textarea#nodeNotes -> dispatch input');
                ta.dispatchEvent(new Event('input', { bubbles: true }));
              } else {
                console.debug('[MW][AI][expand_notes] textarea#nodeNotes not found');
              }
            } catch (e) { console.warn('[MW][AI][expand_notes] textarea sync failed', e); }
            console.debug('[MW][AI][expand_notes] funcs', {
              refreshAllNotesDisplay: typeof refreshAllNotesDisplay,
              saveToLocalStorage: typeof saveToLocalStorage,
              showAutoUpdateIndicator: typeof showAutoUpdateIndicator,
              debouncedSave: typeof debouncedSave,
              w_refreshAllNotesDisplay: typeof window.refreshAllNotesDisplay,
              w_saveToLocalStorage: typeof window.saveToLocalStorage,
              w_showAutoUpdateIndicator: typeof window.showAutoUpdateIndicator,
              w_debouncedSave: typeof window.debouncedSave
            });
            try {
              if (typeof refreshAllNotesDisplay === 'function') refreshAllNotesDisplay();
              else if (typeof window.refreshAllNotesDisplay === 'function') window.refreshAllNotesDisplay();
            } catch (e1) { console.warn('[MW][AI][expand_notes] refreshAllNotesDisplay failed', e1); }
            try {
              if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
              else if (typeof window.saveToLocalStorage === 'function') window.saveToLocalStorage();
            } catch (e2) { console.warn('[MW][AI][expand_notes] saveToLocalStorage failed', e2); }
            try {
              if (typeof showAutoUpdateIndicator === 'function') showAutoUpdateIndicator();
              else if (typeof window.showAutoUpdateIndicator === 'function') window.showAutoUpdateIndicator();
            } catch (e3) { console.warn('[MW][AI][expand_notes] showAutoUpdateIndicator failed', e3); }
            try {
              if (typeof debouncedSave === 'function') debouncedSave();
              else if (typeof window.debouncedSave === 'function') window.debouncedSave();
            } catch (e4) { console.warn('[MW][AI][expand_notes] debouncedSave failed', e4); }
          }
        } catch (e) {
          console.warn('更新备注失败', e);
          showError && showError('更新备注失败');
        }
        break;
      }
      case 'generate_initial_tree': {
        // 简化方案：不在导图内解析，直接把 AI 返回的 Markdown 发给编辑器并触发保存/同步
        try {
          // 取 parsedText（由 expandWithAI 传入），若无则兜底 itemsToInsert 拼接
          var md = '';
          try {
            md = (typeof ctx.parsedText === 'string') ? ctx.parsedText : '';
          } catch (_) { md = ''; }
          if (!md) {
            // 兜底：从 itemsToInsert 拼成 Markdown（每项一行）
            var itemsList = Array.isArray(ctx.itemsToInsert) ? ctx.itemsToInsert : [];
            md = itemsList.map(function (it) {
              if (typeof it === 'string') return it;
              if (it && typeof it === 'object') return (it.raw || it.topic || '');
              return String(it || '');
            }).filter(Boolean).join(String.fromCharCode(10));
          }
          md = String(md || '');
          if (!md.trim()) {
            showWarning && showWarning('AI 未返回有效 Markdown，无法生成初始树');
            break;
          }

          // 在父页查找编辑器 iframe
          var editorFrame = null;
          try { editorFrame = window.parent && window.parent.document && window.parent.document.querySelector('iframe[data-panel="editor"]'); } catch (e) { editorFrame = null; }
          if (!editorFrame) {
            try { editorFrame = window.parent && window.parent.document && window.parent.document.getElementById('iframe-editor'); } catch (e) { /* ignore */ }
          }
          if (!editorFrame) {
            try { editorFrame = window.parent && window.parent.document && window.parent.document.querySelector('iframe[src*="editor/editor.html"]'); } catch (e) { /* ignore */ }
          }
          var targetWin = (editorFrame && editorFrame.contentWindow) ? editorFrame.contentWindow : null;
          if (!targetWin) {
            showError && showError('未找到编辑器面板，无法替换文档内容');
            break;
          }

          // 发送“设置 Markdown”与“保存/同步”的消息到编辑器
          try {
            targetWin.postMessage({ type: 'editor-set-markdown', markdown: md, requestId: (window.__mw_ai_active_requestId || null), source: 'mindmap' }, '*');
          } catch (e1) { console.warn('[MW][AI] post editor-set-markdown failed', e1); }
          setTimeout(function () {
            try {
              targetWin.postMessage({ type: 'editor-save-or-sync', reason: 'generate_initial_tree', requestId: (window.__mw_ai_active_requestId || null), source: 'mindmap' }, '*');
            } catch (e2) { console.warn('[MW][AI] post editor-save-or-sync failed', e2); }
          }, 50);

          try { showSuccess && showSuccess('已将内容发送到编辑器并触发保存/同步'); } catch (_) { }
        } catch (e) {
          console.warn('生成初始树发送到编辑器失败', e);
          showError && showError('生成初始树失败');
        }
        break;
      }
      case 'create_child':
      default: {
        addMany(sel.id);
        break;
      }
    }

    try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (e) { }
  } catch (e) {
    console.error('applyAIAction 处理失败', e);
    showError && showError('处理 AI 动作失败: ' + (e && e.message ? e.message : String(e)));
  }
}


// --- extracted block from original HTML ---
// AI扩写函数（改为使用父层托管的 AI 弹窗组件，modal 模式）

// 入口快捷函数：通过 window.__mw_next_* 传递 actionType / 模板 / 占位符
function aiCreateChild() {
  window.__mw_next_actionType = 'create_child';
  window.__mw_next_templateKey = '扩展子节点';
  expandWithAI();
}
function aiCreateSibling() {
  window.__mw_next_actionType = 'create_sibling';
  window.__mw_next_templateKey = '创建同级'; // 如有专用模板，可改为 '扩展同级'
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
    if (!theme) { showWarning && showWarning('请输入主题'); return; }
    // 若未选中节点，尝试选中根节点，便于插入
    try {
      var root = jm.get_root && jm.get_root();
      if (root && root.id) jm.select_node(root.id);
    } catch (_) { }
    window.__mw_next_actionType = 'generate_initial_tree';
    window.__mw_next_templateKey = '生成初始树';
    window.__mw_next_placeholders = { name: { desc: '初始主题', value: theme } };
    expandWithAI();
  } catch (e) { showError && showError('生成初始树失败: ' + (e.message || e)); }
}

// AI扩写函数（改为使用父层托管的 AI 弹窗组件，modal 模式）
function expandWithAI() {
  try {
    const selectedNode = jm.get_selected_node();
    if (!selectedNode) {
      showWarning('请先选择一个节点');
      return;
    }

    // 构造 requestId
    function genId() { return 'r_' + Math.random().toString(36).slice(2, 10); }
    const requestId = genId();
    try { window.__mw_ai_active_requestId = requestId; } catch (_) { }
    try { window.__mw_handled_requests = window.__mw_handled_requests || {}; } catch (_) { window.__mw_handled_requests = {}; }

    // 准备 templateData：使用预设模板（扩展子节点），并注入真实上下文
    var topic = selectedNode.topic || '';
    // 优先从最新节点数据读取备注；回退到详情面板输入
    var _nodeLatest = null;
    try { _nodeLatest = jm.get_node ? jm.get_node(selectedNode.id) : selectedNode; } catch (_) { _nodeLatest = selectedNode; }
    var notes = (_nodeLatest && _nodeLatest.data && _nodeLatest.data.notes) ? _nodeLatest.data.notes
      : (document.getElementById('nodeNotes') ? document.getElementById('nodeNotes').value : '');

    // 计算 fullPath 与 siblingNodes（若可用）
    function _computeFullPath(n) {
      try {
        if (typeof window.getNodeFullPath === 'function') return window.getNodeFullPath(n);
      } catch (_) { /* ignore */ }
      try {
        var path = [];
        var cur = n;
        while (cur) {
          path.unshift(cur.topic || '');
          var p = jm.get_parent ? jm.get_parent(cur.id) : null;
          if (!p) break;
          cur = p;
        }
        return path.join(' / ');
      } catch (e) {
        return n.topic || '';
      }
    }
    // 统一使用真实节点对象，避免轻量对象丢失父链/children
    var realSel = null;
    try { realSel = jm.get_node ? jm.get_node(selectedNode.id) : selectedNode; } catch (_) { realSel = selectedNode; }

    // 完整路径：从根到当前节点
    function _computeFullPathStrict(n) {
      try {
        // 若有外部工具函数则优先
        if (typeof window.getNodeFullPath === 'function') return window.getNodeFullPath(n);
      } catch (_) { /* ignore */ }
      try {
        var path = [];
        var cur = n;
        while (cur) {
          path.unshift(cur.topic || '');
          cur = (jm.get_parent && cur.id) ? jm.get_parent(cur.id) : null;
        }
        return path.join(' / ');
      } catch (e) { return n && (n.topic || ''); }
    }
    var fullPath = '';
    try {
      fullPath = (realSel && realSel.data && (realSel.data.fullPath || (realSel.data.data && realSel.data.data.fullPath))) || '';
    } catch (e) {
      fullPath = (realSel && realSel.topic) ? realSel.topic : '';
    }

    // 兄弟节点：直接从节点数据中读取（优先使用 data.siblingNodes）
    var siblingNodes = '';
    try {
      var sib = (realSel && realSel.data && (realSel.data.siblingNodes || (realSel.data.data && realSel.data.data.siblingNodes))) || [];
      if (Array.isArray(sib)) {
        siblingNodes = sib.filter(Boolean).join(', ');
      } else if (typeof sib === 'string') {
        siblingNodes = sib;
      }
    } catch (e) { siblingNodes = ''; }

    // 从 prompt-templates.json 中读取“扩展子节点”模板内容（若无法访问则回退）
    var templateText = '';
    try {
      var tplList = window.__prompt_templates || null;
      if (!tplList) {
        // lazy load from ai/newai/prompt-templates.json if available via fetch (silent)
        try {
          // sync attempt may fail in file://; fallback to default string
          // we will try to read from a global if demo pages preloaded templates
          tplList = window.__prompt_templates || tplList;
        } catch (err) { tplList = tplList || null; }
      }
      if (Array.isArray(tplList)) {
        var key = (typeof window.__mw_next_templateKey === 'string' && window.__mw_next_templateKey) ? window.__mw_next_templateKey : '扩展子节点';
        for (var ti = 0; ti < tplList.length; ti++) {
          var t = tplList[ti];
          if (t && t.name === key) { templateText = t.content || ''; break; }
        }
      }
    } catch (e) { templateText = ''; }

    // 最终回退策略：如果没有模板则使用 topic 或简单占位符
    if (!templateText || !String(templateText).trim()) {
      templateText = topic || '{{name}}';
    }

    var payload = {
      // modal 模式：不设置 mode 或确保不是 'direct'
      platformConfig: {}, // 可选：留空由父页面选择已保存平台或打开配置
      modelConfig: {},
      templateData: {
        templateText: templateText,
        placeholders: {
          // 对齐新组件默认占位符格式 {{name}}
          name: { desc: '节点主题', value: topic },
          notes: { desc: '节点备注', value: notes },
          fullPath: { desc: '节点完整路径', value: fullPath },
          siblingNodes: { desc: '同级兄弟节点（以逗号分隔）', value: siblingNodes },
          nodeId: { desc: '节点ID', value: selectedNode.id },
          // 补充上下文摘要，复用旧逻辑思想：提供可读文本，便于模板直接引用 {{context}}
          context: {
            desc: '节点上下文摘要',
            value: (function () {
              try {
                var lines = [];
                lines.push('节点: ' + (topic || ''));
                lines.push('路径: ' + (fullPath || ''));
                // 注入 raw 信息（仅当节点自身包含 raw 字段时）
                var rawVal = selectedNode.data.data.raw || '';


                lines.push('raw: ' + rawVal);

                if (notes) lines.push('备注: ' + notes);
                if (parent && (parent.topic || '')) lines.push('父节点: ' + (parent.topic || ''));
                if (siblingNodes) lines.push('同级兄弟: ' + siblingNodes);
                var childTitles = (selectedNode.children || []).map(function (c) { return c.topic || ''; }).filter(Boolean).join(', ');
                if (childTitles) lines.push('已有子节点: ' + childTitles);
                return lines.join('\n');
              } catch (e) {
                return (topic || '') + '\n' + (fullPath || '');
              }
            })()
          }
        }
      },
      options: {}
    };

    // 合并外部指定的占位符（如生成初始树传入主题）
    try {
      var extraPH = (window.__mw_next_placeholders && typeof window.__mw_next_placeholders === 'object') ? window.__mw_next_placeholders : null;
      if (extraPH) {
        Object.keys(extraPH).forEach(function (k) {
          payload.templateData.placeholders[k] = extraPH[k];
        });
      }
    } catch (_) { }

    // 指定模板 key 与参数映射；actionType 支持外部预设
    try { payload.templateData.templateKey = (window.__mw_next_templateKey || '扩展子节点'); } catch (e) { }
    try { payload.params = payload.templateData.placeholders; } catch (e) { }
    try { payload.actionType = (window.__mw_next_actionType || 'create_child'); } catch (_) { }

    // 临时消息处理器：等待 AI_MODAL_RESULT 回来
    const onMessage = function (e) {
      try {
        const msg = e && e.data;
        var isSave = !!(msg && msg.type === 'AI_MODAL_SAVE_OUTPUT');
        var okId = !!(msg && (
          (msg.requestId === requestId) ||
          (isSave && !msg.requestId && window.__mw_ai_active_requestId === requestId)
        ));
        if (!msg || (msg.type !== 'AI_MODAL_RESULT' && msg.type !== 'AI_MODAL_SAVE_OUTPUT') || !okId) {
          return;
        }
        // 若父页随后广播 cancel，但本请求已处理过，则忽略
        if (msg.type === 'AI_MODAL_RESULT' && msg.status === 'cancel') {
          try { if (window.__mw_handled_requests && window.__mw_handled_requests[requestId]) return; } catch (_) { }
        }
        // 清理
        window.removeEventListener('message', onMessage);
        clearTimeout(timeoutT);
        try { delete window.__mw_ai_active_requestId; } catch (_) { }

        if (msg.type === 'AI_MODAL_SAVE_OUTPUT' || msg.status === 'ok') {
          try {
            const detail = msg.detail || {};
            // 期望 detail 中包含生成的内容（例如 detail.output 或 detail.text）
            // 支持两种常见格式：detail.output（带 [OUTPUT] 包裹）或 detail.text
            const outText = detail.output || detail.text || (detail.result && detail.result.text) || msg.output || '';
            if (!outText) {
              showWarning('AI 未返回有效内容');
              return;
            }
            // 标记本次请求已获得有效输出，用于忽略后续 cancel
            try { window.__mw_handled_requests[requestId] = true; window.__mw_lastHandledId = requestId; } catch (_) { }

            // 将 AI 返回的文本解析为若干子节点 —— 先尝试使用 converter(md->AST)，若不可用则回退到行解析
            let parsed = outText;
            const m = /\[OUTPUT\]([\s\S]*)\[\/OUTPUT\]/i.exec(outText);
            if (m && m[1]) parsed = m[1].trim();

            // 规范化文本（去除CR）
            var normalized = (parsed || '').replace(/\r/g, '').replace(/\[OUTPUT\]|\[\/OUTPUT\]/gi, '');

            // 简单判定是否为 Markdown（包含标题或列表标记）
            var looksLikeMarkdown = /(^\s*#{1,6}\s+)|(^\s*[-\*\+]\s+)|(^\s*\d+[\.\、]\s+)/m.test(normalized);

            // 标记：如果成功使用转换器插入则设为 true，后续逻辑会直接返回
            var converterInserted = false;

            if (looksLikeMarkdown) {
              try {
                // 动态加载转换器（使用 Promise 链，兼容非-async 环境）
                var tryLoadConverter = function () {
                  return import('../converter/md-to-ast.js').catch(function (e1) {
                    return import('./converter/md-to-ast.js').catch(function (e2) {
                      return null;
                    });
                  });
                };
                var mdmod = null;
                tryLoadConverter().then(function (mod) {
                  mdmod = mod;
                  if (mdmod && mdmod.MdToAstConverter) {
                    try {
                      const conv = new mdmod.MdToAstConverter();
                      const ast = conv.convert(normalized);
                      // 优先使用已有 converter 将 AST 转为 node_tree，然后一次性插入 node_tree 的 children 到所选节点下
                      try {
                        var nodeTree = null;
                        try {
                          // 优先使用全局 window.converter（converter.js 的实例），否则尝试导入本地 converter 模块
                          if (window && window.converter && typeof window.converter.astToNodeTree === 'function') {
                            nodeTree = window.converter.astToNodeTree(ast);
                          } else {
                            // 尝试动态导入 converter.js 并调用 astToNodeTree
                            try {
                              var convModule = null;
                              try { convModule = import('../converter/converter.js'); } catch (_) { try { convModule = import('./converter/converter.js'); } catch (__) { convModule = null; } }
                              if (convModule && convModule.default && typeof convModule.default.astToNodeTree === 'function') {
                                nodeTree = convModule.default.astToNodeTree(ast);
                              } else if (convModule && typeof convModule.astToNodeTree === 'function') {
                                nodeTree = convModule.astToNodeTree(ast);
                              }
                            } catch (eConv) {
                              console.warn('[MW][AI] 动态导入 converter.js 失败', eConv);
                              nodeTree = null;
                            }
                          }
                        } catch (e) {
                          console.warn('[MW][AI] astToNodeTree 调用失败', e);
                          nodeTree = null;
                        }

                        // 将 nodeTree 的 children 递归插入到 selectedNode 下
                        function insertNodeTreeChildren(parentId, ntNode, requestId) {
                          if (!ntNode) return;
                          // 防重复插入锁：使用基于 requestId 的局部锁，避免全局阻塞
                          try {
                            window._mw_ai_inserting_requests = window._mw_ai_inserting_requests || {};
                          } catch (e) {
                            window._mw_ai_inserting_requests = {};
                          }
                          if (requestId && window._mw_ai_inserting_requests[requestId]) {
                            console.debug('[MW][AI] insertNodeTreeChildren skipped: insertion already in progress for', requestId);
                            return;
                          }
                          if (requestId) {
                            try { window._mw_ai_inserting_requests[requestId] = true; } catch (e) { window._mw_ai_inserting_requests[requestId] = true; }
                          } else {
                            // 兜底回退到短期全局标记（向后兼容）
                            try { if (window.__mw_ai_inserting) { console.debug('[MW][AI] insertNodeTreeChildren skipped: global insertion in progress'); return; } } catch (e) { }
                            try { window.__mw_ai_inserting = true; } catch (e) { window.__mw_ai_inserting = true; }
                          }
                          try {
                            var children = ntNode.children || (ntNode.data && ntNode.data.children) || [];
                            if (!Array.isArray(children)) return;

                            // 计算目标 parent 的基准层级（优先使用 core 提供的 getNodeLevel / setNodeLevel）
                            var targetLevel = null;
                            try {
                              var targetNodeObj = (parentId && jm.get_node) ? jm.get_node(parentId) : null;
                              if (targetNodeObj && targetNodeObj.data && (targetNodeObj.data.level !== undefined && targetNodeObj.data.level !== null)) {
                                targetLevel = parseInt(targetNodeObj.data.level, 10);
                              } else if (typeof window.getNodeLevel === 'function') {
                                targetLevel = window.getNodeLevel(targetNodeObj) || null;
                              }
                            } catch (e) { targetLevel = null; }
                            // 若无法获取，设为 1（根下一级）
                            if (targetLevel === null || isNaN(targetLevel)) targetLevel = 1;

                            // 辅助：检测是否存在相同 topic 的兄弟，避免重复（粗略匹配）
                            function siblingExists(parentId, topic) {
                              try {
                                if (!parentId || !topic) return false;
                                var pObj = jm.get_node ? jm.get_node(parentId) : null;
                                var kids = (pObj && Array.isArray(pObj.children)) ? pObj.children : [];
                                for (var i = 0; i < kids.length; i++) {
                                  var c = kids[i];
                                  if (!c) continue;
                                  try {
                                    if (String((c.topic || '')).trim() === String(topic).trim()) return true;
                                  } catch (e) { continue; }
                                }
                              } catch (e) { }
                              return false;
                            }

                            // 递归插入，复用 core 的降级/对齐函数（若存在）
                            function _insert(parentId, nodes, depthOffset) {
                              if (!Array.isArray(nodes) || nodes.length === 0) return;
                              nodes.forEach(function (child) {
                                try {
                                  // 计算 topic 优先字段
                                  var topic = child.topic || (child.data && (child.data.topic || child.data.title)) || (child.title || '');
                                  if (!topic && child.data && child.data.raw) {
                                    var fl = String(child.data.raw || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
                                    topic = fl.length > 120 ? fl.slice(0, 120) + '...' : fl;
                                  }

                                  // 如果该 node 本身无可用标题但有 children，则直接提升其 children 到当前层级
                                  var hasChildren = Array.isArray(child.children) && child.children.length > 0;
                                  if (!topic && hasChildren) {
                                    _insert(parentId, child.children, depthOffset);
                                    return;
                                  }
                                  if (!topic && !hasChildren) return;

                                  // 去重：若已存在同名兄弟则跳过
                                  if (siblingExists(parentId, topic)) {
                                    console.debug('[MW][AI] skip duplicate topic under parent', parentId, topic);
                                    // 仍需尝试插入其子节点到已存在节点下以合并内容（可选）
                                    // 找到该兄弟节点 id 并作为新的 parentId
                                    try {
                                      var pObj = jm.get_node ? jm.get_node(parentId) : null;
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
                                    } catch (e) { /* ignore */ }
                                    return;
                                  }

                                  // 生成新节点 id 与 nodeData（保留 child.data 的安全子集）
                                  var nid = 'n_' + Math.random().toString(36).slice(2, 9);
                                  var nodeData = {};
                                  try { if (child.data) nodeData = Object.assign({}, child.data); } catch (_) { nodeData = {}; }
                                  // 移除超长 raw，避免混合节点问题
                                  try { if (nodeData.raw && typeof nodeData.raw === 'string' && nodeData.raw.length > 600) delete nodeData.raw; } catch (_) { }
                                  // 若 nodeData 中包含 level 字段，优先调整为相对于 targetLevel 的降级值
                                  try {
                                    if (nodeData.level !== undefined && nodeData.level !== null) {
                                      var requested = parseInt(nodeData.level, 10) || 0;
                                      // 将 converter 的 level 映射到以 targetLevel 为基准的层级
                                      nodeData.level = Math.max(1, targetLevel + requested);
                                    } else {
                                      // 若没有显式 level，尝试从 child 自身 data/heading 推断（若 core 提供 setNodeLevel，则可在后处理）
                                      // 这里我们不强行设置 level，交由 core 的 setNodeLevel 或 normalize 函数处理
                                    }
                                  } catch (e) { /* ignore */ }

                                  // 执行插入（尝试保留 nodeData）
                                  try {
                                    if (Object.keys(nodeData).length > 0) {
                                      jm.add_node(parentId, nid, topic, nodeData);
                                    } else {
                                      jm.add_node(parentId, nid, topic);
                                    }
                                  } catch (e) {
                                    try { jm.add_node(parentId, nid, topic); } catch (e2) { console.warn('[MW][AI] jm.add_node failed', e2); return; }
                                  }

                                  // 在 core 中尝试调用自动降级/类型修正函数（若存在）
                                  try {
                                    // setNodeLevel(nodeId, level) 或 applySiblingOrParentType(nodeId)
                                    if (typeof window.setNodeLevel === 'function') {
                                      // 若 nodeData.level 存在则 setNodeLevel
                                      if (nodeData && nodeData.level !== undefined && nodeData.level !== null) {
                                        try { window.setNodeLevel(nid, nodeData.level); } catch (_) { }
                                      } else {
                                        // 以 targetLevel + depthOffset + 1 做默认设置
                                        try { window.setNodeLevel(nid, Math.max(1, targetLevel + (depthOffset || 0))); } catch (_) { }
                                      }
                                    }
                                    if (typeof window.applySiblingOrParentType === 'function') {
                                      try { window.applySiblingOrParentType(nid); } catch (_) { }
                                    }
                                  } catch (e) { /* ignore */ }

                                  // 递归插入子节点（深度 +1）
                                  if (hasChildren) {
                                    _insert(nid, child.children, (depthOffset || 0) + 1);
                                  }
                                } catch (e) {
                                  console.warn('[MW][AI] 插入 node_tree 子节点失败', e);
                                }
                              });
                            }

                            // 开始插入：depthOffset 从 1 开始（子节点相对于 parent）
                            _insert(parentId, children, 1);

                            // 完成后尝试调用一些 core 的 normalize 函数对整段子树做一次性调整（若存在）
                            try {
                              if (typeof window.adjustChildrenHeadingLevel === 'function') {
                                try { window.adjustChildrenHeadingLevel(parentId); } catch (e) { }
                              }
                              if (typeof window.normalizeSubtreeUnderList === 'function') {
                                try { window.normalizeSubtreeUnderList(parentId); } catch (e) { }
                              }
                            } catch (e) { /* ignore */ }

                            try { showSuccess && showSuccess('已通过 converter.astToNodeTree 解析并插入子树'); } catch (e) { }
                            try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                          } finally {
                            // 释放锁
                            try { delete window.__mw_ai_inserting; } catch (e) { window.__mw_ai_inserting = false; }
                          }
                        }

                        if (nodeTree) {
                          // nodeTree 可能为 { data: {...}, children: [...] } 或直接为根节点对象
                          // 若请求的 actionType 不是默认的 create_child，则将 nodeTree 转换为 items 并走 applyAIAction 分发
                          try {
                            var requestedAction = (payload && payload.actionType) ? payload.actionType : 'create_child';
                            if (requestedAction && requestedAction !== 'create_child') {
                              try {
                                // 优先处理生成初始树：直接用 nodeTree 构造新的 mindmap 数据并替换当前整棵树
                                if (requestedAction === 'generate_initial_tree') {
                                  try {
                                    // 统一走 applyAIAction 的新实现：把 Markdown 交给编辑器并保存/同步
                                    if (typeof applyAIAction === 'function') {
                                      applyAIAction('generate_initial_tree', {
                                        selectedNode: selectedNode,
                                        itemsToInsert: [],
                                        parsedText: normalized,
                                        placeholders: (payload && payload.templateData && payload.templateData.placeholders) ? payload.templateData.placeholders : {}
                                      });
                                    }
                                  } catch (e) {
                                    console.warn('[MW][AI] forward to applyAIAction(generate_initial_tree) failed', e);
                                  }
                                  return;
                                }

                                // 插入同级：将 nodeTree.children 插入到 selectedNode 的 parent 下（找不到 parent 则降级为插入子节点）
                                if (requestedAction === 'create_sibling') {
                                  try {
                                    var parentId = null;
                                    try {
                                      var selNodeObj = jm.get_node ? jm.get_node(selectedNode.id) : selectedNode;
                                      if (selNodeObj && selNodeObj.parent) {
                                        parentId = selNodeObj.parent;
                                      } else if (jm.get_parent) {
                                        var p = jm.get_parent(selectedNode.id);
                                        if (p && p.id) parentId = p.id;
                                      }
                                    } catch (e) { parentId = null; }
                                    if (!parentId) parentId = selectedNode.id;
                                    var wrapper = { children: (nodeTree && nodeTree.children) ? nodeTree.children : [] };
                                    insertNodeTreeChildren(parentId, wrapper, requestId || null);
                                    try { showSuccess && showSuccess('已插入同级节点'); } catch (e) { }
                                    try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                                    return;
                                  } catch (e) {
                                    console.warn('[MW][AI] create_sibling 处理失败', e);
                                  }
                                }

                                // 其它非 create_child 的情况保持向后兼容，回退到扁平 items 分发
                                if (typeof applyAIAction === 'function') {
                                  var extractItemsFromNodeTree = function (nt) {
                                    var res = [];
                                    if (!nt) return res;
                                    var children = nt.children || (nt.data && nt.data.children) || [];
                                    if (!Array.isArray(children)) return res;
                                    children.forEach(function (c) {
                                      try {
                                        var title = c.topic || (c.data && (c.data.topic || c.data.title)) || c.title || '';
                                        if (!title && c.data && c.data.raw) {
                                          title = String(c.data.raw || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
                                        }
                                        if (title) {
                                          var it = { topic: title };
                                          if (c.data && c.data.raw) it.raw = c.data.raw;
                                          res.push(it);
                                        }
                                      } catch (e) { /* ignore */ }
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
                                  try { showSuccess && showSuccess('已通过 converter.astToNodeTree 解析并分发为 ' + items.length + ' 项'); } catch (e) { }
                                  try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                                  return;
                                }
                              } catch (e) {
                                console.warn('[MW][AI] nodeTree 特殊 action 分发失败，回退到默认插入', e);
                              }
                            }
                          } catch (e) {
                            console.warn('[MW][AI] nodeTree 分发为 actionItems 时出错，回退到插入子树', e);
                          }
                          // 默认行为：插入为子树（传入 requestId 以使用局部锁）
                          insertNodeTreeChildren(selectedNode.id, nodeTree, requestId || null);
                          try { showSuccess && showSuccess('已通过 converter.astToNodeTree 解析并插入子树'); } catch (e) { }
                          try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (_) { }
                          return;
                        }
                      } catch (convErr) {
                        console.warn('[MW][AI] 使用 astToNodeTree 插入失败，回退到原处理', convErr);
                        converterInserted = false;
                      }
                    } catch (convErr) {
                      console.warn('[MW][AI] md->AST 转换失败', convErr);
                      converterInserted = false;
                    }
                  }
                }).catch(function (err) {
                  console.warn('[MW][AI] 动态加载 md->AST 模块失败', err);
                  converterInserted = false;
                });
              } catch (e) {
                console.warn('[MW][AI] 动态加载 md->AST 模块失败', e);
                converterInserted = false;
              }
            }

            // // 若未使用转换器或转换失败，则回退到原有的逐行解析逻辑（保持兼容）
            // var rawLines = normalized.split('\\n');
            // var childNodes = [];
            // var childTitles = [];
            // var lastNode = null;

            // rawLines.forEach(function (raw) {
            //   if (!raw || !raw.trim()) return;
            //   var line = raw.replace(/\\t/g, '  '); // 把 tab 视作两个空格
            //   var trimmed = line.trim();

            //   // 检查 markdown 标题，如: "# Title" 或 "## Title"
            //   var headerMatch = trimmed.match(/^(#{1,6})\\s+(.*)$/);
            //   if (headerMatch) {
            //     var level = headerMatch[1].length;
            //     var topic = headerMatch[2].trim();
            //     if (topic) {
            //       var nodeObj = { topic: topic, level: level, notes: '' };
            //       childNodes.push(nodeObj);
            //       childTitles.push(topic);
            //       lastNode = nodeObj;
            //     }
            //     return;
            //   }

            //   // 检查 markdown 列表项，支持 "-","*","+","1.","1、" 等
            //   var listMatch = line.match(/^(\\s*)(?:[-\\*\\+]|(\\d+)[\\.、])\\s+(.*)$/);
            //   if (listMatch) {
            //     var indent = listMatch[1].length;
            //     var levelFromIndent = Math.floor(indent / 2) + 1;
            //     var topic = (listMatch[3] || '').trim();
            //     if (topic) {
            //       var nodeObj = { topic: topic, level: levelFromIndent, notes: '' };
            //       childNodes.push(nodeObj);
            //       childTitles.push(topic);
            //       lastNode = nodeObj;
            //     }
            //     return;
            //   }

            //   // 其他行：追加到最近解析的节点 notes
            //   var nonTitleText = trimmed;
            //   if (nonTitleText) {
            //     if (lastNode) {
            //       lastNode.notes = lastNode.notes ? (lastNode.notes + '\\n' + nonTitleText) : nonTitleText;
            //     } else if (childNodes.length > 0) {
            //       var prev = childNodes[childNodes.length - 1];
            //       if (prev) {
            //         prev.notes = prev.notes ? (prev.notes + '\\n' + nonTitleText) : nonTitleText;
            //         lastNode = prev;
            //       }
            //     } else {
            //       var nodeObj = { topic: nonTitleText, level: 1, notes: '' };
            //       childNodes.push(nodeObj);
            //       childTitles.push(nonTitleText);
            //       lastNode = nodeObj;
            //     }
            //   }
            //   return;
            // });
            // // end of fallback parsing




            // if (childTitles.length === 0) {
            //   // 退回到按段落分割：按连续空行（'\n\n' 或 更多）分割
            //   var paras = normalized.split(/\n{2,}/).map(function (s) { return (s || '').trim(); }).filter(function (s) { return !!s; });
            //   paras.forEach(function (p) {
            //     var firstLine = (p.split('\n')[0] || '').trim();
            //     if (firstLine) childTitles.push(firstLine);
            //   });
            // }

            // if (childTitles.length === 0) {
            //   showWarning('无法从 AI 输出解析出子节点，请检查输出格式');
            //   return;
            // }

            // // 根据 actionType 分发处理；非 create_child 则提前处理并返回
            // var itemsToInsert = (typeof childNodes !== 'undefined' && Array.isArray(childNodes) && childNodes.length > 0) ? childNodes : childTitles;
            // applyAIAction((payload && payload.actionType) ? payload.actionType : 'create_child', {
            //   selectedNode: selectedNode,
            //   itemsToInsert: itemsToInsert,
            //   childNodes: childNodes,
            //   childTitles: childTitles,
            //   parsedText: normalized,
            //   placeholders: (payload && payload.templateData && payload.templateData.placeholders) ? payload.templateData.placeholders : {}
            // });
            // if (true) {
            //   try { showSuccess && showSuccess('AI处理完成，解析到 ' + childTitles.length + ' 项'); } catch (e) { }
            //   return;
            // }

            // // 插入子节点（使用 jm API，插入到 selectedNode 下）
            // // 兼容 childNodes（[{topic, level}...]）和旧的 childTitles（['t1','t2']）
            // var itemsToInsert = (typeof childNodes !== 'undefined' && Array.isArray(childNodes) && childNodes.length > 0) ? childNodes : childTitles;
            // itemsToInsert.forEach(function (item, idx) {
            //   try {
            //     // 规范化 topicStr 与 nodeData
            //     var topicStr = '';
            //     var nodeData = {};
            //     if (typeof item === 'string') {
            //       topicStr = item;
            //     } else if (item && typeof item === 'object') {
            //       topicStr = (item.topic !== undefined) ? String(item.topic) : '';
            //       if (item.level !== undefined && item.level !== null) {
            //         nodeData.level = item.level;
            //       }
            //       // 保留原始 raw 文本以便调试/回写（如果需要）
            //       if (item.raw) nodeData.raw = item.raw;
            //       // 如果解析到了 notes，则传入以便新节点带上备注
            //       if (item.notes) nodeData.notes = item.notes;
            //     } else {
            //       topicStr = String(item);
            //     }

            //     if (!topicStr) return; // 跳过空项

            //     // 使用 jm.add_node(parentid, nodeid, topic, data)
            //     const nid = 'n_' + Math.random().toString(36).slice(2, 9);
            //     // 如果 jm.add_node 接受第四个参数 data，则传入 nodeData；若不接受也不会报错（安全尝试）
            //     try {
            //       if (Object.keys(nodeData).length > 0) {
            //         jm.add_node(selectedNode.id, nid, topicStr, nodeData);
            //       } else {
            //         jm.add_node(selectedNode.id, nid, topicStr);
            //       }
            //     } catch (innerErr) {
            //       // 兼容性回退：仅传 topic
            //       jm.add_node(selectedNode.id, nid, topicStr);
            //     }
            //   } catch (e) {
            //     console.warn('插入子节点失败', e);
            //   }
            // });

            // 保存 / 提示
            try { if (typeof debouncedSave === 'function') debouncedSave(); } catch (e) { }
            try { showSuccess && showSuccess('已为该节点生成 ' + childTitles.length + ' 个子节点'); } catch (e) { }
          } catch (err) {
            console.error('处理 AI 结果失败', err);
            showError('处理 AI 结果失败: ' + (err && err.message ? err.message : String(err)));
          }
        } else {
          // error
          const detailMsg = (msg.detail && msg.detail.message) ? msg.detail.message : 'AI 返回错误';
          showError('AI 生成失败: ' + detailMsg);
        }
      } catch (e) {
        console.warn('expandWithAI onMessage error', e);
      }
    };

    window.addEventListener('message', onMessage);

    // 超时保护（30s）：仅在非嵌入（非 modal）场景显示全局错误；嵌入场景由父页面/modal 处理超时
    const timeoutT = setTimeout(function () {
      try {
        // 先移除监听，避免后续重复触发
        window.removeEventListener('message', onMessage);
        // 若当前页面被嵌入到父页面（通常表示会由父页面显示 modal），则跳过本地的错误提示
        const isEmbedded = (window.parent && window.parent !== window);
        if (isEmbedded) {
          console.debug('[MW][AI] timeout skipped: parent/modal should handle it', requestId);
          // 可选：通知父窗口超时（注释掉以避免多余消息）
          // try { window.parent.postMessage({ type: 'AI_MODAL_TIMEOUT', requestId: requestId }, '*'); } catch (_) {}
          return;
        }
        // 非嵌入（headless）场景显示本地错误
        showError('AI 响应超时（30s）');
      } catch (e) { }
    }, 30000);

    // 发送请求给父页面
    try {
      console.log('[MW][AI] send AI_MODAL_OPEN_REQUEST', requestId, payload);
      window.parent.postMessage({ type: 'AI_MODAL_OPEN_REQUEST', requestId: requestId, payload: payload }, '*');
      // 清理一次性预设
      try {
        delete window.__mw_next_actionType;
        delete window.__mw_next_templateKey;
        delete window.__mw_next_placeholders;
      } catch (_) { }
    } catch (e) {
      clearTimeout(timeoutT);
      window.removeEventListener('message', onMessage);
      console.error('发送 AI 请求失败', e);
      showError('发送 AI 请求失败: ' + e.message);
    }

  } catch (e) {
    console.error('AI扩写出错:', e);
    showError('AI扩写出错: ' + e.message);
  }
}
