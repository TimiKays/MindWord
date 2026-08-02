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
  var SOURCE_MARKER = /^\s*\[MW:([^\]]+)\]\s*/i;

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

  function assignSourceTokens(scope) {
    var tokenToSource = new Map();
    var idToToken = new Map();
    var counter = 0;

    (scope.sourceRoots || []).forEach(function visit(node) {
      counter += 1;
      var token = 'S' + counter;
      tokenToSource.set(token, node);
      idToToken.set(String(node.id), token);
      (Array.isArray(node.children) ? node.children : []).forEach(visit);
    });

    return { tokenToSource: tokenToSource, idToToken: idToToken };
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

  function sourceTreeForPrompt(nodes, idToToken, includeNotes) {
    return (nodes || []).map(function serialize(node) {
      var output = {
        ref: idToToken.get(String(node.id)),
        title: String(node.topic || ''),
        children: sourceTreeForPrompt(node.children || [], idToToken, includeNotes)
      };
      if (includeNotes) output.notes = getNotes(node);
      return output;
    });
  }

  function parseSourceMarker(topic) {
    var raw = String(topic || '');
    var match = SOURCE_MARKER.exec(raw);
    if (!match) return { hadMarker: false, refs: [], topic: raw.trim() };
    var refs = String(match[1] || '').split(',').map(function (value) {
      return value.trim().toUpperCase();
    }).filter(Boolean);
    return {
      hadMarker: true,
      refs: refs,
      topic: raw.replace(SOURCE_MARKER, '').trim()
    };
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
    var tokenToSource = options.tokenToSource || new Map();
    var includeNotes = !!options.includeNotes;
    var usedIds = new Set(options.allExistingIds || []);
    var consumedTokens = new Set();
    var usedSourceIds = new Set();
    var sourceIdsByProposal = new Map();

    function materialize(parsedNode, parentId) {
      if (!parsedNode) return null;
      var marker = parseSourceMarker(parsedNode.topic);
      if (!marker.hadMarker) {
        throw fail('MISSING_SOURCE_MARKER', 'AI返回的节点缺少来源标识，请重新生成');
      }
      if (!marker.topic) throw fail('EMPTY_TOPIC', 'AI返回了空标题节点');

      var requestedTokens = marker.refs.filter(function (ref) { return ref !== 'NEW'; });
      requestedTokens.forEach(function (token) {
        if (!tokenToSource.has(token)) {
          throw fail('UNKNOWN_SOURCE_MARKER', 'AI返回了无法识别的节点来源：' + token);
        }
      });

      var reusableTokens = requestedTokens.filter(function (token) { return !consumedTokens.has(token); });
      var sources = reusableTokens.map(function (token) { return tokenToSource.get(token); });
      reusableTokens.forEach(function (token) { consumedTokens.add(token); });
      sources.forEach(function (node) { usedSourceIds.add(String(node.id)); });

      var primary = sources.length ? sources[0] : null;
      var node = primary ? clone(primary) : clone(parsedNode);
      node.id = primary ? String(primary.id) : nextNodeId(usedIds);
      node.topic = marker.topic;
      node.parentid = parentId || null;
      node.data = node.data && typeof node.data === 'object' ? node.data : {};
      delete node.data.raw;
      delete node.data.fullPath;
      delete node.data.siblingNodes;

      if (includeNotes) {
        setNotes(node, getNotes(parsedNode));
      } else if (sources.length) {
        var noteParts = [];
        sources.forEach(function (source) {
          var note = getNotes(source).trim();
          if (note && noteParts.indexOf(note) === -1) noteParts.push(note);
        });
        setNotes(node, noteParts.join('\n\n'));
      } else {
        setNotes(node, '');
      }

      sourceIdsByProposal.set(node.id, sources.map(function (source) { return String(source.id); }));
      node.children = (Array.isArray(parsedNode.children) ? parsedNode.children : []).map(function (child) {
        return materialize(child, node.id);
      }).filter(Boolean);
      return node;
    }

    var roots = (parsedRoots || []).map(function (node) {
      return materialize(node, options.parentId || null);
    }).filter(Boolean);
    if (!roots.length) throw fail('EMPTY_PROPOSAL', 'AI没有返回可应用的节点');

    return {
      roots: roots,
      usedSourceIds: usedSourceIds,
      sourceIdsByProposal: sourceIdsByProposal
    };
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

  function comparableTopic(value) {
    return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function treePositions(roots, parentId) {
    var positions = new Map();
    (function walk(nodes, currentParentId) {
      (nodes || []).forEach(function (node, index) {
        if (!node) return;
        positions.set(String(node.id), {
          node: node,
          parentId: String(currentParentId || ''),
          position: index
        });
        walk(node.children || [], String(node.id));
      });
    })(roots || [], parentId);
    return positions;
  }

  function hasProtectedContent(node) {
    if (getNotes(node).trim()) return true;
    var data = node && node.data && typeof node.data === 'object' ? node.data : {};
    return Object.keys(data).some(function (key) {
      return /image|attachment|file|link|url|icon/i.test(key) && data[key];
    });
  }

  function summarizeChanges(scope, proposalRoots, sourceIdsByProposal) {
    var before = treePositions(scope.sourceRoots || [], scope.parentId);
    var after = treePositions(proposalRoots || [], scope.parentId);
    var beforeStatus = new Map();
    var afterStatus = new Map();
    var counts = { added: 0, changed: 0, moved: 0, removed: 0 };
    var removedWithContent = 0;
    var merged = 0;

    before.forEach(function (oldEntry, id) {
      var newEntry = after.get(id);
      if (!newEntry) {
        counts.removed += 1;
        beforeStatus.set(id, 'removed');
        if (hasProtectedContent(oldEntry.node)) removedWithContent += 1;
        return;
      }
      var changed = comparableTopic(oldEntry.node.topic) !== comparableTopic(newEntry.node.topic)
        || getNotes(oldEntry.node).trim() !== getNotes(newEntry.node).trim();
      var moved = oldEntry.parentId !== newEntry.parentId || oldEntry.position !== newEntry.position;
      if (changed) counts.changed += 1;
      if (moved) counts.moved += 1;
      var status = changed ? 'changed' : (moved ? 'moved' : 'unchanged');
      beforeStatus.set(id, status);
      afterStatus.set(id, status);
    });

    after.forEach(function (_entry, id) {
      if (!before.has(id)) {
        counts.added += 1;
        afterStatus.set(id, 'added');
      }
      var sourceIds = sourceIdsByProposal && sourceIdsByProposal.get(id);
      if (sourceIds && sourceIds.length > 1) merged += 1;
    });

    return {
      counts: counts,
      beforeStatus: beforeStatus,
      afterStatus: afterStatus,
      removedWithContent: removedWithContent,
      merged: merged
    };
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
    assignSourceTokens: assignSourceTokens,
    sourceTreeForPrompt: sourceTreeForPrompt,
    parseSourceMarker: parseSourceMarker,
    materializeProposal: materializeProposal,
    buildAppliedTree: buildAppliedTree,
    summarizeChanges: summarizeChanges,
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

  function byId(id) {
    return root.document.getElementById(id);
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
      MISSING_SOURCE_MARKER: tr('invalidResult', 'AI返回的结构不完整，请重新生成'),
      UNKNOWN_SOURCE_MARKER: tr('invalidResult', 'AI返回的结构不完整，请重新生成'),
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

  function buildPrompt(state, includeNotes, requirement) {
    var sourceTree = core.sourceTreeForPrompt(state.scope.sourceRoots, state.tokens.idToToken, includeNotes);
    var fullIndex = core.buildIndex(state.fullData);
    var parentEntry = fullIndex.get(String(state.scope.parentId));
    var protectedSiblings = [];

    if (state.scope.type === 'siblings' && parentEntry) {
      var selectedRoots = new Set(state.scope.selectedRootIds.map(String));
      protectedSiblings = (parentEntry.node.children || []).filter(function (node) {
        return node && !selectedRoots.has(String(node.id));
      }).map(function (node) { return cleanTitle(node.topic); });
    }

    var modeRule = includeNotes
      ? '允许改写节点备注。每个节点的备注直接写在对应标题下一行，不要添加“备注”标签。'
      : '只调整标题、顺序和层级，不要输出任何备注正文。应用时会自动保留已有备注。';

    return [
      '这是一次思维导图局部重构任务。',
      '目标父节点：' + cleanTitle(state.scope.parentTopic),
      '修改范围：' + (state.scope.type === 'subtree' ? '父节点下的全部后代节点' : '用户选中的同级节点及其后代'),
      '处理模式：' + modeRule,
      protectedSiblings.length ? '范围外同级节点（只作参考，禁止输出或修改）：' + protectedSiblings.join('、') : '',
      '',
      '必须遵守以下结构协议：',
      '1. 第一行使用一级标题输出目标父节点，标题必须等于“' + cleanTitle(state.scope.parentTopic) + '”，父节点本身不会被修改。',
      '2. 需要保留或改写的旧节点，标题必须以来源标识开头，例如“## [MW:S1] 新标题”。',
      '3. 合并多个旧节点时使用“[MW:S1,S2]”；新增节点使用“[MW:NEW]”；删除旧节点时直接不输出该节点。',
      '4. 拆分节点时，第一个节点保留原来源标识，其余拆分出的节点使用“[MW:NEW]”。',
      '5. 只能改动给出的范围，禁止输出范围外节点，禁止解释方案，禁止使用表格或代码块。',
      '',
      '当前结构（JSON，ref 是必须原样使用的来源标识）：',
      JSON.stringify(sourceTree, null, 2),
      '',
      '用户要求：',
      requirement
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
    var marker = core.parseSourceMarker(parsedRoot.topic);
    var parsedTitle = cleanTitle(marker.topic);
    var parentTitle = cleanTitle(scope.parentTopic);
    var children = Array.isArray(parsedRoot.children) ? parsedRoot.children : [];

    var shouldReturnChildren = (!marker.hadMarker && parsedTitle === parentTitle)
      || (!marker.hadMarker && /^(Document|重构结果|Restructure Result)$/i.test(parsedTitle));

    if (shouldReturnChildren) {
      // AI 偶尔不按协议用一级标题输出父节点，而是把父节点也当作普通子节点输出
      // （无来源标识且标题等于父节点）。父节点本身不在重构范围内，需要过滤掉，
      // 否则后续 materialize 会因缺少来源标识而报“结构不完整”。
      var filtered = children.filter(function (child) {
        if (!child) return false;
        var childMarker = core.parseSourceMarker(child.topic);
        if (childMarker.hadMarker) return true;
        return cleanTitle(childMarker.topic) !== parentTitle;
      });
      if (filtered.length !== children.length) {
        console.warn('[AIRestructure] AI 错误地把目标父节点也作为子节点输出，已自动过滤');
      }
      return filtered;
    }

    if (marker.hadMarker) return [parsedRoot];
    throw fail('PARSE_FAILED', 'AI没有按要求返回目标父节点和重构结构');
  }

  function statusLabel(status) {
    var fallbacks = {
      added: '新增', changed: '改写', moved: '移动', removed: '删除', unchanged: '保留'
    };
    return tr(status, fallbacks[status] || status);
  }

  function appendTree(container, roots, statusMap) {
    if (!container) return;
    container.textContent = '';
    var fragment = root.document.createDocumentFragment();

    (function walk(nodes, depth) {
      (nodes || []).forEach(function (node) {
        var id = String(node.id);
        var status = statusMap.get(id) || 'unchanged';
        var row = root.document.createElement('div');
        row.className = 'mw-ai-restructure-tree-row mw-ai-status-' + status;
        row.style.setProperty('--mw-depth', String(depth));

        var topic = root.document.createElement('span');
        topic.className = 'mw-ai-restructure-tree-topic';
        topic.textContent = cleanTitle(node.topic) || tr('untitled', '未命名节点');
        row.appendChild(topic);

        if (status !== 'unchanged') {
          var badge = root.document.createElement('span');
          badge.className = 'mw-ai-restructure-status mw-ai-status-' + status;
          badge.textContent = statusLabel(status);
          row.appendChild(badge);
        }
        fragment.appendChild(row);
        walk(node.children || [], depth + 1);
      });
    })(roots || [], 0);

    container.appendChild(fragment);
  }

  function createManager() {
    var state = null;
    var initialized = false;
    var requestTimer = null;
    var toastTimer = null;

    function initialize() {
      if (initialized) return;
      var modal = byId('aiRestructureModal');
      if (!modal) return;
      initialized = true;

      if (root.i18nManager && root.i18nManager.isInitialized
        && typeof root.i18nManager.updatePageTranslations === 'function') {
        root.i18nManager.updatePageTranslations();
      }

      root.document.querySelectorAll('[data-ai-restructure-close]').forEach(function (element) {
        element.addEventListener('click', close);
      });
      byId('aiRestructureGenerateBtn').addEventListener('click', sendRequest);
      byId('aiRestructureRegenerateBtn').addEventListener('click', sendRequest);
      byId('aiRestructureApplyBtn').addEventListener('click', applyProposal);
      byId('aiRestructureConfigBtn').addEventListener('click', function () {
        try {
          if (typeof root.openConfigModal === 'function') root.openConfigModal();
        } catch (_) { }
      });
      byId('aiRestructureUndoBtn').addEventListener('click', undoAppliedChange);
      root.document.querySelectorAll('input[name="aiRestructureMode"]').forEach(function (input) {
        input.addEventListener('change', updateDataNotice);
      });
      root.document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !modal.hidden) close();
      });
    }

    function setPhase(phase) {
      if (!state) return;
      state.phase = phase;
      ['Setup', 'Loading', 'Preview', 'Error'].forEach(function (name) {
        var element = byId('aiRestructure' + name);
        if (element) element.hidden = name.toLowerCase() !== phase;
      });

      var generate = byId('aiRestructureGenerateBtn');
      var regenerate = byId('aiRestructureRegenerateBtn');
      var apply = byId('aiRestructureApplyBtn');
      var config = byId('aiRestructureConfigBtn');
      if (generate) generate.hidden = phase !== 'setup';
      if (regenerate) regenerate.hidden = phase !== 'preview' && phase !== 'error';
      if (apply) apply.hidden = phase !== 'preview';
      if (config) config.hidden = phase === 'loading' || phase === 'preview';
    }

    function updateDataNotice() {
      if (!state) return;
      var selectedMode = root.document.querySelector('input[name="aiRestructureMode"]:checked');
      var includeNotes = selectedMode && selectedMode.value === 'notes';
      var notice = includeNotes
        ? tr('notesNotice', '将向已配置的AI发送所选范围内 {count} 个节点的标题、层级和备注。', { count: state.scope.sourceNodeCount })
        : tr('structureNotice', '将向已配置的AI发送所选范围内 {count} 个节点的标题和层级，不发送备注。', { count: state.scope.sourceNodeCount });
      byId('aiRestructureDataNotice').textContent = notice;
    }

    function open() {
      initialize();
      if (!initialized) {
        notify('error', tr('notReady', 'AI重构界面尚未准备好，请稍后重试'));
        return false;
      }
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
          phase: 'setup',
          fullData: fullData,
          sourceSignature: core.signature(fullData),
          scope: scope,
          tokens: core.assignSourceTokens(scope),
          requestId: null,
          proposal: null,
          proposalMeta: null,
          summary: null
        };

        var modal = byId('aiRestructureModal');
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        root.document.body.classList.add('mw-ai-restructure-open');
        byId('aiRestructureTitle').textContent = scope.type === 'subtree'
          ? tr('subtreeTitle', 'AI重构子树')
          : tr('selectionTitle', 'AI重构所选节点');
        byId('aiRestructureScope').textContent = scope.type === 'subtree'
          ? tr('subtreeScope', '保留“{parent}”，重构其下 {count} 个节点', { parent: cleanTitle(scope.parentTopic), count: scope.sourceNodeCount })
          : tr('selectionScope', '重构“{parent}”下选中的 {roots} 个同级节点，共 {count} 个节点', {
            parent: cleanTitle(scope.parentTopic), roots: scope.selectedRootIds.length, count: scope.sourceNodeCount
          });

        var requirement = byId('aiRestructureRequirement');
        requirement.value = '';
        var structureMode = root.document.querySelector('input[name="aiRestructureMode"][value="structure"]');
        if (structureMode) structureMode.checked = true;
        updateDataNotice();
        setPhase('setup');
        setTimeout(function () { requirement.focus(); }, 0);
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
      var modal = byId('aiRestructureModal');
      if (modal) {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
      }
      root.document.body.classList.remove('mw-ai-restructure-open');
      state = null;
    }

    function showErrorState(error) {
      if (!state) return;
      byId('aiRestructureErrorText').textContent = errorText(error);
      setPhase('error');
    }

    function isCurrentDocumentUnchanged() {
      var current = currentFullData();
      return current && state && core.signature(current) === state.sourceSignature;
    }

    function sendRequest() {
      if (!state) return;
      var requirement = byId('aiRestructureRequirement').value.trim();
      if (!requirement) {
        byId('aiRestructureRequirement').focus();
        notify('warning', tr('requirementMissing', '请先写下希望AI怎样重构'));
        return;
      }
      if (!isCurrentDocumentUnchanged()) {
        showErrorState(fail('STALE_DOCUMENT'));
        return;
      }

      var mode = root.document.querySelector('input[name="aiRestructureMode"]:checked');
      var includeNotes = !!(mode && mode.value === 'notes');
      var prompt = buildPrompt(state, includeNotes, requirement);
      if (prompt.length > MAX_PROMPT_CHARS) {
        showErrorState(fail('PROMPT_TOO_LARGE', tr('contentTooLong', '所选备注内容较多，请缩小重构范围后再试')));
        return;
      }

      var requestId = 'restructure_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      state.requestId = requestId;
      state.includeNotes = includeNotes;
      state.requirement = requirement;
      state.proposal = null;
      state.proposalMeta = null;
      try {
        root.__tmp_rid = requestId;
        root.__mw_ai_active_requestId = requestId;
        root.__mw_handled_requests = root.__mw_handled_requests || {};
      } catch (_) { }

      byId('aiRestructureLoadingText').textContent = tr('loadingScope', '正在分析 {count} 个节点，原文档暂不修改。', {
        count: state.scope.sourceNodeCount
      });
      setPhase('loading');

      if (requestTimer) clearTimeout(requestTimer);
      requestTimer = setTimeout(function () {
        if (!state || state.requestId !== requestId) return;
        state.requestId = null;
        try {
          delete root.__tmp_rid;
          delete root.__mw_ai_active_requestId;
        } catch (_) { }
        showErrorState(fail('AI_TIMEOUT', tr('timeout', 'AI响应超时，请检查网络或稍后重试')));
      }, 70000);

      try {
        root.parent.postMessage({
          type: 'AI_MODAL_OPEN',
          actionType: ACTION_TYPE,
          requestId: requestId,
          payload: {
            actionType: ACTION_TYPE,
            title: tr('windowTitle', 'AI重构：{parent}', { parent: cleanTitle(state.scope.parentTopic) }),
            initialView: 'mini',
            mode: 'silent',
            presetPrompt: prompt,
            templateData: {
              templateKey: 'AI重构',
              templateText: prompt,
              placeholders: {}
            },
            params: {},
            options: {}
          }
        }, root.location.origin);
      } catch (error) {
        if (requestTimer) clearTimeout(requestTimer);
        requestTimer = null;
        state.requestId = null;
        showErrorState(fail('SEND_FAILED', tr('sendFailed', '发送AI请求失败，请重试')));
      }
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
          setPhase('setup');
        } else {
          var friendly = /timeout/i.test(String(detailMessage || ''))
            ? tr('timeout', 'AI响应超时，请检查网络或稍后重试')
            : (/平台|platform|api.?key|配置/i.test(String(detailMessage || ''))
              ? tr('configRequired', 'AI服务尚未配置好，请先打开AI配置')
              : (detailMessage || tr('generationFailed', 'AI生成失败，请重试')));
          showErrorState(fail('AI_FAILED', friendly));
        }
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
          tokenToSource: state.tokens.tokenToSource,
          includeNotes: state.includeNotes,
          allExistingIds: allExistingIds,
          parentId: state.scope.parentId
        });
        var summary = core.summarizeChanges(state.scope, materialized.roots, materialized.sourceIdsByProposal);
        state.proposal = materialized.roots;
        state.proposalMeta = materialized;
        state.summary = summary;
        renderPreview();
        setPhase('preview');
      } catch (error) {
        console.warn('[AIRestructure] 解析重构方案失败:', error);
        showErrorState(error.code ? error : fail('PARSE_FAILED', error.message));
      }
      return true;
    }

    function renderPreview() {
      if (!state || !state.summary) return;
      var summary = byId('aiRestructureSummary');
      summary.textContent = '';
      ['added', 'changed', 'moved', 'removed'].forEach(function (status) {
        var item = root.document.createElement('span');
        item.className = 'mw-ai-restructure-summary-item mw-ai-status-' + status;
        item.textContent = statusLabel(status) + ' ' + state.summary.counts[status];
        summary.appendChild(item);
      });

      var warning = byId('aiRestructureWarning');
      if (state.summary.removedWithContent > 0) {
        warning.hidden = false;
        warning.textContent = tr('contentRemovalWarning', '方案将删除 {count} 个含备注、图片或链接的节点，请重点检查红色项目。', {
          count: state.summary.removedWithContent
        });
      } else if (state.summary.merged > 0) {
        warning.hidden = false;
        warning.textContent = tr('mergeWarning', '方案包含 {count} 处节点合并，原备注会保留到合并后的节点中。', {
          count: state.summary.merged
        });
      } else {
        warning.hidden = true;
        warning.textContent = '';
      }

      appendTree(byId('aiRestructureBeforeTree'), state.scope.sourceRoots, state.summary.beforeStatus);
      appendTree(byId('aiRestructureAfterTree'), state.proposal, state.summary.afterStatus);
    }

    function applyProposal() {
      if (!state || !state.proposal) return;
      var undoManager = root.undoManager;
      if (!undoManager || typeof undoManager.undo !== 'function'
        || (typeof undoManager._recordNow !== 'function' && typeof undoManager.recordIfChanged !== 'function')) {
        showErrorState(fail('UNDO_UNAVAILABLE'));
        return;
      }
      if (!isCurrentDocumentUnchanged()) {
        showErrorState(fail('STALE_DOCUMENT'));
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
        close();
        showUndoToast(tr('applied', '已重构 {count} 个节点', { count: appliedCount }));
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
        showErrorState(error.code ? error : fail('APPLY_FAILED', tr('applyFailed', '应用失败，原文档已恢复')));
      }
    }

    function showUndoToast(message) {
      var toast = byId('aiRestructureUndoToast');
      byId('aiRestructureUndoText').textContent = message;
      toast.hidden = false;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.hidden = true; }, 10000);
    }

    function undoAppliedChange() {
      var toast = byId('aiRestructureUndoToast');
      try {
        if (typeof root.undoMindmap === 'function') root.undoMindmap();
        else if (root.undoManager) root.undoManager.undo();
        byId('aiRestructureUndoText').textContent = tr('undone', '已撤销AI重构');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.hidden = true; }, 1800);
      } catch (error) {
        notify('error', tr('undoFailed', '撤销失败，请使用工具栏撤销按钮'));
      }
    }

    return {
      open: open,
      close: close,
      sendRequest: sendRequest,
      applyProposal: applyProposal,
      handleAIMessage: handleAIMessage,
      isActiveRequest: isActiveRequest,
      getState: function () {
        return state ? {
          phase: state.phase,
          requestId: state.requestId,
          scopeType: state.scope && state.scope.type,
          sourceNodeCount: state.scope && state.scope.sourceNodeCount
        } : null;
      }
    };
  }

  return { core: core, manager: createManager() };
});
