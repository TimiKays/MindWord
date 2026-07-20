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

test('统一云同步失败时保留原始错误，并正确显示失败状态', async () => {
  const originalError = new Error('真实云同步错误');
  const { sync, syncStatus } = await loadUnifiedSyncWithFailure(originalError);

  await assert.rejects(sync(), error => error === originalError);
  assert.equal(syncStatus.textContent, '同步失败');
});
