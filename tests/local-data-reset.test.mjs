import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] || null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

async function loadResetHelper(storage) {
  const source = await readFile(new URL('../local-data-reset.js', import.meta.url), 'utf8');
  const timers = [];
  const window = {
    addEventListener() {},
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    }
  };
  const document = { readyState: 'loading' };
  const context = { console, document, localStorage: storage, window };
  vm.runInNewContext(source, context, { filename: 'local-data-reset.js' });
  return { api: window.MW_LOCAL_DATA_RESET, timers };
}

test('开始清理后保留保护标记并删除所有旧数据', async () => {
  const storage = new MemoryStorage({
    mw_documents: '[{"id":"old-doc"}]',
    mindword_markdown_data: '旧内容',
    allAIPlatformConfigs: '{"key":"secret"}'
  });
  const { api } = await loadResetHelper(storage);

  assert.equal(api.begin(), 3);
  assert.equal(storage.getItem('mw_documents'), null);
  assert.equal(storage.getItem('mindword_markdown_data'), null);
  assert.equal(storage.getItem('allAIPlatformConfigs'), null);
  assert.equal(api.isPending(), true);
});

test('页面重新加载时会再次清理可能被旧 iframe 写回的数据', async () => {
  const marker = JSON.stringify({ startedAt: Date.now(), expiresAt: Date.now() + 10000 });
  const storage = new MemoryStorage({
    mw_local_reset_pending: marker,
    mw_documents: '[{"id":"stale-doc"}]',
    mindword_markdown_data: '不应保留'
  });
  const { api } = await loadResetHelper(storage);

  assert.equal(storage.getItem('mw_documents'), null);
  assert.equal(storage.getItem('mindword_markdown_data'), null);
  assert.equal(api.isPending(), true);
});

test('重置标记在有效期内保持，过期后自动放开正常保存', async () => {
  const now = Date.now();
  const storage = new MemoryStorage({
    mw_local_reset_pending: JSON.stringify({ startedAt: now - 20000, expiresAt: now - 1 })
  });
  const { api } = await loadResetHelper(storage);

  assert.equal(api.isPending(), false);
  assert.equal(storage.getItem('mw_local_reset_pending'), null);
});
