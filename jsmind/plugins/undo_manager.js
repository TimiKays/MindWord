/**
 * UndoManager for jsMind (core only)
 * - Uses full JSON snapshot strings as history entries
 * - Keeps undoStack and redoStack with maxCapacity (default 10)
 * - Requires two callbacks:
 *     getSnapshot(): returns current snapshot string
 *     restoreSnapshot(snapshotString): restores state from snapshot
 *
 * Usage:
 *   const um = new UndoManager({
 *     maxCapacity: 10,
 *     getSnapshot: () => JSON.stringify(jm.get_data()),
 *     restoreSnapshot: (s) => { jm.show(JSON.parse(s)); }
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

  function UndoManager(options) {
    options = options || {};
    this.maxCapacity = options.maxCapacity || 10;
    this.getSnapshot = options.getSnapshot || defaultGetSnapshot;
    this.restoreSnapshot = options.restoreSnapshot || defaultRestoreSnapshot;

    this.undoStack = [];
    this.redoStack = [];
    this.isRestoring = false;
    this._lastSnapshot = null;

    // optional debounce window in ms to merge very fast consecutive snapshots
    this.debounce = typeof options.debounce === 'number' ? options.debounce : 0;
    this._debounceTimer = null;

    console.log('[UndoManager] initialized (maxCapacity=' + this.maxCapacity + ', debounce=' + this.debounce + ')');
  }

  UndoManager.prototype._pushUndo = function (snapshot) {
    this.undoStack.push({ ts: now(), snapshot: snapshot });
    if (this.undoStack.length > this.maxCapacity) {
      this.undoStack.shift();
    }
    console.log('[UndoManager] _pushUndo: undoStack.length=' + this.undoStack.length);
  };

  UndoManager.prototype._pushRedo = function (snapshot) {
    this.redoStack.push({ ts: now(), snapshot: snapshot });
    if (this.redoStack.length > this.maxCapacity) {
      this.redoStack.shift();
    }
    console.log('[UndoManager] _pushRedo: redoStack.length=' + this.redoStack.length);
  };

  UndoManager.prototype.clear = function () {
    this.undoStack = [];
    this.redoStack = [];
    this._lastSnapshot = null;
  };

  UndoManager.prototype.canUndo = function () {
    return this.undoStack.length > 0;
  };

  UndoManager.prototype.canRedo = function () {
    return this.redoStack.length > 0;
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

    // 首次快照仅初始化 lastSnapshot（不入栈）
    if (this._lastSnapshot === null) {
      this._lastSnapshot = snapshot;
      console.log('[UndoManager] _recordNow initialized lastSnapshot (no push)');
      return false;
    }

    // 若无变化则跳过
    if (this._lastSnapshot === snapshot) {
      console.log('[UndoManager] _recordNow no change detected');
      return false;
    }

    // 将“之前的快照”入栈，使得 undo 能恢复到之前状态
    this._pushUndo(this._lastSnapshot);
    // 更新 lastSnapshot 为当前快照
    this._lastSnapshot = snapshot;

    // 新的用户编辑清空 redo 栈
    this.redoStack = [];
    console.log('[UndoManager] _recordNow saved snapshot, undoStack.len=' + this.undoStack.length + ', redoStack cleared');
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
      // after restore, update lastSnapshot to restored snapshot
      this._lastSnapshot = snapshot;
      console.log('[UndoManager] _restore finished, ok=' + !!ok);
      return ok;
    } finally {
      this.isRestoring = false;
    }
  };

  UndoManager.prototype.undo = function () {
    if (!this.canUndo()) {
      console.log('[UndoManager] undo called but cannot undo');
      return false;
    }
    console.log('[UndoManager] undo called');
    // Current state should be pushed to redo before popping undo
    var currentSnapshot = this.getSnapshot();
    if (!isString(currentSnapshot)) {
      try {
        currentSnapshot = JSON.stringify(currentSnapshot);
      } catch (e) {
        currentSnapshot = null;
      }
    }
    if (currentSnapshot) {
      this._pushRedo(currentSnapshot);
    }

    // Pop the last undo snapshot and restore it
    var last = this.undoStack.pop();
    if (!last) {
      console.warn('[UndoManager] undo: nothing popped');
      return false;
    }
    var targetSnapshot = last.snapshot;

    // After restoring, set lastSnapshot accordingly and do not push restore to undo
    var res = this._restore(targetSnapshot);
    console.log('[UndoManager] undo completed, undoStack.len=' + this.undoStack.length + ', redoStack.len=' + this.redoStack.length);
    return res;
  };

  UndoManager.prototype.redo = function () {
    if (!this.canRedo()) {
      console.log('[UndoManager] redo called but cannot redo');
      return false;
    }
    console.log('[UndoManager] redo called');
    var currentSnapshot = this.getSnapshot();
    if (!isString(currentSnapshot)) {
      try {
        currentSnapshot = JSON.stringify(currentSnapshot);
      } catch (e) {
        currentSnapshot = null;
      }
    }
    if (currentSnapshot) {
      this._pushUndo(currentSnapshot);
    }

    var last = this.redoStack.pop();
    if (!last) {
      console.warn('[UndoManager] redo: nothing popped');
      return false;
    }
    var targetSnapshot = last.snapshot;
    var res = this._restore(targetSnapshot);
    console.log('[UndoManager] redo completed, undoStack.len=' + this.undoStack.length + ', redoStack.len=' + this.redoStack.length);
    return res;
  };

  UndoManager.prototype.getStacks = function () {
    return {
      undo: this.undoStack.map(function (s) { return s.ts; }),
      redo: this.redoStack.map(function (s) { return s.ts; })
    };
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