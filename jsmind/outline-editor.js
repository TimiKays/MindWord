(function () {
  'use strict';

  var _idCounter = 0;

  function generateId() {
    return 'mw_oe_' + Date.now() + '_' + (++_idCounter);
  }

  function deepClone(obj) {
    if (!obj) return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      console.error('[OutlineEditor] deepClone failed:', e);
      return obj;
    }
  }

  function isCursorAtStart(el) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    var range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    var node = range.startContainer;
    if (node === el) return range.startOffset === 0;
    if (node === el.firstChild || (el.firstChild && node === el.firstChild)) {
      return range.startOffset === 0;
    }
    return false;
  }

  function isCursorAtEnd(el) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    var range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    var textNode = el.firstChild;
    if (!textNode) return true;
    if (range.startContainer === textNode) {
      return range.startOffset >= textNode.length;
    }
    if (range.startContainer === el) {
      return range.startOffset >= el.childNodes.length;
    }
    return false;
  }

  function setCursorToEnd(el) {
    if (!el) return;
    el.focus();
    var range = document.createRange();
    var sel = window.getSelection();
    if (el.firstChild) {
      range.setStartAfter(el.lastChild);
    } else {
      range.setStart(el, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function setCursorToStart(el) {
    if (!el) return;
    el.focus();
    var range = document.createRange();
    var sel = window.getSelection();
    range.setStart(el, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function updateIndentRecursive(node, delta) {
    if (!node) return;
    if (node.data && typeof node.data.indent === 'number') {
      node.data.indent = Math.max(0, node.data.indent + delta);
    }
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        updateIndentRecursive(node.children[i], delta);
      }
    }
  }

  function OutlineEditor() {
    this.container = null;
    this.treeData = null;
    this.focusedId = null;
    this._nodeMap = {};
    this._parentMap = {};
    this._composing = false;
  }

  OutlineEditor.prototype._t = function (key, fallback) {
    try {
      if (window.i18nManager && typeof window.i18nManager.t === 'function') {
        var val = window.i18nManager.t('app.toolbar.' + key);
        if (val && val !== 'app.toolbar.' + key) return val;
      }
    } catch (e) { /* ignore */ }
    return fallback || key;
  };

  OutlineEditor.prototype.init = function (containerEl) {
    this.container = containerEl;
    this._dragState = null;
    var self = this;
    this.container.addEventListener('compositionstart', function () {
      self._composing = true;
    });
    this.container.addEventListener('compositionend', function () {
      self._composing = false;
    });

    this.container.addEventListener('dragstart', function (e) {
      var row = e.target.closest('.outline-row');
      if (!row) return;
      var item = row.closest('.outline-item');
      if (!item) return;
      var nodeId = item.dataset.id;
      if (!nodeId || nodeId === self.treeData.id) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', nodeId);
      row.classList.add('outline-dragging');
      self._dragState = { dragId: nodeId };
    });

    this.container.addEventListener('dragend', function (e) {
      var row = e.target.closest('.outline-row');
      if (row) row.classList.remove('outline-dragging');
      self._clearDropIndicators();
      self._dragState = null;
    });

    this.container.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!self._dragState) return;

      self._clearDropIndicators();

      var row = e.target.closest('.outline-row');
      if (!row) return;
      var item = row.closest('.outline-item');
      if (!item) return;
      var targetId = item.dataset.id;
      if (!targetId || targetId === self._dragState.dragId) return;

      if (self._isDescendant(self._dragState.dragId, targetId)) return;

      var rect = row.getBoundingClientRect();
      var y = e.clientY - rect.top;
      var threshold = rect.height / 3;

      if (y < threshold) {
        row.classList.add('outline-drop-before');
      } else if (y > rect.height - threshold) {
        row.classList.add('outline-drop-after');
      } else {
        row.classList.add('outline-drop-inside');
      }
    });

    this.container.addEventListener('dragleave', function (e) {
      var row = e.target.closest('.outline-row');
      if (row) {
        row.classList.remove('outline-drop-before', 'outline-drop-after', 'outline-drop-inside');
      }
    });

    this.container.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!self._dragState) return;

      var dragId = self._dragState.dragId;
      self._clearDropIndicators();

      var row = e.target.closest('.outline-row');
      if (!row) return;
      var item = row.closest('.outline-item');
      if (!item) return;
      var targetId = item.dataset.id;
      if (!targetId || targetId === dragId) return;

      if (self._isDescendant(dragId, targetId)) return;

      var rect = row.getBoundingClientRect();
      var y = e.clientY - rect.top;
      var threshold = rect.height / 3;

      var position;
      if (y < threshold) {
        position = 'before';
      } else if (y > rect.height - threshold) {
        position = 'after';
      } else {
        position = 'inside';
      }

      self._moveNode(dragId, targetId, position);
      self._dragState = null;
    });
  };

  OutlineEditor.prototype.loadFromMindmap = function () {
    if (!window.jm) {
      console.error('[OutlineEditor] window.jm not available');
      return;
    }
    var jmData = window.jm.get_data();
    this.treeData = deepClone(jmData.data);
    this._buildNodeMaps();
    this.render();
  };

  OutlineEditor.prototype._buildNodeMaps = function () {
    this._nodeMap = {};
    this._parentMap = {};
    if (this.treeData) {
      this._indexNode(this.treeData, null);
    }
  };

  OutlineEditor.prototype._indexNode = function (node, parentId) {
    this._nodeMap[node.id] = node;
    if (parentId) {
      this._parentMap[node.id] = parentId;
    }
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        this._indexNode(node.children[i], node.id);
      }
    }
  };

  OutlineEditor.prototype.render = function () {
    if (!this.container) return;
    this.container.innerHTML = '';
    this._buildNodeMaps();

    if (!this.treeData) {
      this.container.innerHTML = '<div class="outline-empty-hint"><div class="hint-icon">📝</div><div class="hint-text">' + this._t('outlineNoContent', '暂无内容') + '</div></div>';
      return;
    }

    this._renderNode(this.treeData, this.container, 0, true);

    if (!this.focusedId) {
      this.focusedId = this.treeData.id;
    }
    var self = this;
    setTimeout(function () {
      self._focusNode(self.focusedId, false);
    }, 50);
  };

  OutlineEditor.prototype._renderNode = function (node, parentEl, depth, isRoot) {
    var self = this;
    var itemEl = document.createElement('div');
    itemEl.className = 'outline-item' + (isRoot ? ' outline-root' : '');
    itemEl.dataset.id = node.id;
    itemEl.dataset.depth = depth;
    itemEl.dataset.isRoot = isRoot ? '1' : '0';

    var rowEl = document.createElement('div');
    rowEl.className = 'outline-row';
    rowEl.draggable = !isRoot;

    if (!isRoot) {
      var dragHandle = document.createElement('span');
      dragHandle.className = 'outline-drag-handle';
      dragHandle.textContent = '⋮⋮';
      dragHandle.title = self._t('outlineDragHint', '拖拽排序');
      rowEl.appendChild(dragHandle);
    }

    for (var i = 0; i < depth; i++) {
      var indentUnit = document.createElement('span');
      indentUnit.className = 'outline-indent-unit has-guide';
      rowEl.appendChild(indentUnit);
    }

    var toggleEl = document.createElement('span');
    var hasChildren = node.children && node.children.length > 0;
    if (hasChildren) {
      toggleEl.className = 'outline-toggle';
      var isExpanded = node.expanded !== false;
      toggleEl.textContent = isExpanded ? '▾' : '▸';
      if (!isExpanded) toggleEl.classList.add('outline-collapsed');
      (function (n, t) {
        t.addEventListener('click', function (e) {
          e.stopPropagation();
          self._toggleExpand(n, t);
        });
      })(node, toggleEl);
    } else {
      toggleEl.className = 'outline-toggle outline-leaf';
      toggleEl.textContent = '·';
    }
    rowEl.appendChild(toggleEl);

    var textEl = document.createElement('span');
    textEl.className = 'outline-text';
    textEl.contentEditable = 'true';
    textEl.spellcheck = false;
    textEl.dataset.nodeId = node.id;
    textEl.textContent = node.topic || '';
    if (!node.topic) {
      textEl.dataset.placeholder = isRoot ? this._t('outlineRootPlaceholder', '输入主题...') : this._t('outlinePlaceholder', '输入内容...');
    }

    var self = this;
    (function (n, t) {
      t.addEventListener('keydown', function (e) {
        self._handleKeyDown(e, n, t);
      });
      t.addEventListener('focus', function () {
        self.focusedId = n.id;
        var item = t.closest('.outline-item');
        if (item) {
          var prev = self.container.querySelector('.outline-focused');
          if (prev) prev.classList.remove('outline-focused');
          item.classList.add('outline-focused');
        }
      });
      t.addEventListener('blur', function () {
        var newTopic = t.textContent.trim();
        // 无论内容是否变化，都同步更新到思维导图和编辑器
        // 因为 input 事件已经实时更新了 n.topic，所以这里直接调用 applyToMindmap
        n.topic = newTopic;
        self.applyToMindmap();
        if (!newTopic) {
          t.dataset.placeholder = n.id === self.treeData.id ? self._t('outlineRootPlaceholder', '输入主题...') : self._t('outlinePlaceholder', '输入内容...');
        } else {
          delete t.dataset.placeholder;
        }
      });
      t.addEventListener('input', function () {
        // 实时更新节点 topic，但不触发同步（等待 blur 时再同步）
        n.topic = t.textContent;
        if (t.textContent) {
          delete t.dataset.placeholder;
        }
      });
    })(node, textEl);

    rowEl.appendChild(textEl);

    var notes = node.notes || (node.data && node.data.notes) || '';
    var notesHint = document.createElement('span');
    notesHint.className = 'outline-notes-hint';
    if (notes) {
      notesHint.textContent = self._t('outlineNotesHint', '备注');
      notesHint.title = notes.length > 50 ? notes.substring(0, 50) + '...' : notes;
    } else {
      notesHint.textContent = '+ ' + self._t('outlineAddNotes', '备注');
      notesHint.classList.add('outline-notes-add');
    }
    (function (n) {
      notesHint.addEventListener('click', function (e) {
        e.stopPropagation();
        self._toggleNotesEditor(n, itemEl);
      });
    })(node);
    rowEl.appendChild(notesHint);

    itemEl.appendChild(rowEl);

    if (notes) {
      var notesRow = document.createElement('div');
      notesRow.className = 'outline-notes-row';
      if (!isRoot) {
        var notesDragSpacer = document.createElement('span');
        notesDragSpacer.className = 'outline-notes-spacer';
        notesDragSpacer.style.width = '16px';
        notesRow.appendChild(notesDragSpacer);
      }
      for (var ni = 0; ni < depth; ni++) {
        var notesIndentUnit = document.createElement('span');
        notesIndentUnit.className = 'outline-indent-unit';
        notesRow.appendChild(notesIndentUnit);
      }
      var notesToggleSpacer = document.createElement('span');
      notesToggleSpacer.className = 'outline-notes-spacer';
      notesToggleSpacer.style.width = '20px';
      notesRow.appendChild(notesToggleSpacer);
      var notesContent = document.createElement('div');
      notesContent.className = 'outline-notes-content';
      notesContent.textContent = notes;
      (function (n, nc) {
        nc.addEventListener('click', function (e) {
          e.stopPropagation();
          self._toggleNotesEditor(n, itemEl);
        });
      })(node, notesContent);
      notesRow.appendChild(notesContent);
      itemEl.appendChild(notesRow);
    }

    if (hasChildren) {
      var childrenEl = document.createElement('div');
      childrenEl.className = 'outline-children';
      if (node.expanded === false) {
        childrenEl.classList.add('collapsed');
      }
      for (var ci = 0; ci < node.children.length; ci++) {
        this._renderNode(node.children[ci], childrenEl, depth + 1, false);
      }
      itemEl.appendChild(childrenEl);
    }

    parentEl.appendChild(itemEl);
  };

  OutlineEditor.prototype._clearDropIndicators = function () {
    if (!this.container) return;
    var rows = this.container.querySelectorAll('.outline-drop-before, .outline-drop-after, .outline-drop-inside');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('outline-drop-before', 'outline-drop-after', 'outline-drop-inside');
    }
  };

  OutlineEditor.prototype._isDescendant = function (ancestorId, nodeId) {
    var ancestor = this._nodeMap[ancestorId];
    if (!ancestor) return false;
    function check(node) {
      if (node.id === nodeId) return true;
      if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
          if (check(node.children[i])) return true;
        }
      }
      return false;
    }
    return check(ancestor);
  };

  OutlineEditor.prototype._moveNode = function (dragId, targetId, position) {
    var dragNode = this._nodeMap[dragId];
    var targetNode = this._nodeMap[targetId];
    if (!dragNode || !targetNode) return;

    var dragParentId = this._parentMap[dragId];
    if (!dragParentId) return;
    var dragParent = this._nodeMap[dragParentId];
    if (!dragParent || !dragParent.children) return;

    var dragIdx = -1;
    for (var i = 0; i < dragParent.children.length; i++) {
      if (dragParent.children[i].id === dragId) {
        dragIdx = i;
        break;
      }
    }
    if (dragIdx === -1) return;

    dragParent.children.splice(dragIdx, 1);

    var indentDelta = 0;

    if (position === 'inside') {
      if (!targetNode.children) targetNode.children = [];
      targetNode.children.push(dragNode);
      dragNode.parentid = targetId;
      targetNode.expanded = true;
      indentDelta = 2;
    } else {
      var targetParentId = this._parentMap[targetId];
      if (!targetParentId) {
        dragParent.children.splice(dragIdx, 0, dragNode);
        return;
      }
      var targetParent = this._nodeMap[targetParentId];
      if (!targetParent || !targetParent.children) {
        dragParent.children.splice(dragIdx, 0, dragNode);
        return;
      }

      var targetIdx = -1;
      for (var j = 0; j < targetParent.children.length; j++) {
        if (targetParent.children[j].id === targetId) {
          targetIdx = j;
          break;
        }
      }
      if (targetIdx === -1) {
        dragParent.children.splice(dragIdx, 0, dragNode);
        return;
      }

      var insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      targetParent.children.splice(insertIdx, 0, dragNode);
      dragNode.parentid = targetParentId;

      var oldIndent = dragNode.data && typeof dragNode.data.indent === 'number' ? dragNode.data.indent : 0;
      var newIndent = targetNode.data && typeof targetNode.data.indent === 'number' ? targetNode.data.indent : 0;
      indentDelta = newIndent - oldIndent;
    }

    if (indentDelta !== 0) {
      updateIndentRecursive(dragNode, indentDelta);
    }

    this.focusedId = dragId;
    this.render();
    this.applyToMindmap();
  };

  OutlineEditor.prototype._toggleNotesEditor = function (node, itemEl) {
    var existing = itemEl.querySelector('.outline-notes-editor');
    if (existing) {
      this._saveNotes(node, existing);
      existing.remove();
      return;
    }

    var notesRow = itemEl.querySelector(':scope > .outline-notes-row');
    var editorRow = document.createElement('div');
    editorRow.className = 'outline-notes-editor';
    var depth = parseInt(itemEl.dataset.depth, 10) || 0;
    var isRootNode = itemEl.dataset.isRoot === '1';
    if (!isRootNode) {
      var editorDragSpacer = document.createElement('span');
      editorDragSpacer.className = 'outline-notes-spacer';
      editorDragSpacer.style.width = '16px';
      editorRow.appendChild(editorDragSpacer);
    }
    for (var ei = 0; ei < depth; ei++) {
      var editorIndentUnit = document.createElement('span');
      editorIndentUnit.className = 'outline-indent-unit';
      editorRow.appendChild(editorIndentUnit);
    }
    var editorToggleSpacer = document.createElement('span');
    editorToggleSpacer.className = 'outline-notes-spacer';
    editorToggleSpacer.style.width = '20px';
    editorRow.appendChild(editorToggleSpacer);

    var textarea = document.createElement('textarea');
    textarea.className = 'outline-notes-textarea';
    var currentNotes = node.notes || (node.data && node.data.notes) || '';
    textarea.value = currentNotes;
    textarea.placeholder = this._t('outlineNotesPlaceholder', '输入备注内容...');

    var self = this;
    (function (n, ta) {
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          self._saveNotes(n, ta.closest('.outline-notes-editor'));
          self.render();
        } else if (e.key === 'Escape') {
          self.render();
        }
      });
      ta.addEventListener('blur', function () {
        setTimeout(function () {
          if (ta.closest('.outline-notes-editor')) {
            self._saveNotes(n, ta.closest('.outline-notes-editor'));
            self.render();
          }
        }, 100);
      });
    })(node, textarea);

    editorRow.appendChild(textarea);

    if (notesRow) {
      itemEl.insertBefore(editorRow, notesRow);
    } else {
      var childrenEl = itemEl.querySelector(':scope > .outline-children');
      if (childrenEl) {
        itemEl.insertBefore(editorRow, childrenEl);
      } else {
        itemEl.appendChild(editorRow);
      }
    }

    textarea.focus();
  };

  OutlineEditor.prototype._saveNotes = function (node, editorEl) {
    if (!editorEl) return;
    var textarea = editorEl.querySelector('.outline-notes-textarea');
    if (!textarea) return;
    var newNotes = textarea.value.trim();
    if (!node.data) node.data = {};
    node.data.notes = newNotes;
    node.notes = newNotes;
    this.applyToMindmap();
  };

  OutlineEditor.prototype._toggleExpand = function (node, toggleEl) {
    var itemEl = toggleEl.closest('.outline-item');
    if (!itemEl) return;
    var childrenEl = itemEl.querySelector(':scope > .outline-children');
    if (!childrenEl) return;

    var isExpanded = !childrenEl.classList.contains('collapsed');
    if (isExpanded) {
      childrenEl.classList.add('collapsed');
      toggleEl.textContent = '▸';
      toggleEl.classList.add('outline-collapsed');
      node.expanded = false;
    } else {
      childrenEl.classList.remove('collapsed');
      toggleEl.textContent = '▾';
      toggleEl.classList.remove('outline-collapsed');
      node.expanded = true;
    }
  };

  OutlineEditor.prototype._handleKeyDown = function (e, node, textEl) {
    if (this._composing) return;

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this._addSibling(node, textEl);
    } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this._indent(node, textEl);
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      this._outdent(node, textEl);
    } else if (e.key === 'ArrowUp') {
      if (isCursorAtStart(textEl)) {
        e.preventDefault();
        this._navigatePrev(textEl);
      }
    } else if (e.key === 'ArrowDown') {
      if (isCursorAtEnd(textEl)) {
        e.preventDefault();
        this._navigateNext(textEl);
      }
    } else if (e.key === 'Backspace') {
      if (textEl.textContent === '' && node.id !== this.treeData.id) {
        e.preventDefault();
        this._deleteNode(node, textEl);
      }
    } else if (e.key === 'Delete') {
      if (textEl.textContent === '' && node.id !== this.treeData.id) {
        e.preventDefault();
        this._deleteNode(node, textEl);
      }
    }
  };

  OutlineEditor.prototype._addSibling = function (node, textEl) {
    if (node.id === this.treeData.id) {
      this._addChild(node, textEl);
      return;
    }

    var parentId = this._parentMap[node.id];
    if (!parentId) return;
    var parent = this._nodeMap[parentId];
    if (!parent || !parent.children) return;

    var newNode = {
      id: generateId(),
      topic: '',
      expanded: true,
      children: [],
      parentid: parentId
    };

    if (node.data) {
      newNode.data = deepClone(node.data);
      delete newNode.data.notes;
    }

    var idx = -1;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].id === node.id) {
        idx = i;
        break;
      }
    }

    if (idx === -1) return;

    parent.children.splice(idx + 1, 0, newNode);
    this.focusedId = newNode.id;
    this.render();
    // 同步更新到思维导图和编辑器
    this.applyToMindmap();
  };

  OutlineEditor.prototype._addChild = function (node, textEl) {
    if (!node.children) node.children = [];

    var newNode = {
      id: generateId(),
      topic: '',
      expanded: true,
      children: [],
      parentid: node.id
    };

    if (node.data) {
      newNode.data = deepClone(node.data);
      delete newNode.data.notes;
      if (typeof newNode.data.indent === 'number') {
        newNode.data.indent = node.data.indent + 2;
      }
    }

    node.children.push(newNode);
    node.expanded = true;
    this.focusedId = newNode.id;
    this.render();
    // 同步更新到思维导图和编辑器
    this.applyToMindmap();
  };

  OutlineEditor.prototype._indent = function (node, textEl) {
    if (node.id === this.treeData.id) return;

    var parentId = this._parentMap[node.id];
    if (!parentId) return;
    var parent = this._nodeMap[parentId];
    if (!parent || !parent.children) return;

    var idx = -1;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].id === node.id) {
        idx = i;
        break;
      }
    }
    if (idx <= 0) return;

    var prevSibling = parent.children[idx - 1];

    parent.children.splice(idx, 1);

    if (!prevSibling.children) prevSibling.children = [];
    prevSibling.children.push(node);
    prevSibling.expanded = true;

    node.parentid = prevSibling.id;

    if (node.data && typeof node.data.level !== 'undefined') {
      node.data.level = node.data.level + 1;
    }

    updateIndentRecursive(node, 2);

    this.focusedId = node.id;
    this.render();
    // 同步更新到思维导图和编辑器
    this.applyToMindmap();
  };

  OutlineEditor.prototype._outdent = function (node, textEl) {
    if (node.id === this.treeData.id) return;

    var parentId = this._parentMap[node.id];
    if (!parentId) return;
    var parent = this._nodeMap[parentId];
    if (!parent) return;

    if (parent.id === this.treeData.id) return;

    var grandparentId = this._parentMap[parent.id];
    if (!grandparentId) return;
    var grandparent = this._nodeMap[grandparentId];
    if (!grandparent || !grandparent.children) return;

    var idxInParent = -1;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].id === node.id) {
        idxInParent = i;
        break;
      }
    }
    if (idxInParent === -1) return;

    parent.children.splice(idxInParent, 1);

    var parentIdx = -1;
    for (var j = 0; j < grandparent.children.length; j++) {
      if (grandparent.children[j].id === parent.id) {
        parentIdx = j;
        break;
      }
    }

    grandparent.children.splice(parentIdx + 1, 0, node);

    node.parentid = grandparent.id;

    if (node.data && typeof node.data.level !== 'undefined' && node.data.level > 1) {
      node.data.level = node.data.level - 1;
    }

    updateIndentRecursive(node, -2);

    this.focusedId = node.id;
    this.render();
    // 同步更新到思维导图和编辑器
    this.applyToMindmap();
  };

  OutlineEditor.prototype._deleteNode = function (node, textEl) {
    if (node.id === this.treeData.id) return;

    var parentId = this._parentMap[node.id];
    if (!parentId) return;
    var parent = this._nodeMap[parentId];
    if (!parent || !parent.children) return;

    var idx = -1;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].id === node.id) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;

    var prevSibling = idx > 0 ? parent.children[idx - 1] : null;

    parent.children.splice(idx, 1);

    if (prevSibling) {
      this.focusedId = prevSibling.id;
    } else {
      this.focusedId = parent.id;
    }

    this.render();
    // 同步更新到思维导图和编辑器
    this.applyToMindmap();
  };

  OutlineEditor.prototype._navigatePrev = function (textEl) {
    var allTexts = this._getVisibleTexts();
    var idx = allTexts.indexOf(textEl);
    if (idx > 0) {
      setCursorToEnd(allTexts[idx - 1]);
    }
  };

  OutlineEditor.prototype._navigateNext = function (textEl) {
    var allTexts = this._getVisibleTexts();
    var idx = allTexts.indexOf(textEl);
    if (idx < allTexts.length - 1) {
      setCursorToStart(allTexts[idx + 1]);
    }
  };

  OutlineEditor.prototype._getVisibleTexts = function () {
    if (!this.container) return [];
    var allTexts = this.container.querySelectorAll('.outline-text');
    var visible = [];
    for (var i = 0; i < allTexts.length; i++) {
      var el = allTexts[i];
      if (el.offsetParent !== null) {
        visible.push(el);
      }
    }
    return visible;
  };

  OutlineEditor.prototype._focusNode = function (nodeId, atEnd) {
    if (!this.container) return;
    var textEl = this.container.querySelector('.outline-text[data-node-id="' + nodeId + '"]');
    if (textEl) {
      if (atEnd !== false) {
        setCursorToEnd(textEl);
      } else {
        textEl.focus();
      }
    }
  };

  OutlineEditor.prototype.toNodeTree = function () {
    this._syncTextFromDOM();
    return deepClone(this.treeData);
  };

  OutlineEditor.prototype._syncTextFromDOM = function () {
    if (!this.container || !this.treeData) return;
    var textEls = this.container.querySelectorAll('.outline-text');
    for (var i = 0; i < textEls.length; i++) {
      var el = textEls[i];
      var nodeId = el.dataset.nodeId;
      var node = this._nodeMap[nodeId];
      if (node) {
        node.topic = el.textContent;
      }
    }
  };

  OutlineEditor.prototype.applyToMindmap = function () {
    if (!window.jm) {
      console.error('[OutlineEditor] window.jm not available');
      return;
    }

    this._syncTextFromDOM();

    var nodeTree = this._removeEmptyLeaves(this.toNodeTree(), true);

    if (!nodeTree || !nodeTree.id) {
      console.error('[OutlineEditor] nodeTree is invalid after removing empty leaves');
      return;
    }

    var jmData = window.jm.get_data();
    jmData.data = nodeTree;

    try {
      window.jm.show(jmData);
    } catch (e) {
      console.error('[OutlineEditor] jm.show() failed:', e);
    }

    // 直接调用保存，确保数据同步到编辑器
    // 优先使用 syncAll 进行完整同步（nodetree -> ast -> markdown）
    // 注意：syncAll 期望的 nodeTree 格式是 { data: nodeTree }，这是 jm.get_data() 的返回格式
    if (typeof syncAll === 'function') {
      var nodeTreeWrapper = { data: nodeTree };
      syncAll('mindmap', true, true, nodeTreeWrapper);
    } else if (typeof saveToLocalStorage === 'function') {
      saveToLocalStorage();
    } else if (typeof debouncedSave === 'function') {
      debouncedSave();
    }
  };

  OutlineEditor.prototype._removeEmptyLeaves = function (node, isRoot) {
    if (!node) return node;
    if (node.children && node.children.length > 0) {
      var filtered = [];
      for (var i = 0; i < node.children.length; i++) {
        var child = this._removeEmptyLeaves(node.children[i], false);
        if (child) filtered.push(child);
      }
      node.children = filtered;
    }
    if (!isRoot && !node.topic && (!node.children || node.children.length === 0)) {
      return null;
    }
    return node;
  };

  OutlineEditor.prototype.expandAll = function () {
    this._setExpandAll(this.treeData, true);
    this.render();
  };

  OutlineEditor.prototype.collapseAll = function () {
    this._setExpandAll(this.treeData, false);
    if (this.treeData) this.treeData.expanded = true;
    this.render();
  };

  OutlineEditor.prototype._setExpandAll = function (node, expanded) {
    if (!node) return;
    node.expanded = expanded;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        this._setExpandAll(node.children[i], expanded);
      }
    }
  };

  window.OutlineEditor = OutlineEditor;
})();
