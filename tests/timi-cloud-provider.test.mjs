import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadProvider(overrides = {}) {
  const source = await readFile(new URL('../timi-cloud-provider.js', import.meta.url), 'utf8');
  const pushes = [];
  const context = {
    console,
    TextEncoder,
    URLSearchParams,
    window: {
      MW_ACCOUNT_MODE: {
        isUnified: () => true,
        ready: Promise.resolve(true)
      },
      TimiAuth: {
        checkSession: async () => ({ id: 'unified-user', email: 'internal@example.com' })
      },
      TimiCloud: {
        pull: async () => [],
        push: async (key, value, product) => {
          pushes.push({ key, value, product });
          return { updated_at: 12345 };
        },
        remove: async () => ({ deleted: 1 })
      },
      ...overrides
    }
  };
  vm.runInNewContext(source, context, { filename: 'timi-cloud-provider.js' });
  return { provider: context.window.MW_TIMI_CLOUD, pushes, window: context.window };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('workspace_v1 拉取后转换为现有同步预览需要的数据结构', async () => {
  const workspace = {
    schemaVersion: 1,
    docs: [
      { id: 'doc-1', name: '云端文档' },
      { id: 'doc-deleted', name: '已删除文档', deletedAt: 550 }
    ],
    aiConfig: { openai: { model: 'gpt-test' } },
    promptTemplates: [],
    myPromptTemplates: [],
    docUpdatedAt: 100,
    aiConfigLastModified: 200,
    promptTemplatesLastModified: 300,
    myPromptTemplatesLastModified: 400,
    aiConfigHash: null,
    promptTemplatesHash: 'prompt-hash',
    myPromptTemplatesHash: 'my-prompt-hash',
    sourceUpdatedAtMs: 500
  };
  const { provider } = await loadProvider({
    MW_ACCOUNT_MODE: { isUnified: () => true, ready: Promise.resolve(true) },
    TimiAuth: { checkSession: async () => ({ id: 'unified-user' }) },
    TimiCloud: {
      pull: async () => [{ data_key: 'workspace_v1', data_value: JSON.stringify(workspace), data_size: 2048, updated_at: 600 }],
      push: async () => ({}),
      remove: async () => ({})
    }
  });

  const cloud = plain(await provider.downloadWorkspace());
  assert.equal(cloud.docUpdatedAt, 100);
  assert.equal(cloud.configUpdatedAt, 200);
  assert.equal(cloud.templateUpdatedAt, 300);
  assert.equal(cloud.myPromptTemplateUpdatedAt, 400);
  assert.equal(cloud.updatedAtMs, 600);
  assert.deepEqual(cloud.docs, workspace.docs);
  const status = plain(await provider.getCloudStatus());
  assert.deepEqual(status, {
    exists: true,
    docCount: 1,
    sizeBytes: 2048,
    limitBytes: 10 * 1024 * 1024,
    updatedAt: 600
  });
});

test('上传前递归移除 AI 密钥，并能在用户选择云端配置后恢复本机密钥', async () => {
  const { provider, pushes } = await loadProvider();
  const localConfig = {
    openai: { model: 'local-model', apiKey: 'sk-local-secret-value' },
    proxy: { endpoint: 'https://example.com?access_token=hidden' },
    headers: ['Accept: application/json', 'Bearer internal-array-secret']
  };
  const target = {
    docs: [{ id: 'doc-1', md: '# Hello' }],
    aiConfig: localConfig,
    promptTemplates: [],
    myPromptTemplates: [],
    docUpdatedAt: 100,
    aiConfigLastModified: 200,
    aiConfigHash: 'includes-local-secret'
  };

  await provider.uploadWorkspace(target);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].key, 'workspace_v1');
  assert.equal(pushes[0].product, 'mindword');
  const serialized = JSON.stringify(pushes[0].value);
  assert.doesNotMatch(serialized, /sk-local-secret-value|hidden|internal-array-secret/);
  assert.equal(pushes[0].value.aiConfig.openai.model, 'local-model');
  assert.equal(pushes[0].value.aiConfig.headers[1], null);
  assert.equal(pushes[0].value.aiConfigHash, null);
  assert.equal(target.aiConfig.openai.apiKey, 'sk-local-secret-value');
  const uploadedStatus = plain(await provider.getCloudStatus());
  assert.equal(uploadedStatus.exists, true);
  assert.equal(uploadedStatus.docCount, 1);
  assert.equal(uploadedStatus.updatedAt, 12345);
  assert.ok(uploadedStatus.sizeBytes > 0);

  const restored = plain(provider.restoreLocalSecrets(localConfig, {
    openai: { model: 'cloud-model' },
    proxy: {},
    headers: ['Accept: text/plain', null]
  }));
  assert.equal(restored.openai.model, 'cloud-model');
  assert.equal(restored.openai.apiKey, 'sk-local-secret-value');
  assert.equal(restored.proxy.endpoint, 'https://example.com?access_token=hidden');
  assert.equal(restored.headers[1], 'Bearer internal-array-secret');
});

