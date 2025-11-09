/**
 * 面向文档的撤销管理器（UndoManager），专为 jsMind 设计
 * - 使用完整的 JSON 快照字符串作为历史记录
 * - 为每个文档维护独立的撤销栈（undoStack）与重做栈（redoStack）
 * - 需要三个回调：
 *     getSnapshot(): 返回当前文档的快照字符串
 *     restoreSnapshot(snapshotString): 根据快照字符串恢复状态
 *     getCurrentDocumentId(): 返回当前文档的唯一标识
 *
 * 用法：
 *   const um = new UndoManager({
 *     maxCapacity: 10,
 *     getSnapshot: () => JSON.stringify(jm.get_data()),
 *     restoreSnapshot: (s) => { jm.show(JSON.parse(s)); },
 *     getCurrentDocumentId: () => getCurrentDocumentId() // 返回当前文档ID
 *   });
 *
 *   // 在同步或保存点调用：
 *   um.recordIfChanged();
 *
 *   // 键盘或 UI 触发：
 *   um.undo();
 *   um.redo();
 */

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

/**
 * 撤销管理器构造函数
 * 
 * @param {Object} options 配置项，最重要的是构建这个撤销管理器的回调函数，影响数据。
 * @param {number} [options.maxCapacity=10] 最大历史记录容量
 * @param {Function} options.getSnapshot 获取当前文档快照的回调函数，需返回字符串
 * @param {Function} options.restoreSnapshot 根据快照字符串恢复状态的回调函数
 * @param {Function} options.getCurrentDocumentId 获取当前文档唯一标识的回调函数
 * @param {number} [options.debounce=0] 防抖时间（毫秒），连续快速操作合并为一次记录
 */
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

  // 防抖功能初始化
  this.debounce = typeof options.debounce === 'number' ? options.debounce : 0;
  this._debounceTimer = null;


}

// prototype 是函数对象的一个特殊属性，它用于实现所有实例共享的函数。
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

// recordIfChanged: 防抖处理状态记录请求
// 如果设置了防抖时间，延迟执行 _recordNow()；否则立即执行
// 真正的状态比较和入栈逻辑在 _recordNow() 中处理
UndoManager.prototype.recordIfChanged = function () {
  var self = this;
  console.log('[UndoManager] recordIfChanged called');
  if (this.debounce > 0) {
    // 防抖逻辑：延迟执行
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

// _recordNow: 执行实际的状态记录逻辑
// 获取当前快照，与上次保存的快照比较，如果有变化则入栈到撤销栈并清空重做栈
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
    console.log('[UndoManager] 首次快照仅初始化 for docId=' + docId + ' （不入栈）');
    return false;
  }

  console.log('[UndoManager] 对比新旧快照有无变化？ docId=' + docId + '，老快照=' + stacks.lastSnapshot + '，新快照=' + snapshot);

  // 只比较数据内容，忽略视图状态
  function extractDataFromSnapshot(snapshotStr) {
    try {
      var parsed = JSON.parse(snapshotStr);
      // 如果是新格式（包含data和viewState），只返回data部分
      if (parsed && parsed.data) {
        return JSON.stringify(parsed.data);
      }
      // 如果是旧格式（只有数据），直接返回
      return snapshotStr;
    } catch (e) {
      // 解析失败，认为不同
      return snapshotStr;
    }
  }

  var oldData = extractDataFromSnapshot(stacks.lastSnapshot);
  var newData = extractDataFromSnapshot(snapshot);

  // 若无变化则跳过（只比较数据内容）
  if (oldData === newData) {
    console.log('[UndoManager] 数据内容没变化，跳过记录!');
    return false;
  } else {
    console.log('[UndoManager] 数据内容有变化，开始记录！');
  }



  // 将“之前的快照”入栈，使得 undo 能恢复到之前状态
  this._pushUndo(stacks.lastSnapshot);
  // 更新 lastSnapshot 为当前快照
  stacks.lastSnapshot = snapshot;

  // 新的用户编辑清空 redo 栈
  stacks.redoStack = [];
  console.log('[UndoManager] 有变化，新增记录 docId=' + docId + ', undoStack.len=' + stacks.undoStack.length + ', redoStack cleared');
  return true;
};

