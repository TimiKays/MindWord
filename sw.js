/**
 * MindWord PWA Service Worker
 * 处理离线缓存和PWA功能
 */

const CACHE_NAME = 'mindword-v9';
const MAX_CACHE_SIZE = 200; // 最大缓存文件数量
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7天缓存有效期

// 核心文件 - 必须预缓存的关键文件
const CORE_FILES = [
  '/',
  '/index.html',
  '/app.html',
  '/styles.css',
  '/init.js',
  '/documents.js',
  '/language-switch.js',
  '/lazy-loader.js',
  '/user.js',
  '/copynew_file.js',
  '/mobile-suit.js',
  '/msg-listener-show.js',
  '/notification-bridge.js',
  '/i18n/locales.js',
  '/i18n/i18n-manager.js',
  '/three-iframes.js',
  '/sw.js',
  '/manifest.json'
];

// iframe 核心文件
const IFRAME_FILES = [
  '/editor/editor.html',
  '/md2word/md2word.html',
  '/jsmind/mindmap.html'
];

// mindmap 图标文件 - 预缓存所有图标确保离线可用
const MINDMAP_ICONS = [
  '/res/edit.svg',
  '/res/下钻.svg',
  '/res/上钻.svg',
  '/res/添加子级.svg',
  '/res/添加同级.svg',
  '/res/添加子树.svg',
  '/res/扩写备注.svg',
  '/res/删除.svg',
  '/res/生成初始树.svg',
  '/res/undo.svg',
  '/res/redo.svg',
  '/res/download.svg',
  '/res/code.svg',
  '/res/setting.svg',
  '/res/tag.svg',
  '/res/kuaisu.svg',
  '/res/detail.svg',
  '/res/help.svg',
  '/res/empty.svg'
];

// jsmind 核心文件 - 确保思维导图功能离线可用
const JSMIND_CORE_FILES = [
  '/jsmind-local/jsmind.css',
  '/jsmind-local/jsmind.js',
  '/jsmind-local/jsmind.draggable-node.js',
  '/jsmind-local/jsmind.screenshot.js'
];