test('云端工作区缺失时返回空快照，格式异常时阻止同步', async () => {
  const { provider } = await loadProvider();
  const empty = plain(await provider.downloadWorkspace());
  assert.deepEqual(empty.docs, []);
  assert.equal(empty.docUpdatedAt, 0);

  assert.throws(
    () => provider.parseWorkspaceItem({ data_value: JSON.stringify({ schemaVersion: 2 }), updated_at: 1 }),
    /版本异常/
  );
  assert.throws(
    () => provider.parseWorkspaceItem({ data_value: '{broken-json', updated_at: 1 }),
    /格式异常/
  );
});

test('云端状态复用五分钟缓存，主动刷新时重新读取', async () => {
  let pullCount = 0;
  const workspace = {
    schemaVersion: 1,
    docs: [{ id: 'doc-1' }],
    aiConfig: {},
    promptTemplates: [],
    myPromptTemplates: []
  };
  const { provider } = await loadProvider({
    MW_ACCOUNT_MODE: { isUnified: () => true, ready: Promise.resolve(true) },
    TimiAuth: { checkSession: async () => ({ id: 'unified-user' }) },
    TimiCloud: {
      pull: async () => {
        pullCount += 1;
        return [{ data_key: 'workspace_v1', data_value: workspace, data_size: 1024, updated_at: 700 }];
      },
      push: async () => ({}),
      remove: async () => ({})
    }
  });

  await provider.getCloudStatus();
  await provider.getCloudStatus();
  assert.equal(pullCount, 1);
  await provider.getCloudStatus({ force: true });
  assert.equal(pullCount, 2);
});

