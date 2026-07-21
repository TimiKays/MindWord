/**
 * MindWord PWA Service Worker - 强制尽早更新版
 * 核心策略：PWA可离线安装，但代码必须尽早更新
 */

const SW_VERSION = 'v202607211215';
const CACHE_NAME = 'mindword-' + SW_VERSION;
const BUILD_TIME = new Date().toISOString();

const OFFLINE_ESSENTIAL = [
  '/',
  '/index.html',
  '/app.html',
  '/offline.html',
  '/styles.css',
  '/manifest.json',
  '/local-deps/bootstrap.min.css',
  '/local-deps/font-awesome.min.css',
  '/local-deps/jquery.min.js',
  '/local-deps/bootstrap.bundle.min.js',
  '/local-deps/markdown-it.min.js',
  '/fonts/fontawesome-webfont.woff2',
  '/res/LOGO.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          OFFLINE_ESSENTIAL.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] 缓存失败:', url, err);
            })
          )
        );
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存:', k);
            return caches.delete(k);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: SW_VERSION,
      cacheName: CACHE_NAME,
      buildTime: BUILD_TIME
    });
  }
});

function shouldBypassCache(url) {
  const pathname = url.pathname;
  const hostname = url.hostname;

  // 恢复页必须始终从网络加载，避免旧脚本干扰本地数据导出。
  if (pathname.startsWith('/recovery/')) {
    return true;
  }

  // 认证与用户云数据绝不能进入 Cache API。Cookie 不属于缓存键，缓存这些
  // 响应会在断网或切换账号后返回旧用户状态或旧工作区。
  if (hostname === 'api.timikays.us.kg' ||
    hostname === 'cloudsync.mindword.dpdns.org' ||
    hostname.endsWith('.supabase.co') ||
    pathname.startsWith('/auth/v1/') ||
    pathname.startsWith('/rest/v1/') ||
    pathname.startsWith('/api/')) {
    return true;
  }

  if (hostname.includes('lc-cn-n1-shared.com') ||
    hostname.includes('lcapp.cn') ||
    hostname.includes('leancloud.cn') ||
    pathname.includes('/1.1/classes/') ||
    pathname.includes('/1.1/users/') ||
    pathname.includes('/1.1/files/') ||
    (hostname.includes('lc-') && pathname.includes('/1.1/'))) {
    return true;
  }

  if (pathname === '/api/likes') {
    return true;
  }

  return false;
}

function isCodeFile(pathname) {
  return pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.html') ||
    pathname.endsWith('.json');
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const pathname = url.pathname;

  if (shouldBypassCache(url)) {
    return;
  }

  if (pathname === '/sw.js') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response.status === 200) {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, resClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            if (pathname === '/') {
              return caches.match('/index.html');
            }
            return caches.match('/offline.html');
          });
        })
    );
    return;
  }

  if (isCodeFile(pathname)) {
    const cacheBustedRequest = new Request(event.request.url, {
      method: event.request.method,
      headers: event.request.headers,
      mode: event.request.mode,
      credentials: event.request.credentials,
      cache: 'no-store'
    });

    event.respondWith(
      fetch(cacheBustedRequest)
        .then(networkRes => {
          if (networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, resClone);
            });
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            if (cached) {
              console.log('[SW] 网络失败，使用缓存:', pathname);
              return cached;
            }
            if (pathname.endsWith('.css')) {
              return new Response('/* 离线 */', {
                headers: { 'Content-Type': 'text/css' },
                status: 200
              });
            }
            if (pathname.endsWith('.js')) {
              return new Response('// 离线', {
                headers: { 'Content-Type': 'application/javascript' },
                status: 200
              });
            }
            if (pathname.endsWith('.json')) {
              return new Response('{}', {
                headers: { 'Content-Type': 'application/json' },
                status: 200
              });
            }
            return new Response('', { status: 404 });
          });
        })
    );
    return;
  }

  const isStaticResource = pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.ttf') ||
    pathname.endsWith('.eot') ||
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.webp');

  if (isStaticResource) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          fetch(event.request).then(networkRes => {
            if (networkRes.status === 200) {
              const resClone = networkRes.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, resClone);
              });
            }
          }).catch(() => { });
          return cached;
        }
        return fetch(event.request).then(networkRes => {
          if (networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, resClone);
            });
          }
          return networkRes;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
