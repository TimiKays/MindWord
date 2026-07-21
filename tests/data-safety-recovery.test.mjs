import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

async function loadDataSafety(storage) {
  const source = await readFile(new URL('../data-safety.js', import.meta.url), 'utf8');
  const document = {
    readyState: 'loading',
    documentElement: { lang: 'zh-CN' },
    addEventListener() {},
    getElementById() { return null; }
  };
  const window = {
    localStorage: storage,
    getComputedStyle() { return { display: 'none' }; }
  };
  vm.runInNewContext(source, {
    alert() {},
    console,
    document,
    localStorage: storage,
    setTimeout() { return 0; },
    window
  }, { filename: 'data-safety.js' });
  return { api: window.MW_DATA_SAFETY, source };
}

async function loadRecovery(storage) {
  const source = await readFile(new URL('../recovery/recovery.js', import.meta.url), 'utf8');
  const document = {
    readyState: 'loading',
    addEventListener() {}
  };
  const window = {
    indexedDB: null,
    localStorage: storage,
    location: {
      hostname: 'mindword.dpdns.org',
      origin: 'https://mindword.dpdns.org'
    }
  };
  vm.runInNewContext(source, {
    Blob,
    URL,
    Uint8Array,
    atob,
    console,
    decodeURIComponent,
    document,
    setTimeout() { return 0; },
    window
  }, { filename: 'recovery.js' });
  return { api: window.MW_RECOVERY, source, window };
}

class FakeZip {
  constructor(root, prefix = '') {
    this.root = root || this;
    this.prefix = prefix;
    if (!root) this.files = new Map();
  }

  folder(name) {
    const prefix = this.prefix + String(name).replace(/\/$/, '') + '/';
    this.root.files.set(prefix, { dir: true });
    return new FakeZip(this.root, prefix);
  }

  file(name, value) {
    this.root.files.set(this.prefix + name, value);
    return this;
  }

  async generateAsync(_options, onProgress) {
    if (onProgress) onProgress({ percent: 100 });
    return { files: this.files };
  }
}

test('数据安全提醒面向所有用户，并按七天周期控制频率', async () => {
  const storage = createStorage();
  const { api, source } = await loadDataSafety(storage);

  assert.ok(api);
  assert.equal(api.shouldAutoOpen(1000), true);
  storage.setItem(api.noticeKey, '2000');
  assert.equal(api.shouldAutoOpen(1000), false);
  assert.equal(api.shouldAutoOpen(2000), true);
  assert.equal(api.recoveryUrl, 'https://mindword.dpdns.org/recovery/');
  assert.match(source, /MindWord 不会自动同步/);
  assert.match(source, /无论是否登录/);
  assert.match(source, /无需登录/);
  assert.match(source, /mw-data-safety-mark" aria-hidden="true"><span>i<\/span>/);
  assert.doesNotMatch(source, /mw-data-safety-mark" aria-hidden="true">✓/);
});

test('恢复扫描合并新旧文档库，保留较新版本并补充未归档草稿', async () => {
  const storage = createStorage({
    mw_documents: JSON.stringify([
      { id: 'same', name: '当前版本', md: '# 当前', updatedAt: 10 },
      { id: 'deleted', name: '已删除', md: '# 删除', deletedAt: 20 }
    ]),
    mindword_docs: JSON.stringify([
      { id: 'same', name: '较新版本', md: '# 较新', updatedAt: 30 },
      { id: 'legacy-only', name: '旧版独有', md: '# 旧版', updatedAt: 15 }
    ]),
    mindword_markdown_data: '# 未归档内容'
  });
  const { api } = await loadRecovery(storage);
  const result = api.collectDocuments(storage, 100);

  assert.equal(result.docs.length, 3);
  assert.equal(result.docs.find(doc => doc.id === 'same').md, '# 较新');
  assert.equal(result.docs.some(doc => doc.id === 'legacy-only'), true);
  assert.equal(result.docs.some(doc => doc.isDraft), true);
  assert.equal(result.draftCount, 1);
  assert.equal(result.deletedCount, 1);
});

test('恢复 ZIP 使用独立恢复 ID，不覆盖新地址文档，AI 密钥默认不导出', async () => {
  const storage = createStorage({
    mw_documents: JSON.stringify([{ id: 'doc-1', name: '项目计划', md: '# 内容', updatedAt: 10 }]),
    allAIPlatformConfigs: JSON.stringify([{ apiKey: 'sensitive-key' }])
  });
  const { api, window } = await loadRecovery(storage);
  window.JSZip = FakeZip;
  const snapshot = await api.scanLocalData(storage, null, 100);

  const withoutAi = await api.buildRecoveryZip(snapshot, storage, { includeAiConfig: false });
  const metaPath = Array.from(withoutAi.files.keys()).find(path => /\/meta\.json$/.test(path));
  const meta = JSON.parse(withoutAi.files.get(metaPath));
  assert.equal(meta.id, 'recovered_doc-1');
  assert.equal(meta.originalId, 'doc-1');
  assert.equal(Array.from(withoutAi.files.keys()).some(path => path.endsWith('platform-configs.json')), false);

  const withAi = await api.buildRecoveryZip(snapshot, storage, { includeAiConfig: true });
  assert.equal(Array.from(withAi.files.keys()).some(path => path.endsWith('platform-configs.json')), true);
});

test('恢复页不包含上传用户数据的网络调用，并设置禁止索引和缓存', async () => {
  const [html, script, headers] = await Promise.all([
    readFile(new URL('../recovery/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../recovery/recovery.js', import.meta.url), 'utf8'),
    readFile(new URL('../_headers', import.meta.url), 'utf8')
  ]);

  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /同一台设备、同一个浏览器/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /XMLHttpRequest|sendBeacon/);
  assert.match(headers, /^\/recovery\/\*\r?$/m);
  assert.match(headers, /Cache-Control: no-store, no-cache, must-revalidate/);
});
