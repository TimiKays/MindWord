import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadFetchHandler() {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const cache = {
    add: async () => {},
    put: async () => {}
  };
  const context = {
    URL,
    Request,
    Response,
    console,
    fetch: async () => new Response('ok', { status: 200 }),
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async () => null
    },
    self: {
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
      skipWaiting() {},
      clients: { claim: async () => {} }
    }
  };
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  return listeners.get('fetch');
}

function isHandledByServiceWorker(fetchHandler, requestUrl) {
  let handled = false;
  fetchHandler({
    request: new Request(requestUrl, { method: 'GET' }),
    respondWith() {
      handled = true;
    }
  });
  return handled;
}

test('认证和云数据请求始终绕过 Service Worker 缓存', async () => {
  const fetchHandler = await loadFetchHandler();

  assert.equal(isHandledByServiceWorker(fetchHandler, 'https://api.timikays.us.kg/api/auth/me'), false);
  assert.equal(isHandledByServiceWorker(fetchHandler, 'https://api.timikays.us.kg/api/cloud-data?product=mindword'), false);
  assert.equal(isHandledByServiceWorker(fetchHandler, 'https://cloudsync.mindword.dpdns.org/auth/v1/user'), false);
  assert.equal(isHandledByServiceWorker(fetchHandler, 'https://example.supabase.co/rest/v1/user_data'), false);
});

test('普通代码资源仍由 Service Worker 执行离线策略', async () => {
  const fetchHandler = await loadFetchHandler();
  assert.equal(isHandledByServiceWorker(fetchHandler, 'https://mindword.timikays.us.kg/app.js'), true);
});

test('旧域名恢复页始终绕过 Service Worker 缓存', async () => {
  const fetchHandler = await loadFetchHandler();
  assert.equal(isHandledByServiceWorker(fetchHandler, 'https://mindword.dpdns.org/recovery/'), false);
  assert.equal(isHandledByServiceWorker(fetchHandler, 'https://mindword.dpdns.org/recovery/recovery.js'), false);
});

test('Service Worker 发布版本链一致且缓存响应头没有 JS 通配冲突', async () => {
  const [swSource, versionRaw, appHtml, indexHtml, headers] = await Promise.all([
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../version.json', import.meta.url), 'utf8'),
    readFile(new URL('../app.html', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../_headers', import.meta.url), 'utf8')
  ]);
  const version = JSON.parse(versionRaw);
  const swVersion = swSource.match(/const SW_VERSION = '([^']+)'/)?.[1];

  assert.equal(swVersion, version.swVersion);
  assert.match(appHtml, new RegExp(`mindword-version" content="${version.version.replace(/\./g, '\\.')}"`));
  assert.match(appHtml, new RegExp(`sw-register\\.js\\?v=${version.version.replace(/\./g, '\\.')}`));
  assert.match(indexHtml, new RegExp(`sw-register\\.js\\?v=${version.version.replace(/\./g, '\\.')}`));
  assert.match(headers, /^\/sw\.js\r?$/m);
  assert.match(headers, /^\/sw-register\.js\r?$/m);
  assert.doesNotMatch(headers, /^\/\*\.js\r?$/m);
});