// 运行时缓存配置 - 严格限制缓存范围
const RUNTIME_CACHE_PATTERNS = [
  // 只允许缓存核心资源文件 - 包含英文和中文文件名的SVG
  { pattern: /^\/res\/.*\.(svg|png|ico)$/, type: 'core-icon' },
  { pattern: /^\/fonts\//, type: 'font' },
  { pattern: /^\/local-deps\/(FileSaver|markdown-it|dom-to-image)\.min\.(js|css)$/, type: 'core-dep' },
  { pattern: /^\/jsmind-local\/jsmind\.(css|js)$/, type: 'core-module' }
];

// 完整的预缓存列表
const urlsToCache = [
  ...CORE_FILES,
  ...IFRAME_FILES,
  ...MINDMAP_ICONS,
  ...JSMIND_CORE_FILES
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

// 检查请求是否匹配任何运行时缓存模式
function matchesRuntimeCachePattern(request) {
  const url = new URL(request.url);
  return RUNTIME_CACHE_PATTERNS.some(patternConfig =>
    patternConfig.pattern.test(url.pathname)
  );
}

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

  // ===== 第一步：特殊处理 - 这些文件直接返回缓存，避免循环 =====

  // 特殊处理1：i18n文件 - 直接缓存优先，避免循环加载
  if (url.pathname.includes('/i18n/')) {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          return response; // 有缓存直接返回
        }
        // 没有缓存则网络请求并缓存
        return fetch(request).then(fetchResponse => {
          if (fetchResponse.status === 200) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return fetchResponse;
        }).catch(() => {
          // 网络失败时提供fallback
          if (url.pathname.includes('locales.js')) {
            return new Response('window.i18nLocales = {};', {
              status: 200,
              headers: new Headers({ 'Content-Type': 'application/javascript' })
            });
          }
          if (url.pathname.includes('i18n-manager.js')) {
            return new Response('// i18n manager fallback', {
              status: 200,
              headers: new Headers({ 'Content-Type': 'application/javascript' })
            });
          }
          return caches.match('/index.html');
        });
      })
    );
    return; // 重要：这里必须return，阻止后续逻辑执行
  }

  // 特殊处理2：screenShot-all.png - 避免preload循环
  if (url.pathname.includes('screenShot-all.png')) {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          return response;
        }
        return fetch(request).then(fetchResponse => {
          if (fetchResponse.status === 200) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return fetchResponse;
        }).catch(() => {
          const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
          return fetch(transparentPixel).then(r => r);
        });
      })
    );
    return; // 重要：这里必须return，阻止后续逻辑执行
  }

  // 特殊处理3：编码的SVG文件名 - 处理URL编码的中文文件名
  if (url.pathname.includes('.svg') && url.pathname.includes('%')) {
    // 解码URL以匹配原始文件名
    const decodedPath = decodeURIComponent(url.pathname);

    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          return response;
        }

        // 尝试使用解码后的路径查找缓存
        return caches.match(decodedPath).then(decodedResponse => {
          if (decodedResponse) {
            return decodedResponse;
          }

          // 网络请求并缓存
          return fetch(request).then(fetchResponse => {
            if (fetchResponse.status === 200) {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
                // 同时用解码路径缓存一份
                cache.put(decodedPath, responseClone.clone());
              });
            }
            return fetchResponse;
          }).catch(() => {
            // 返回一个空的SVG作为fallback
            const emptySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"></svg>';
            return new Response(emptySvg, {
              status: 200,
              headers: new Headers({ 'Content-Type': 'image/svg+xml' })
            });
          });
        });
      })
    );
    return; // 重要：这里必须return，阻止后续逻辑执行
  }

  // 运行时缓存策略 - 匹配模式的新资源自动缓存
  if (matchesRuntimeCachePattern(request)) {
    // 特殊检查：如果是iframe相关文件，跳过运行时缓存，让后面的专门逻辑处理
    const iframePaths = ['/editor/editor.html', '/md2word/md2word.html', '/jsmind/mindmap.html'];
    const isIframeSource = iframePaths.some(path => url.pathname.startsWith(path));

    if (isIframeSource) {
      // 不处理iframe文件，让后面的专门逻辑处理
      // 继续执行到下面的iframe特殊处理逻辑
    } else {
      // 处理非iframe的运行时缓存
      event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
          return cache.match(request).then(cachedResponse => {
            if (cachedResponse) {
              // 有缓存，返回缓存并在后台更新
              fetch(request).then(fetchResponse => {
                if (fetchResponse.status === 200) {
                  cache.put(request, fetchResponse.clone());
                }
              }).catch(() => {
                // 后台更新失败也没关系
              });
              return cachedResponse;
            }

            // 没有缓存，尝试网络请求
            return fetch(request).then(fetchResponse => {
              if (fetchResponse.status === 200) {
                cache.put(request, fetchResponse.clone());
              }
              return fetchResponse;
            }).catch(() => {
              // 网络和缓存都失败，返回基础离线页面
              return cache.match('/index.html');
            });
          });
        })
      );
      return;
    }
  }

  // 特殊处理iframe源文件 - 使用缓存优先策略
  const iframePaths = ['/editor/editor.html', '/md2word/md2word.html', '/jsmind/mindmap.html'];
  const isIframeSource = iframePaths.some(path => url.pathname.startsWith(path));

  if (isIframeSource) {
    event.respondWith(
      // 尝试匹配无参数的缓存版本（基础文件）
      caches.match(url.pathname).then(response => {
        if (response) {
          return response;
        }

        // 如果没有基础缓存，尝试匹配带参数的请求
        return caches.match(request).then(response => {
          if (response) {
            return response;
          }

          // 如果都没有，尝试网络请求
          return fetch(request).then(fetchResponse => {
            if (fetchResponse.status === 200) {
              const responseClone = fetchResponse.clone();
              // 缓存基础版本（无参数）用于后续请求
              caches.open(CACHE_NAME).then(cache => {
                cache.put(url.pathname, responseClone);
              });
            }
            return fetchResponse;
          }).catch(() => {
            // 返回有意义的离线页面
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <title>离线模式 - MindWord</title>
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    height: 100vh; 
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-align: center;
                  }
                  .offline-container {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                  }
                  .offline-icon {
                    font-size: 48px;
                    margin-bottom: 20px;
                  }
                  h2 { 
                    margin: 0 0 15px 0; 
                    font-size: 24px;
                    font-weight: 600;
                  }
                  p { 
                    margin: 0; 
                    opacity: 0.9;
                    font-size: 16px;
                    line-height: 1.5;
                  }
                </style>
              </head>
              <body>
                <div class="offline-container">
                  <div class="offline-icon">🌐</div>
                  <h2>离线模式</h2>
                  <p>当前处于离线状态，部分功能可能受限。<br>请连接网络以获取完整功能。</p>
                </div>
              </body>
              </html>
            `, {
              status: 200,
              headers: new Headers({
                'Content-Type': 'text/html'
              })
            });
          });
        });
      })
    );
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