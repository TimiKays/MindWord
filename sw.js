/**
 * MindWord PWA Service Worker
 * 处理离线缓存和PWA功能
 */

const CACHE_NAME = 'mindword-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.html',
  '/styles.css',
  '/init.js',
  '/documents.js',
  '/language-switch.js',
  '/i18n/locales.js',
  '/i18n/i18n-manager.js',
  '/jsmind/mindmap-core.js',
  '/jsmind/mindmap.css',
  '/jsmind/node-data-structure.js',
  '/jsmind/node-operator.js',
  '/jsmind/tree-operator.js',
  '/jsmind/icons.js',
  '/local-deps/bootstrap.min.css',
  '/local-deps/bootstrap.bundle.min.js',
  '/local-deps/jquery.min.js',
  '/res/LOGO32.ico',
  '/res/LOGO256.ico',
  '/res/LOGO.png',
  '/res/add.svg',
  '/res/edit.svg',
  '/res/export.svg',
  '/res/import.svg',
  '/res/download.svg',
  '/res/close.svg'
];

// 安装事件 - 缓存资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('MindWord PWA: 缓存资源中...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('MindWord PWA: 资源缓存完成');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('MindWord PWA: 缓存失败:', error);
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('MindWord PWA: 删除旧缓存', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('MindWord PWA: Service Worker 激活完成');
      return self.clients.claim();
    })
  );
});

// 获取事件 - 网络优先策略
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非GET请求
  if (request.method !== 'GET') {
    return;
  }

  // 跳过Chrome扩展和API请求
  if (url.pathname.startsWith('/api/') || url.protocol === 'chrome-extension:') {
    return;
  }

  // HTML文件使用网络优先策略
  if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 如果请求成功，缓存响应
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // 网络失败时返回缓存
          return caches.match(request).then(response => {
            if (response) {
              return response;
            }
            // 如果缓存也没有，返回离线页面
            return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 其他资源使用缓存优先策略
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        // 有缓存，返回缓存并后台更新
        fetch(request).then(fetchResponse => {
          if (fetchResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, fetchResponse);
            });
          }
        }).catch(() => {
          // 后台更新失败也没关系，用户已经有缓存了
        });
        return response;
      }

      // 没有缓存，尝试网络请求
      return fetch(request).then(fetchResponse => {
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return fetchResponse;
      });
    }).catch(() => {
      // 网络和缓存都失败，返回离线页面
      return caches.match('/index.html');
    })
  );
});

// 消息处理 - 用于更新通知等
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 后台同步 - 用于数据同步
self.addEventListener('sync', event => {
  if (event.tag === 'sync-documents') {
    event.waitUntil(syncDocuments());
  }
});

// 文档同步函数
async function syncDocuments() {
  try {
    console.log('MindWord PWA: 开始同步文档');
    // 这里可以添加具体的同步逻辑
    // 比如同步到LeanCloud或其他云服务
    return Promise.resolve();
  } catch (error) {
    console.error('MindWord PWA: 文档同步失败:', error);
    return Promise.reject(error);
  }
}