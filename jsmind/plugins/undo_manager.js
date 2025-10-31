/**
 * Document-aware UndoManager for jsMind
 * - Uses full JSON snapshot strings as history entries
 * - Keeps separate undoStack and redoStack for each document
 * - Requires two callbacks:
 *     getSnapshot(): returns current snapshot string
 *     restoreSnapshot(snapshotString): restores state from snapshot
 *     getCurrentDocumentId(): returns unique identifier for current document
 *
 * Usage:
 *   const um = new UndoManager({
 *     maxCapacity: 10,
 *     getSnapshot: () => JSON.stringify(jm.get_data()),
 *     restoreSnapshot: (s) => { jm.show(JSON.parse(s)); },
 *     getCurrentDocumentId: () => getCurrentDocumentId() // 返回当前文档ID
 *   });
 *
 *   // On sync/save point:
 *   um.recordIfChanged();
 *
 *   // Keyboard or UI:
 *   um.undo();
 *   um.redo();
 */
(function (global) {
  'use strict';

  function now() {
    return Date.now();
  }

  function isString(v) {
    return typeof v === 'string' || v instanceof String;
  }

  function defaultGetSnapshot() {
    return null;
  }

  function defaultRestoreSnapshot() {
    return false;
  }

  function defaultGetCurrentDocumentId() {
    return 'default';
  }

  function UndoManager(options) {
    options = options || {};
    this.maxCapacity = options.maxCapacity || 10;
    this.getSnapshot = options.getSnapshot || defaultGetSnapshot;
    this.restoreSnapshot = options.restoreSnapshot || defaultRestoreSnapshot;
    this.getCurrentDocumentId = options.getCurrentDocumentId || defaultGetCurrentDocumentId;

    // 按文档ID存储撤销重做记录
    this.documentStacks = {};
    this.isRestoring = false;
    this._lastSnapshot = {};

    // optional debounce window in ms to merge very fast consecutive snapshots
    this.debounce = typeof options.debounce === 'number' ? options.debounce : 0;
    this._debounceTimer = null;

    console.log('[UndoManager] initialized (maxCapacity=' + this.maxCapacity + ', debounce=' + this.debounce + ')');
  }

  UndoManager.prototype._getCurrentDocumentId = function () {
    try {
      return this.getCurrentDocumentId();
    } catch (e) {
      console.error('[UndoManager] Error getting current document ID:', e);
      return 'default';
    }
  };

  UndoManager.prototype._getDocumentStacks = function (docId) {
    if (!this.documentStacks[docId]) {
      this.documentStacks[docId] = {
        undoStack: [],
        redoStack: [],
        lastSnapshot: null
      };
    }
    return this.documentStacks[docId];
  };

  UndoManager.prototype._pushUndo = function (snapshot) {
    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);
    stacks.undoStack.push({ ts: now(), snapshot: snapshot });
    if (stacks.undoStack.length > this.maxCapacity) {
      stacks.undoStack.shift();
    }
    console.log('[UndoManager] _pushUndo: docId=' + docId + ', undoStack.length=' + stacks.undoStack.length);
  };

  UndoManager.prototype._pushRedo = function (snapshot) {
    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);
    stacks.redoStack.push({ ts: now(), snapshot: snapshot });
    if (stacks.redoStack.length > this.maxCapacity) {
      stacks.redoStack.shift();
    }
    console.log('[UndoManager] _pushRedo: docId=' + docId + ', redoStack.length=' + stacks.redoStack.length);
  };

  UndoManager.prototype.clear = function (docId) {
    if (docId) {
      // 清除指定文档的记录
      if (this.documentStacks[docId]) {
        this.documentStacks[docId] = {
          undoStack: [],
          redoStack: [],
          lastSnapshot: null
        };
      }
    } else {
      // 清除所有文档的记录
      this.documentStacks = {};
    }
  };

  UndoManager.prototype.canUndo = function () {
    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);
    return stacks.undoStack.length > 0;
  };

  UndoManager.prototype.canRedo = function () {
    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);
    return stacks.redoStack.length > 0;
  };

  // recordIfChanged: get current snapshot via getSnapshot()
  // if different from last saved snapshot, push to undo stack and clear redo
  UndoManager.prototype.recordIfChanged = function () {
    var self = this;
    console.log('[UndoManager] recordIfChanged called');
    if (this.debounce > 0) {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }
      this._debounceTimer = setTimeout(function () {
        self._recordNow();
        self._debounceTimer = null;
      }, this.debounce);
    } else {
      this._recordNow();
    }
  };

  UndoManager.prototype._recordNow = function () {
    if (this.isRestoring) {
      console.log('[UndoManager] _recordNow skipped due to isRestoring');
      return false;
    }
    var snapshot = this.getSnapshot();
    if (!isString(snapshot)) {
      try {
        snapshot = JSON.stringify(snapshot);
      } catch (e) {
        console.error('[UndoManager] _recordNow stringify failed', e);
        return false;
      }
    }
    if (snapshot == null) {
      console.warn('[UndoManager] _recordNow snapshot is null');
      return false;
    }

    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);

    // 首次快照仅初始化 lastSnapshot（不入栈）
    if (stacks.lastSnapshot === null) {
      stacks.lastSnapshot = snapshot;
      console.log('[UndoManager] _recordNow initialized lastSnapshot for docId=' + docId + ' (no push)');
      return false;
    }

    // 若无变化则跳过
    if (stacks.lastSnapshot === snapshot) {
      console.log('[UndoManager] _recordNow no change detected for docId=' + docId);
      return false;
    }

    // 将“之前的快照”入栈，使得 undo 能恢复到之前状态
    this._pushUndo(stacks.lastSnapshot);
    // 更新 lastSnapshot 为当前快照
    stacks.lastSnapshot = snapshot;

    // 新的用户编辑清空 redo 栈
    stacks.redoStack = [];
    console.log('[UndoManager] _recordNow saved snapshot for docId=' + docId + ', undoStack.len=' + stacks.undoStack.length + ', redoStack cleared');
    return true;
  };

  // restore: replaces current state with snapshot
  // internal flag prevents record during restore
  UndoManager.prototype._restore = function (snapshot) {
    if (!snapshot) {
      console.warn('[UndoManager] _restore called with empty snapshot');
      return false;
    }
    try {
      this.isRestoring = true;
      console.log('[UndoManager] _restore starting');
      var ok = this.restoreSnapshot(snapshot);
      // after restore, update lastSnapshot to restored snapshot for current document
      var docId = this._getCurrentDocumentId();
      var stacks = this._getDocumentStacks(docId);
      stacks.lastSnapshot = snapshot;
      console.log('[UndoManager] _restore finished, ok=' + !!ok + ', docId=' + docId);
      return ok;
    } finally {
      this.isRestoring = false;
    }
  };

  UndoManager.prototype.undo = function () {
    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);
    if (!this.canUndo()) {
      console.warn('[UndoManager] undo called but canUndo=false for docId=' + docId);
      return false;
    }
    var last = stacks.undoStack.pop();
    if (!last) {
      console.warn('[UndoManager] undo: nothing popped');
      return false;
    }
    var targetSnapshot = last.snapshot;
    if (stacks.lastSnapshot) {
      this._pushRedo(stacks.lastSnapshot);
    }
    console.log('[UndoManager] undo popped snapshot for docId=' + docId + ', undoStack.len=' + stacks.undoStack.length);
    return this._restore(targetSnapshot);
  };

  UndoManager.prototype.redo = function () {
    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);
    if (!this.canRedo()) {
      console.warn('[UndoManager] redo called but canRedo=false for docId=' + docId);
      return false;
    }
    var last = stacks.redoStack.pop();
    if (!last) {
      console.warn('[UndoManager] redo: nothing popped');
      return false;
    }
    var targetSnapshot = last.snapshot;
    if (stacks.lastSnapshot) {
      this._pushUndo(stacks.lastSnapshot);
    }
    console.log('[UndoManager] redo popped snapshot for docId=' + docId + ', redoStack.len=' + stacks.redoStack.length);
    return this._restore(targetSnapshot);
  };

  UndoManager.prototype.getStacks = function (docId) {
    if (!docId) {
      docId = this._getCurrentDocumentId();
    }
    var stacks = this._getDocumentStacks(docId);
    return {
      undo: stacks.undoStack,
      redo: stacks.redoStack
    };
  };

  // 获取所有文档的堆栈信息
  UndoManager.prototype.getAllDocumentStacks = function () {
    var allStacks = {};
    for (var docId in this.documentStacks) {
      if (this.documentStacks.hasOwnProperty(docId)) {
        var stacks = this.documentStacks[docId];
        var docTitle = this._getDocumentTitle(docId);
        allStacks[docId] = {
          title: docTitle,
          undo: stacks.undoStack.length,
          redo: stacks.redoStack.length,
          undoStack: stacks.undoStack.map(function (item) {
            return {
              timestamp: item.ts,
              snapshotPreview: item.snapshot ? item.snapshot.substring(0, 100) + '...' : 'null'
            };
          }),
          redoStack: stacks.redoStack.map(function (item) {
            return {
              timestamp: item.ts,
              snapshotPreview: item.snapshot ? item.snapshot.substring(0, 100) + '...' : 'null'
            };
          })
        };
      }
    }
    return allStacks;
  };

  // 获取文档标题
  UndoManager.prototype._getDocumentTitle = function (docId) {
    try {
      // 尝试从app.html的全局函数获取文档信息
      if (typeof window.mw_loadDocs === 'function') {
        var docs = window.mw_loadDocs();
        var doc = docs.find(function (d) { return d.id === docId; });
        if (doc && doc.name) {
          return doc.name;
        }
      }

      // 尝试从localStorage直接获取
      var docsJson = localStorage.getItem('mindword_docs');
      if (docsJson) {
        var docs = JSON.parse(docsJson);
        var doc = docs.find(function (d) { return d.id === docId; });
        if (doc && doc.name) {
          return doc.name;
        }
      }

      return '未命名文档';
    } catch (e) {
      console.warn('[UndoManager] 获取文档标题失败:', e);
      return '未命名文档';
    }
  };

  // Helper: bind keyboard shortcuts to an element (or document)
  // options: { element: DOMElement (defaults to document), preventDefault: true }
  UndoManager.prototype.bindKeyboard = function (options) {
    options = options || {};
    var el = options.element || document;
    var prevent = options.preventDefault !== false;
    var self = this;

    function handler(e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      // Ctrl+Z
      if (!e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        if (prevent) e.preventDefault();
        console.log('[UndoManager] keyboard: Ctrl+Z detected');
        self.undo();
      }
      // Ctrl+Shift+Z or Ctrl+Y
      if ((e.shiftKey && (e.key === 'Z' || e.key === 'z')) || (!e.shiftKey && (e.key === 'y' || e.key === 'Y'))) {
        if (prevent) e.preventDefault();
        console.log('[UndoManager] keyboard: Redo detected');
        self.redo();
      }
    }

    el.addEventListener('keydown', handler, false);
    console.log('[UndoManager] bindKeyboard: bound to element', el && (el.tagName || el.nodeName));
    // return unbind function
    return function unbind() {
      el.removeEventListener('keydown', handler, false);
    };
  };

  // Export
  global.UndoManager = UndoManager;
  // Also attach to jsmind namespace if exists
  if (global.jsMind) {
    global.jsMind.UndoManager = UndoManager;
  }
  console.log('[UndoManager] script loaded and exported');
})(window);