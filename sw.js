/**
 * MindWord PWA Service Worker - 简化版
 * 只缓存核心文件，避免路径重复问题
 */

const CACHE_NAME = 'mindword-v10';

// 只缓存最关键的核心文件
const CORE_FILES = [
  'index.html',
  'app.html',
  'styles.css',
  'manifest.json'
];

// 安装事件 - 缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_FILES))
      .then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 获取事件 - 只处理核心文件，其他全部走网络
self.addEventListener('fetch', event => {
  const { request } = event;

  // 只处理GET请求
  if (request.method !== 'GET') return;

  // 只处理核心文件 - 简单文件名匹配
  const filename = request.url.split('/').pop();
  if (!CORE_FILES.includes(filename)) return;

  // 缓存优先策略
  event.respondWith(
    caches.match(request).then(response => {
      if (response) return response;

      return fetch(request).then(fetchResponse => {
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return fetchResponse;
      });
    })
  );
});