test('默认模式加载统一账户 SDK，legacy 参数才回退旧链路', async () => {
  const source = await readFile(new URL('../account-mode.js', import.meta.url), 'utf8');

  async function run(search, options = {}) {
    const storage = new Map();
    const loaded = [];
    const styles = [];
    const htmlClasses = new Set();
    let authInitConfig = null;
    let cloudInitConfig = null;
    let topbarInitConfig = null;
    const accountMount = {
      dataset: {},
      style: {},
      addEventListener(eventName, handler) {
        this[`on${eventName}`] = handler;
      },
      querySelector() { return null; }
    };
    const window = {
      location: { search, href: 'https://mindword.example/app.html' },
      sessionStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
      }
    };
    const document = {
      readyState: 'complete',
      querySelector: () => null,
      getElementById: id => id === 'mw-unified-account-mount' ? accountMount : null,
      documentElement: {
        classList: {
          add: className => htmlClasses.add(className),
          remove: className => htmlClasses.delete(className)
        }
      },
      createElement: tagName => ({
        tagName: tagName.toUpperCase(),
        dataset: {},
        addEventListener(eventName, handler) {
          this[`on${eventName}`] = handler;
        }
      }),
      head: {
        appendChild(asset) {
          if (asset.rel === 'stylesheet') {
            styles.push(asset.href);
            queueMicrotask(() => asset.onload());
            return;
          }
          loaded.push(asset.src);
          if (asset.src.includes('auth-sdk')) {
            window.TimiAuth = { init(config) { authInitConfig = config; } };
          } else if (asset.src.includes('cloud-sync')) {
            window.TimiCloud = { init(config) { cloudInitConfig = config; } };
          } else if (asset.src.includes('topbar.js')) {
            if (options.failTopbar) {
              queueMicrotask(() => asset.onerror());
              return;
            }
            window.TimiTopBar = { renderAuth(config) { topbarInitConfig = config; } };
          }
          queueMicrotask(() => asset.onload());
        }
      }
    };
    vm.runInNewContext(source, { console, document, URLSearchParams, window }, { filename: 'account-mode.js' });
    const readyResult = await window.MW_ACCOUNT_MODE.ready;
    const accountMenuResult = await window.MW_ACCOUNT_MODE.accountMenuReady;
    return {
      mode: window.MW_ACCOUNT_MODE.mode,
      readyResult,
      accountMenuResult,
      loaded,
      styles,
      authInitConfig,
      cloudInitConfig,
      topbarInitConfig,
      htmlClasses: [...htmlClasses],
      window
    };
  }

  const legacy = await run('?account_mode=legacy');
  assert.equal(legacy.mode, 'legacy');
  assert.equal(legacy.loaded.length, 0);
  assert.equal(legacy.styles.length, 0);

  const unified = await run('');
  assert.equal(unified.mode, 'unified');
  assert.equal(unified.loaded.length, 3);
  assert.equal(unified.styles.length, 1);
  assert.ok(unified.loaded.some(src => src.endsWith('/sdk/topbar.js?v=2.2.0')));
  assert.ok(unified.styles.some(href => href.endsWith('/sdk/topbar.css?v=2.2.0')));
  assert.equal(unified.authInitConfig.product, 'mindword');
  assert.equal(unified.cloudInitConfig.product, 'mindword');
  assert.equal(unified.cloudInitConfig.timeoutMs, 30000);
  assert.equal(unified.topbarInitConfig.container, '#mw-unified-account-mount');
  assert.equal(unified.topbarInitConfig.currentProduct, 'mindword');
  assert.equal(unified.topbarInitConfig.theme, 'light');
  assert.equal(unified.topbarInitConfig.membershipScope, 'product');
  assert.deepEqual(plain(unified.topbarInitConfig.auth), { requireLogin: false });
  assert.equal(unified.topbarInitConfig.menu.showAccount, true);
  assert.equal(unified.topbarInitConfig.menu.showMembership, true);
  assert.equal(unified.topbarInitConfig.menu.showInvite, false);
  assert.equal(unified.topbarInitConfig.menu.showLogout, true);
  assert.deepEqual(plain(unified.topbarInitConfig.menu.extraItems), [
    { icon: '☁', label: '立即同步', href: '#mw-cloud-sync' },
    { icon: '⌫', label: '清空云数据', href: '#mw-cloud-clear' }
  ]);
  const statusSection = unified.topbarInitConfig.menu.statusSection;
  assert.equal(statusSection.title, '数据同步');
  assert.equal(statusSection.refreshIntervalMs, 0);
  assert.equal(typeof statusSection.load, 'function');
  unified.window.MW_SPB_SYNC = {
    getLocalStatus: () => ({ docCount: 3, sizeBytes: 2048 })
  };
  unified.window.MW_TIMI_CLOUD = {
    getCloudStatus: async () => ({
      exists: true,
      docCount: 2,
      sizeBytes: 4096,
      limitBytes: 10 * 1024 * 1024,
      updatedAt: 0
    })
  };
  assert.deepEqual(plain(await statusSection.load()), {
    rows: [
      { label: '本地文档', value: '3 个 · 2.0KB' },
      { label: '云端文档', value: '2 个 · 4.0KB' },
      { label: '最近备份', value: '尚未备份' }
    ],
    progress: {
      label: '备份容量',
      value: 4096,
      max: 10 * 1024 * 1024,
      text: '4.0KB / 10MB'
    }
  });
  assert.equal(typeof unified.topbarInitConfig.onLogout, 'function');
  assert.deepEqual(unified.htmlClasses, ['mw-shared-account-ready']);

  const degraded = await run('', { failTopbar: true });
  assert.equal(degraded.readyResult, true);
  assert.equal(degraded.accountMenuResult, false);
  assert.equal(degraded.cloudInitConfig.product, 'mindword');
  assert.equal(degraded.topbarInitConfig, null);
  assert.deepEqual(degraded.htmlClasses, []);
});

test('统一账户菜单保留 MindWord 自己的同步、清云和退出流程', async () => {
  const [appSource, authSource] = await Promise.all([
    readFile(new URL('../app.html', import.meta.url), 'utf8'),
    readFile(new URL('../user-supabase.js', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /id="lc-sync-controls-menu"/);
  assert.match(appSource, /id="lc-clear-btn-menu"/);
  assert.match(appSource, /id="auth-logout-menu"/);
  assert.match(appSource, /id="mw-unified-account-mount"/);
  assert.match(authSource, /TimiAuth\.logout\(\)/);
  assert.match(await readFile(new URL('../account-mode.js', import.meta.url), 'utf8'), /TimiTopBar\.renderAuth/);
});
