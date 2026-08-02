/**
 * MindWord AI restructure
 * Builds a preview from a cloned tree, then applies the accepted change as one undo step.
 */
(function (root, factory) {
  'use strict';

  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api.core;

  if (root && root.document) {
    root.MWAIRestructureCore = api.core;
    root.aiRestructureManager = api.manager;
    root.openAIRestructure = function () {
      return api.manager.open();
    };
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var ACTION_TYPE = 'restructure_tree';
  var MAX_SCOPE_NODES = 120;
  var MAX_PROMPT_CHARS = 50000;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function fail(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }

  function rootNode(fullData) {
    return fullData && fullData.data ? fullData.data : fullData;
  }

  function buildIndex(fullData) {
    var index = new Map();
    var root = rootNode(fullData);

    (function walk(node, parent, position) {
      if (!node || node.id == null) return;
      var id = String(node.id);
      if (index.has(id)) throw fail('DUPLICATE_NODE_ID', '思维导图中存在重复节点标识');
      index.set(id, { node: node, parent: parent || null, position: position || 0 });
      var children = Array.isArray(node.children) ? node.children : [];
      children.forEach(function (child, childIndex) {
        walk(child, node, childIndex);
      });
    })(root, null, 0);

    return index;
  }

  function countNodes(nodes) {
    var count = 0;
    (Array.isArray(nodes) ? nodes : []).forEach(function visit(node) {
      if (!node) return;
      count += 1;
      (Array.isArray(node.children) ? node.children : []).forEach(visit);
    });
    return count;
  }

  function collectIds(nodes) {
    var ids = new Set();
    (Array.isArray(nodes) ? nodes : []).forEach(function visit(node) {
      if (!node) return;
      if (node.id != null) ids.add(String(node.id));
      (Array.isArray(node.children) ? node.children : []).forEach(visit);
    });
    return ids;
  }

  function resolveScope(fullData, selectedIds) {
    var index = buildIndex(fullData);
    var ids = Array.from(new Set((selectedIds || []).map(String).filter(Boolean)));
    if (!ids.length) throw fail('NO_SELECTION', '请先选择需要重构的节点');

    var entries = ids.map(function (id) {
      var entry = index.get(id);
      if (!entry) throw fail('NODE_NOT_FOUND', '选中的节点已发生变化，请重新选择');
      return entry;
    });

    var scope;
    if (entries.length === 1) {
      var selected = entries[0].node;
      var children = Array.isArray(selected.children) ? selected.children : [];
      if (!children.length) throw fail('LEAF_NODE', '当前节点还没有子节点');
      scope = {
        type: 'subtree',
        parentId: String(selected.id),
        parentTopic: String(selected.topic || ''),
        selectedRootIds: children.map(function (node) { return String(node.id); }),
        sourceRoots: children,
        insertIndex: 0
      };
    } else {
      if (entries.some(function (entry) { return !entry.parent; })) {
        throw fail('ROOT_IN_MULTI_SELECTION', '根节点不能参与同级重构');
      }
      var parentId = String(entries[0].parent.id);
      if (entries.some(function (entry) { return String(entry.parent.id) !== parentId; })) {
        throw fail('NOT_SIBLINGS', '多选重构只支持同一父节点下的同级节点');
      }

      var selectedSet = new Set(ids);
      var parent = entries[0].parent;
      var orderedRoots = (Array.isArray(parent.children) ? parent.children : []).filter(function (node) {
        return node && selectedSet.has(String(node.id));
      });
      var positions = orderedRoots.map(function (node) {
        return (parent.children || []).findIndex(function (child) { return child && String(child.id) === String(node.id); });
      });

      scope = {
        type: 'siblings',
        parentId: parentId,
        parentTopic: String(parent.topic || ''),
        selectedRootIds: orderedRoots.map(function (node) { return String(node.id); }),
        sourceRoots: orderedRoots,
        insertIndex: Math.min.apply(Math, positions)
      };
    }

    scope.sourceNodeCount = countNodes(scope.sourceRoots);
    scope.sourceIds = collectIds(scope.sourceRoots);
    return scope;
  }

  function getNotes(node) {
    if (!node) return '';
    if (node.notes != null) return String(node.notes);
    if (node.data && node.data.notes != null) return String(node.data.notes);
    return '';
  }

  function setNotes(node, value) {
    var notes = String(value || '').trim();
    node.data = node.data && typeof node.data === 'object' ? node.data : {};
    if (notes) {
      node.notes = notes;
      node.data.notes = notes;
    } else {
      delete node.notes;
      delete node.data.notes;
    }
  }

  // 将节点子树转为 Markdown（标题层级表达父子关系，备注紧跟标题下一行）
  function subtreeToMarkdown(nodes, level) {
    level = Math.min(level || 2, 6);
    var prefix = '#'.repeat(level);
    var lines = [];
    (nodes || []).forEach(function (node) {
      if (!node) return;
      lines.push(prefix + ' ' + String(node.topic || ''));
      var notes = getNotes(node);
      if (notes) lines.push(notes);
      if (node.children && node.children.length) {
        lines.push(subtreeToMarkdown(node.children, level + 1));
      }
    });
    return lines.join('\n');
  }

  function nextNodeId(usedIds) {
    var id;
    do {
      id = 'ai_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }

  function materializeProposal(parsedRoots, options) {
    options = options || {};
    var usedIds = new Set(options.allExistingIds || []);
    var parentTopic = options.parentTopic || '';

    function materialize(parsedNode, parentId) {
      if (!parsedNode) return null;
      var topic = String(parsedNode.topic || '').trim();
      if (!topic) throw fail('EMPTY_TOPIC', 'AI返回了空标题节点');

      // 容错：跳过被误输出的父节点（标题匹配父节点）
      if (parentTopic && titlesMatch(topic, parentTopic)) {
        console.warn('[AIRestructure] 跳过被误输出的父节点:', topic);
        return null;
      }

      var node = clone(parsedNode);
      node.id = nextNodeId(usedIds);
      node.topic = topic;
      node.parentid = parentId || null;
      node.data = node.data && typeof node.data === 'object' ? node.data : {};
      delete node.data.raw;
      delete node.data.fullPath;
      delete node.data.siblingNodes;

      // 保留 AI 返回的备注（如有）
      setNotes(node, getNotes(parsedNode));

      node.children = (Array.isArray(parsedNode.children) ? parsedNode.children : []).map(function (child) {
        return materialize(child, node.id);
      }).filter(Boolean);
      return node;
    }

    var roots = (parsedRoots || []).map(function (node) {
      return materialize(node, options.parentId || null);
    }).filter(Boolean);
    if (!roots.length) throw fail('EMPTY_PROPOSAL', 'AI没有返回可应用的节点');

    return { roots: roots };
  }

  function buildAppliedTree(fullData, scope, proposalRoots) {
    var next = clone(fullData);
    var index = buildIndex(next);
    var parentEntry = index.get(String(scope.parentId));
    if (!parentEntry) throw fail('PARENT_NOT_FOUND', '目标父节点已不存在');
    var parent = parentEntry.node;
    var roots = clone(proposalRoots || []);

    (function repair(nodes, parentId) {
      (nodes || []).forEach(function (node) {
        node.parentid = parentId || null;
        repair(node.children || [], String(node.id));
      });
    })(roots, String(parent.id));

    if (scope.type === 'subtree') {
      parent.children = roots;
    } else {
      var selected = new Set((scope.selectedRootIds || []).map(String));
      var originalChildren = Array.isArray(parent.children) ? parent.children : [];
      var output = [];
      var inserted = false;
      originalChildren.forEach(function (child) {
        if (child && selected.has(String(child.id))) {
          if (!inserted) {
            Array.prototype.push.apply(output, roots);
            inserted = true;
          }
          return;
        }
        output.push(child);
      });
      if (!inserted) {
        Array.prototype.splice.apply(output, [Math.max(0, scope.insertIndex || 0), 0].concat(roots));
      }
      parent.children = output;
    }

    return next;
  }

  function signature(fullData) {
    return JSON.stringify(fullData || null);
  }

  var core = {
    ACTION_TYPE: ACTION_TYPE,
    clone: clone,
    buildIndex: buildIndex,
    countNodes: countNodes,
    collectIds: collectIds,
    resolveScope: resolveScope,
    subtreeToMarkdown: subtreeToMarkdown,
    materializeProposal: materializeProposal,
    buildAppliedTree: buildAppliedTree,
    signature: signature,
    getNotes: getNotes
  };

  if (!root || !root.document) return { core: core, manager: null };

  function tr(key, fallback, values) {
    var text = fallback || key;
    try {
      if (root.i18nManager && typeof root.i18nManager.t === 'function') {
        text = root.i18nManager.t('app.aiRestructure.' + key, fallback || key);
      }
    } catch (_) { }
    Object.keys(values || {}).forEach(function (name) {
      text = String(text).replace(new RegExp('\\{' + name + '\\}', 'g'), String(values[name]));
    });
    return text;
  }

  function currentFullData() {
    if (!root.jm || typeof root.jm.get_data !== 'function') return null;
    try {
      if (root.viewStateManager && root.viewStateManager.isInDrillDownMode()
        && root.viewStateManager.originalData) {
        return clone(root.viewStateManager.originalData);
      }
    } catch (_) { }
    return clone(root.jm.get_data());
  }

  function selectedNodeIds() {
    var multi = [];
    try {
      multi = typeof root.getMultiSelection === 'function' ? root.getMultiSelection() : [];
    } catch (_) { multi = []; }
    if (Array.isArray(multi) && multi.length) return multi.map(String);
    try {
      var selected = root.jm && root.jm.get_selected_node ? root.jm.get_selected_node() : null;
      return selected && selected.id != null ? [String(selected.id)] : [];
    } catch (_) { return []; }
  }

  function notify(kind, message) {
    try {
      if (kind === 'error' && typeof root.showError === 'function') return root.showError(message);
      if (kind === 'warning' && typeof root.showWarning === 'function') return root.showWarning(message);
      if (kind === 'success' && typeof root.showSuccess === 'function') return root.showSuccess(message);
    } catch (_) { }
    if (kind === 'error') console.error(message);
    else console.log(message);
  }

  function errorText(error) {
    var code = error && error.code;
    var messages = {
      NO_SELECTION: tr('noSelection', '请先选择需要重构的节点'),
      LEAF_NODE: tr('leafNode', '当前节点还没有子节点，请使用“AI生成子节点”'),
      NOT_SIBLINGS: tr('notSiblings', '多选重构只支持同一父节点下的同级节点'),
      ROOT_IN_MULTI_SELECTION: tr('rootInSelection', '根节点不能参与同级重构'),
      EMPTY_PROPOSAL: tr('emptyResult', 'AI没有返回可应用的节点'),
      STALE_DOCUMENT: tr('staleDocument', '生成期间文档发生了变化，请重新生成方案'),
      UNDO_UNAVAILABLE: tr('undoUnavailable', '撤销功能暂不可用，为保护文档，本次没有应用'),
      PARSE_FAILED: tr('invalidResult', 'AI返回的结构无法识别，请重新生成')
    };
    return messages[code] || (error && error.message) || tr('unknownError', '处理失败，请重试');
  }

  function cleanTitle(value) {
    return String(value || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 宽松标题匹配：去除标点、空格、大小写差异，用于识别 AI 误输出的父节点
  function normalizeTitle(value) {
    return String(value || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[：:、，,。.！!？?；;""''「」『』（）()\[\]【】<>《》\-_~`'"]+/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
      .trim();
  }

  function titlesMatch(a, b) {
    var na = normalizeTitle(a);
    var nb = normalizeTitle(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // 允许一方包含另一方（容错 AI 给父节点加前缀/后缀或微调标题）
    var shorter = na.length <= nb.length ? na : nb;
    var longer = na.length <= nb.length ? nb : na;
    if (shorter.length < 3) return false;
    return longer.indexOf(shorter) >= 0;
  }

  function buildContext(state) {
    var fullIndex = core.buildIndex(state.fullData);
    var parentEntry = fullIndex.get(String(state.scope.parentId));
    var protectedSiblings = [];

    if (state.scope.type === 'siblings' && parentEntry) {
      var selectedRoots = new Set(state.scope.selectedRootIds.map(String));
      protectedSiblings = (parentEntry.node.children || []).filter(function (node) {
        return node && !selectedRoots.has(String(node.id));
      }).map(function (node) { return cleanTitle(node.topic); });
    }

    var currentMd = subtreeToMarkdown(state.scope.sourceRoots, 2);

    return [
      '这是一次思维导图局部重构任务。',
      '目标父节点：' + cleanTitle(state.scope.parentTopic),
      '修改范围：' + (state.scope.type === 'subtree' ? '父节点下的全部后代节点' : '用户选中的同级节点及其后代'),
      '处理模式：允许改写节点标题和备注。',
      protectedSiblings.length ? '范围外同级节点（只作参考，禁止输出或修改）：' + protectedSiblings.join('、') : '',
      '',
      '当前结构（Markdown 格式，请在此基础上重新组织）：',
      '# ' + cleanTitle(state.scope.parentTopic),
      currentMd
    ].filter(function (line) { return line !== ''; }).join('\n');
  }

  function extractOutput(message) {
    var detail = message && message.detail ? message.detail : {};
    var output = message && (message.output || detail.output || detail.text
      || (detail.result && detail.result.text)) || '';
    var match = /\[OUTPUT\]([\s\S]*?)\[\/OUTPUT\]/i.exec(output);
    return String(match && match[1] ? match[1] : output)
      .replace(/\[OUTPUT\]|\[\/OUTPUT\]/gi, '').replace(/\r/g, '').trim();
  }

  function extractProposalRoots(nodeTree, scope) {
    var parsedRoot = nodeTree && nodeTree.data ? nodeTree.data : nodeTree;
    if (!parsedRoot) throw fail('PARSE_FAILED', 'AI返回内容为空');
    var parsedTitle = cleanTitle(parsedRoot.topic || '');
    var children = Array.isArray(parsedRoot.children) ? parsedRoot.children : [];

    // 过滤掉子节点中被误输出的父节点（标题宽松匹配父节点）
    function filterOutParent(nodes) {
      return (nodes || []).filter(function (child) {
        if (!child) return false;
        var childTitle = cleanTitle(child.topic || '');
        if (titlesMatch(childTitle, scope.parentTopic)) {
          console.warn('[AIRestructure] 过滤被误输出的父节点:', childTitle);
          return false;
        }
        return true;
      });
    }

    // 场景1：根节点标题匹配父节点 → 父节点是根，提取其子节点
    if (titlesMatch(parsedRoot.topic, scope.parentTopic)) {
      var filtered1 = filterOutParent(children);
      if (!filtered1.length) throw fail('EMPTY_PROPOSAL', 'AI没有返回可应用的节点');
      return filtered1;
    }

    // 场景2：根节点是伪标题（如"重构结果""Document"）→ 提取其子节点
    if (/^(Document|重构结果|Restructure Result|重构方案|结果)$/i.test(parsedTitle)) {
      var filtered2 = filterOutParent(children);
      if (!filtered2.length) throw fail('EMPTY_PROPOSAL', 'AI没有返回可应用的节点');
      return filtered2;
    }

    // 场景3：根节点既不是父节点也不是伪标题，但有子节点
    // 可能 AI 直接输出了重构结果（根节点本身就是子节点之一）
    if (children.length) {
      // 如果根节点有自己的内容（不是纯容器），返回根节点 + 子节点
      // 否则提取子节点
      var filtered3 = filterOutParent(children);
      if (filtered3.length) return [parsedRoot];
    }

    // 兜底：直接返回根节点
    return [parsedRoot];
  }

  function createManager() {
    var state = null;
    var requestTimer = null;

    function open() {
      if (root.__mw_filteredViewActive) {
        notify('warning', tr('filteredView', '请先退出节点筛选视图，再使用AI重构'));
        return false;
      }

      try {
        var fullData = currentFullData();
        if (!fullData) throw fail('NOT_READY', '思维导图尚未加载完成');
        var scope = core.resolveScope(fullData, selectedNodeIds());
        if (scope.sourceNodeCount > MAX_SCOPE_NODES) {
          notify('warning', tr('tooManyNodes', '本次选中了 {count} 个节点，请拆分为 {max} 个以内再重构。', {
            count: scope.sourceNodeCount,
            max: MAX_SCOPE_NODES
          }));
          return false;
        }

        state = {
          fullData: fullData,
          sourceSignature: core.signature(fullData),
          scope: scope,
          requestId: null,
          proposal: null,
          proposalMeta: null,
          summary: null
        };

        var contextText = buildContext(state);
        if (contextText.length > MAX_PROMPT_CHARS) {
          state = null;
          notify('warning', tr('contentTooLong', '所选备注内容较多，请缩小重构范围后再试'));
          return false;
        }

        var requestId = 'restructure_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        state.requestId = requestId;
        try {
          root.__tmp_rid = requestId;
          root.__mw_ai_active_requestId = requestId;
          root.__mw_handled_requests = root.__mw_handled_requests || {};
        } catch (_) { }

        if (requestTimer) clearTimeout(requestTimer);
        requestTimer = setTimeout(function () {
          if (!state || state.requestId !== requestId) return;
          state.requestId = null;
          try { delete root.__tmp_rid; delete root.__mw_ai_active_requestId; } catch (_) { }
          notify('error', tr('timeout', 'AI响应超时，请检查网络或稍后重试'));
          close();
        }, 70000);

        try {
          root.parent.postMessage({
            type: 'AI_MODAL_OPEN',
            actionType: ACTION_TYPE,
            requestId: requestId,
            payload: {
              actionType: ACTION_TYPE,
              title: tr('windowTitle', 'AI重构：{parent}', { parent: cleanTitle(scope.parentTopic) }),
              initialView: 'mini',
              presetPrompt: contextText,
              templateData: {
                templateKey: 'AI重构',
                templateText: contextText,
                placeholders: {}
              },
              params: {},
              options: {}
            }
          }, root.location.origin);
        } catch (error) {
          if (requestTimer) clearTimeout(requestTimer);
          requestTimer = null;
          state = null;
          notify('error', tr('sendFailed', '发送AI请求失败，请重试'));
          return false;
        }
        return true;
      } catch (error) {
        notify('warning', errorText(error));
        return false;
      }
    }

    function close() {
      if (requestTimer) clearTimeout(requestTimer);
      requestTimer = null;
      if (state && state.requestId) {
        try { delete root.__tmp_rid; delete root.__mw_ai_active_requestId; } catch (_) { }
      }
      state = null;
    }

    function isCurrentDocumentUnchanged() {
      var current = currentFullData();
      return current && state && core.signature(current) === state.sourceSignature;
    }

    function isActiveRequest(requestId) {
      return !!(state && state.requestId && String(state.requestId) === String(requestId));
    }

    function handleAIMessage(message) {
      if (!message || !isActiveRequest(message.requestId)) return false;
      if (requestTimer) clearTimeout(requestTimer);
      requestTimer = null;
      var requestId = state.requestId;
      state.requestId = null;
      try {
        delete root.__tmp_rid;
        delete root.__mw_ai_active_requestId;
        root.__mw_handled_requests = root.__mw_handled_requests || {};
        root.__mw_handled_requests[requestId] = true;
      } catch (_) { }

      if (message.status !== 'ok' && message.status !== 'success') {
        var detailMessage = message.detail && message.detail.message;
        if (detailMessage === 'user_closed') {
          close();
          return true;
        }
        var friendly = /timeout/i.test(String(detailMessage || ''))
          ? tr('timeout', 'AI响应超时，请检查网络或稍后重试')
          : (/平台|platform|api.?key|配置/i.test(String(detailMessage || ''))
            ? tr('configRequired', 'AI服务尚未配置好，请先打开AI配置')
            : (detailMessage || tr('generationFailed', 'AI生成失败，请重试')));
        notify('error', friendly);
        close();
        return true;
      }

      try {
        var output = extractOutput(message);
        if (!output) throw fail('EMPTY_PROPOSAL', 'AI没有返回内容');
        if (!root.converter || typeof root.converter.mdToNodeTree !== 'function') {
          throw fail('PARSE_FAILED', '结构转换器尚未准备好');
        }
        var nodeTree = root.converter.mdToNodeTree(output);
        var parsedRoots = extractProposalRoots(nodeTree, state.scope);
        var allExistingIds = Array.from(core.buildIndex(state.fullData).keys());
        var materialized = core.materializeProposal(parsedRoots, {
          allExistingIds: allExistingIds,
          parentId: state.scope.parentId,
          parentTopic: state.scope.parentTopic
        });
        state.proposal = materialized.roots;
        state.proposalMeta = materialized;
        applyProposal();
      } catch (error) {
        console.warn('[AIRestructure] 解析或应用重构方案失败:', error);
        notify('error', errorText(error.code ? error : fail('PARSE_FAILED', error.message)));
        close();
      }
      return true;
    }

    function applyProposal() {
      if (!state || !state.proposal) return;
      var undoManager = root.undoManager;
      if (!undoManager || typeof undoManager.undo !== 'function'
        || (typeof undoManager._recordNow !== 'function' && typeof undoManager.recordIfChanged !== 'function')) {
        notify('error', tr('undoUnavailable', '撤销功能暂不可用，为保护文档，本次没有应用'));
        close();
        return;
      }
      if (!isCurrentDocumentUnchanged()) {
        notify('error', tr('staleDocument', '生成期间文档发生了变化，请重新生成方案'));
        close();
        return;
      }

      var beforeFull = currentFullData();
      var viewManager = root.viewStateManager;
      var wasDrillDown = !!(viewManager && viewManager.isInDrillDownMode && viewManager.isInDrillDownMode());
      var drillRootId = wasDrillDown ? viewManager.currentRootId : null;
      var drillHistory = wasDrillDown ? clone(viewManager.drillDownHistoryStack || []) : [];

      try {
        if (typeof undoManager._recordNow === 'function') undoManager._recordNow();
        else undoManager.recordIfChanged();

        var nextFull = core.buildAppliedTree(beforeFull, state.scope, state.proposal);
        root.jm.show(nextFull);
        try {
          if (typeof root.adjustChildrenHeadingLevel === 'function') root.adjustChildrenHeadingLevel(state.scope.parentId);
          if (typeof root.normalizeSubtreeUnderList === 'function') root.normalizeSubtreeUnderList(state.scope.parentId);
        } catch (normalizationError) {
          console.warn('[AIRestructure] 节点格式整理失败:', normalizationError);
        }

        var normalizedFull = clone(root.jm.get_data());
        if (wasDrillDown && viewManager) {
          viewManager.originalData = clone(normalizedFull);
          viewManager.currentViewMode = 'drilldown';
          viewManager.currentRootId = drillRootId;
          viewManager.drillDownHistoryStack = drillHistory;
          viewManager.applyFilteredView();
          try { viewManager.updateBreadcrumb(); viewManager.updateToolbarButtons(); } catch (_) { }
        }

        var recorded = typeof undoManager._recordNow === 'function'
          ? undoManager._recordNow()
          : (undoManager.recordIfChanged(), true);
        if (recorded === false) throw fail('UNDO_UNAVAILABLE', '无法建立撤销记录');

        try {
          if (typeof root.clearMultiSelection === 'function') root.clearMultiSelection();
          var targetId = state.scope.type === 'subtree'
            ? state.scope.parentId
            : (state.proposal[0] && state.proposal[0].id);
          if (targetId && root.jm.get_node(targetId)) root.jm.select_node(targetId);
        } catch (_) { }
        try {
          if (typeof root.debouncedSave === 'function') root.debouncedSave();
          else if (typeof root.saveToLocalStorage === 'function') root.saveToLocalStorage();
        } catch (_) { }

        var appliedCount = core.countNodes(state.proposal);
        notify('success', tr('applied', '已重构 {count} 个节点，可按撤销键回退', { count: appliedCount }));
        close();
      } catch (error) {
        console.error('[AIRestructure] 应用失败，正在恢复:', error);
        try {
          root.jm.show(beforeFull);
          if (wasDrillDown && viewManager) {
            viewManager.originalData = clone(beforeFull);
            viewManager.currentViewMode = 'drilldown';
            viewManager.currentRootId = drillRootId;
            viewManager.drillDownHistoryStack = drillHistory;
            viewManager.applyFilteredView();
          }
        } catch (restoreError) {
          console.error('[AIRestructure] 自动恢复失败:', restoreError);
        }
        notify('error', error.code ? errorText(error) : tr('applyFailed', '应用失败，原文档已恢复'));
        close();
      }
    }

    return {
      open: open,
      close: close,
      handleAIMessage: handleAIMessage,
      isActiveRequest: isActiveRequest,
      getState: function () {
        return state ? {
          requestId: state.requestId,
          scopeType: state.scope && state.scope.type,
          sourceNodeCount: state.scope && state.scope.sourceNodeCount
        } : null;
      }
    };
  }

  return { core: core, manager: createManager() };
});