// 撤销或重做实现：用快照替换当前状态
// 内部标志用于防止恢复期间再次记录
UndoManager.prototype._restore = function (snapshot) {
  console.log('[UndoManager] log：开始恢复: snapshot' + snapshot);
  if (!snapshot) {
    console.warn('[UndoManager] 没有快照，无法恢复');
    return false;
  }

  this.isRestoring = true;
  console.log('[UndoManager] _restore starting');

  try {
    var ok = this.restoreSnapshot(snapshot);
    // after restore, update lastSnapshot to restored snapshot for current document
    var docId = this._getCurrentDocumentId();
    var stacks = this._getDocumentStacks(docId);
    stacks.lastSnapshot = snapshot;
    console.log('[UndoManager] 快照恢复完成, ok=' + !!ok + ', docId=' + docId + ', 可撤销数=' + stacks.undoStack.length + ', 可重做数=' + stacks.redoStack.length);

    return ok;
  } catch (e) {
    console.error('[UndoManager] 恢复过程中出错:', e);
    return false;
  }
  // 注意：这里不再立即重置isRestoring，而是等待保存完成
};


/**
 * 撤销
 * 1. 从当前文档的 undo 栈顶弹出一项
 * 2. 将当前状态压入 redo 栈
 * 3. 使用弹出的快照恢复状态
 * @returns {boolean} 成功返回 true，失败返回 false
 */
UndoManager.prototype.undo = function () {
  var docId = this._getCurrentDocumentId();
  var stacks = this._getDocumentStacks(docId);
  console.log('[UndoManager] ---------------log：开始撤销: docId=' + docId + ', 可撤销数=' + stacks.undoStack.length + ', 可重做数=' + stacks.redoStack.length);
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

  return this._restore(targetSnapshot);
};


/**
 * 重做
 * 1. 从当前文档的 redo 栈顶弹出一项
 * 2. 将当前状态压入 undo 栈
 * 3. 使用弹出的快照恢复状态
 * @returns {boolean} 成功返回 true，失败返回 false
 */
UndoManager.prototype.redo = function () {
  var docId = this._getCurrentDocumentId();
  console.log('[UndoManager] ---------------log：开始重做: docId=' + docId);
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
    
    // 检查是否在文本框中，如果是则不阻止默认行为，让浏览器原生撤销/重做生效
    var target = e.target;
    var isTextInput = target && (
      target.tagName === 'TEXTAREA' || 
      target.tagName === 'INPUT' || 
      target.contentEditable === 'true'
    );
    
    // Ctrl+Z
    if (!e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      if (prevent && !isTextInput) e.preventDefault();
      console.log('[UndoManager] keyboard: Ctrl+Z detected, isTextInput=' + isTextInput);
      if (!isTextInput) {
        self.undo();
      }
    }
    // Ctrl+Shift+Z or Ctrl+Y
    if ((e.shiftKey && (e.key === 'Z' || e.key === 'z')) || (!e.shiftKey && (e.key === 'y' || e.key === 'Y'))) {
      if (prevent && !isTextInput) e.preventDefault();
      console.log('[UndoManager] keyboard: Redo detected, isTextInput=' + isTextInput);
      if (!isTextInput) {
        self.redo();
      }
    }
  }

  el.addEventListener('keydown', handler, false);
  console.log('[UndoManager] bindKeyboard: bound to element', el && (el.tagName || el.nodeName));
  // return unbind function
  return function unbind() {
    el.removeEventListener('keydown', handler, false);
  };
};

// 把撤销管理器暴露到全局
window.UndoManager = UndoManager;
// Also attach to jsmind namespace if exists
if (window.jsMind) {
  window.jsMind.UndoManager = UndoManager;
}
console.log('[UndoManager] script loaded and exported');
