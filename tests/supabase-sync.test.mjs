import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadUnifiedSyncWithFailure(error) {
  const source = await readFile(new URL('../supabase-sync.js', import.meta.url), 'utf8');
  const syncStatus = { textContent: '' };
  const window = {
    MW_ACCOUNT_MODE: {
      isUnified: () => true,
      ready: Promise.resolve(true)
    },
    MW_TIMI_CLOUD: {
      getCurrentUser: async () => { throw error; }
    },
    addEventListener() {}
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById(id) {
      return id === 'lc-sync-status-menu' ? syncStatus : null;
    }
  };
  const context = {
    console,
    document,
    setTimeout: () => 0,
    TextEncoder,
    window
  };

  vm.runInNewContext(source, context, { filename: 'supabase-sync.js' });
  return { sync: window.MW_SPB_SYNC.sync, syncStatus };
}

async function loadSyncTestingHooks() {
  const source = await readFile(new URL('../supabase-sync.js', import.meta.url), 'utf8');
  const window = {
    __MW_TESTING__: true,
    MW_ACCOUNT_MODE: {
      isUnified: () => false
    },
    addEventListener() {}
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById() {
      return null;
    }
  };
  const context = {
    console,
    document,
    setTimeout: () => 0,
    TextEncoder,
    window
  };

  vm.runInNewContext(source, context, { filename: 'supabase-sync.js' });
  return window.MW_SPB_SYNC_TESTING;
}

test('统一云同步失败时保留原始错误，并正确显示失败状态', async () => {
  const originalError = new Error('真实云同步错误');
  const { sync, syncStatus } = await loadUnifiedSyncWithFailure(originalError);

  await assert.rejects(sync(), error => error === originalError);
  assert.equal(syncStatus.textContent, '同步失败');
});

test('同步预览忽略图片字段和换行格式的存储差异', async () => {
  const { generateSyncComparisons } = await loadSyncTestingHooks();
  const localData = {
    docs: [{
      id: 'doc-1',
      name: '图片文档',
      md: '第一行\r\n第二行',
      updatedAt: 100,
      images: [
        { id: 'image-b', name: 'b.png', type: 'image/png', data: 'data:image/png;base64, BBBB' },
        { id: 'image-a', name: 'a.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }
      ]
    }]
  };
  const cloudData = {
    docs: [{
      id: 'doc-1',
      name: '图片文档',
      md: '第一行\n第二行',
      updatedAt: 100,
      images: [
        { id: 'image-a', data: 'data:image/png;base64,AAAA', storageKey: 'ignored' },
        { id: 'image-b', dataUrl: 'DATA:IMAGE/PNG;BASE64,BBBB' }
      ]
    }]
  };

  const comparison = generateSyncComparisons(localData, cloudData)
    .find(item => item.key === 'doc_doc-1');
  assert.equal(comparison.isContentSame, true);

  cloudData.docs[0].images[0].data = 'data:image/png;base64,changed';
  const changedComparison = generateSyncComparisons(localData, cloudData)
    .find(item => item.key === 'doc_doc-1');
  assert.equal(changedComparison.isContentSame, false);
});

test('同步后的本地文档不保留内嵌图片数据', async () => {
  const { stripEmbeddedImageData } = await loadSyncTestingHooks();
  const docs = [{
    id: 'doc-1',
    md: '![image](image-1)',
    images: [{
      id: 'image-1',
      name: 'image.png',
      mime: 'image/png',
      data: 'data:image/png;base64,AAAA',
      dataUrl: 'data:image/png;base64,BBBB'
    }]
  }];

  const storedDocs = stripEmbeddedImageData(docs);
  assert.equal(storedDocs[0].images[0].id, 'image-1');
  assert.equal(storedDocs[0].images[0].name, 'image.png');
  assert.equal(storedDocs[0].images[0].mime, 'image/png');
  assert.equal('data' in storedDocs[0].images[0], false);
  assert.equal('dataUrl' in storedDocs[0].images[0], false);
  assert.equal(docs[0].images[0].data, 'data:image/png;base64,AAAA');
});
