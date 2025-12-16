/**
 * MindWord PWA Service Worker - 简化版
 * 只缓存核心文件，避免路径重复问题
 */

const CACHE_NAME = 'mindword-v26';

// 只缓存最关键的核心文件
const CORE_FILES = [
  // 根路径 - 确保基础导航可用
  '/',

  // 根目录文件（除了.md和.txt文件，按文件名升序排列）
  '/ai-modal.js',
  '/app.html',
  '/auth.html',
  '/copynew_file.js',
  '/documents.js',
  '/favicon.ico',
  '/index.html',
  '/init.js',
  '/language-switch.js',
  '/lazy-loader.js',
  '/LICENSE.txt',
  '/LOGO.ico',
  '/manifest.json',
  '/mobile-suit.js',
  '/monitor-AIset.js',
  '/msg-listener-show.js',
  '/notification-bridge.js',
  '/offline-config.json',
  '/styles.css',
  '/sw.js',
  '/three-iframes.js',
  '/user.js',
  '/offline.html', // 离线页面

  // ai目录
  '/ai/newai/AIServiceModal.html',
  '/ai/newai/platform-configs.json',
  '/ai/newai/prompt-templates.json',
  '/ai/newai/user-template-manager.html',
  '/ai/newai/user-templates.json',

  // changelog目录
  '/changelog/changelog.html',
  '/changelog/2025-11-21_1.gif',
  '/changelog/CHANGELOG.md',

  // converter目录
  '/converter/ast-node.js',
  '/converter/ast-to-md.js',
  '/converter/ast-to-node-tree.js',
  '/converter/converter.js',
  '/converter/load.js',
  '/converter/main.css',
  '/converter/md-to-ast.js',
  '/converter/node-tree-to-ast.js',
  '/converter/sync.js',

  // editor目录
  '/editor/editor.html',


  // fonts目录
  '/fonts/fontawesome-webfont.ttf',
  '/fonts/fontawesome-webfont.woff',
  '/fonts/fontawesome-webfont.woff2',

  // i18n目录
  '/i18n/i18n-manager.js',
  '/i18n/locales.js',

  // jsmind目录
  '/jsmind/ai-handler.js',
  '/jsmind/icons.js',
  '/jsmind/mindmap-core.js',
  '/jsmind/mindmap.css',
  '/jsmind/mindmap.html',

  '/jsmind/node-data-structure.js',
  '/jsmind/node-operator.js',
  '/jsmind/plugins/undo_manager.js',
  '/jsmind/themes/modern-minimal.css',
  '/jsmind/tree-operator.js',
  '/jsmind/ViewStateManager.js',

  // jsmind-local目录
  '/jsmind-local/data_example.json',
  '/jsmind-local/jsmind-latest.css',
  '/jsmind-local/jsmind.css',
  '/jsmind-local/jsmind.draggable-node.js',
  '/jsmind-local/jsmind.js',
  '/jsmind-local/jsmind.screenshot.js',



  // local-deps目录
  '/local-deps/av-min.js',
  '/local-deps/bootstrap.bundle.min.js',
  '/local-deps/bootstrap.min.css',
  '/local-deps/dom-to-image.min.js',
  '/local-deps/FileSaver.min.js',
  '/local-deps/font-awesome.min.css',
  '/local-deps/jquery.min.js',
  '/local-deps/jsmind.screenshot.js',
  '/local-deps/markdown-it.min.js',
  '/local-deps/pizzip.min.js',
  '/local-deps/tailwindcss.min.js',
  '/local-deps/jszip.min.js',

  // md2word目录
  '/md2word/default-template.docx',
  '/md2word/md2word.html',

  // res目录
  '/res/add.svg',
  '/res/close.svg',
  '/res/code.svg',

  '/res/detail.svg',
  '/res/download.svg',
  '/res/edit.svg',
  '/res/empty.svg',
  '/res/export.svg',
  '/res/help.svg',
  '/res/import.svg',
  '/res/kuaisu.svg',
  '/res/LOGO.png',
  '/res/LOGO256.ico',
  '/res/LOGO32.ico',
  '/res/MindWord二维码.png',
  '/res/rec-mindmap.gif',
  '/res/rec-docx.gif',
  '/res/redo.svg',
  '/res/screenShot-all.png',
  '/res/screenShot-docx.png',
  '/res/screenShot-editor.png',
  '/res/screenShot-phone.png',
  '/res/screenShot-tags.png',
  '/res/setting.svg',
  '/res/tag.svg',
  '/res/undo.svg',
  '/res/upload.svg',
  '/res/word.svg',
  '/res/上钻.svg',
  '/res/下钻.svg',
  '/res/删除.svg',
  '/res/添加子树.svg',
  '/res/添加子级.svg',
  '/res/添加同级.svg',
  '/res/扩写备注.svg',
  '/res/思维导图.svg',
  '/res/生成初始树.svg',


  // utils目录
  '/utils/html-to-markdown.js'


];

// --- 安装 ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // 分批缓存文件，避免单个文件失败导致整个缓存失败
        const batchSize = 10;
        const batches = [];

        for (let i = 0; i < CORE_FILES.length; i += batchSize) {
          batches.push(CORE_FILES.slice(i, i + batchSize));
        }

        // 逐个批次缓存，记录失败的文件
        return Promise.allSettled(
          batches.map((batch, batchIndex) =>
            cache.addAll(batch).catch(err => {
              console.error(`批次 ${batchIndex + 1} 缓存失败:`, err);
              // 尝试单独缓存批次中的每个文件，找出具体失败文件
              return Promise.allSettled(
                batch.map(file =>
                  cache.add(file).catch(fileErr => {
                    console.error(`文件缓存失败: ${file}`, fileErr);
                    // 对于SVG文件，尝试使用fetch手动缓存
                    if (file.endsWith('.svg')) {
                      return fetch(file).then(res => {
                        if (res.ok) {
                          return cache.put(file, res);
                        }
                        throw new Error(`SVG文件加载失败: ${file}`);
                      }).catch(svgErr => {
                        console.error(`SVG文件手动缓存失败: ${file}`, svgErr);
                        throw fileErr;
                      });
                    }
                    throw fileErr;
                  })
                )
              );
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// --- 激活 ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => k !== CACHE_NAME && caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// --- 修复重定向循环和离线导航问题 ---
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const pathname = url.pathname;

  // 完全忽略LeanCloud API请求，让浏览器直接处理，避免重复请求和缓存问题
  // 检查URL中是否包含LeanCloud相关标识
  if (url.hostname.includes('lc-cn-n1-shared.com') ||
    url.hostname.includes('lcapp.cn') ||
    url.hostname.includes('leancloud.cn') ||
    url.pathname.includes('/1.1/classes/') ||
    url.pathname.includes('/1.1/users/') ||
    url.pathname.includes('/1.1/files/') ||
    (url.hostname.includes('lc-') && url.pathname.includes('/1.1/'))) {
    // 对于LeanCloud API请求，完全忽略，让浏览器直接处理
    console.log('[SW] LeanCloud API请求，完全忽略:', event.request.url);
    return;
  }

  // 修复：正确处理导航请求，支持离线访问
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // 先尝试从网络获取
      fetch(event.request).catch(() => {
        // 网络失败时，从缓存获取对应HTML文档
        // 处理根路径
        if (pathname === '/') {
          return caches.match('/index.html');
        }

        // 处理其他HTML页面
        return caches.match(pathname) || caches.match('/offline.html');
      })
    );
    return;
  }

  // 特别处理CSS文件
  if (pathname.endsWith('.css')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(netRes => {
          if (netRes.ok) {
            const resClone = netRes.clone();
            caches.open(CACHE_NAME).then(c => {
              c.put(event.request, resClone).catch(err => {
                console.error('CSS文件缓存失败:', pathname, err);
              });
            });
          }
          return netRes;
        }).catch(() => {
          // CSS文件离线时使用备用样式
          return new Response(
            '/* 离线模式下的备用样式 */ body { font-family: Arial, sans-serif; }',
            {
              headers: { 'Content-Type': 'text/css' },
              status: 200
            }
          );
        });
      })
    );
    return;
  }

  // 特别处理SVG文件和其他静态资源
  if (pathname.endsWith('.svg') || pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.gif') || pathname.endsWith('.ico')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        console.log('Service Worker检查缓存:', event.request.url, '找到缓存:', !!cached);
        if (cached) {
          console.log('Service Worker返回缓存:', event.request.url);
          return cached;
        }

        // 尝试匹配不带查询参数的URL
        const cleanUrl = event.request.url.split('?')[0];
        return caches.match(cleanUrl).then(cleanCached => {
          if (cleanCached) {
            console.log('Service Worker通过clean URL找到缓存:', cleanUrl);
            return cleanCached;
          }

          return fetch(event.request).then(netRes => {
            console.log('Service Worker网络请求:', event.request.url, '状态:', netRes.status);
            if (netRes.ok) {
              const resClone = netRes.clone();
              caches.open(CACHE_NAME).then(c => {
                c.put(event.request, resClone).then(() => {
                  console.log('Service Worker缓存成功:', event.request.url);
                }).catch(err => {
                  console.error('Service Worker缓存失败:', pathname, err);
                });
              });
            }
            return netRes;
          }).catch(() => {
            console.log('Service Worker网络失败，返回兜底:', event.request.url);
            // 对于静态资源，返回透明1x1像素图片，避免页面出错
            if (pathname.endsWith('.svg')) {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
                {
                  headers: { 'Content-Type': 'image/svg+xml' },
                  status: 200
                }
              );
            }
            return new Response('', { status: 404 });
          });
        });
      })
    );
    return;
  }

  // 修复：处理其他资源请求（包括fetch API请求）
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(netRes => {
        // 修复：先克隆响应，避免body被使用后无法克隆
        const resClone = netRes.clone();

        // 不缓存LeanCloud API请求
        const requestUrl = new URL(event.request.url);
        if (!(requestUrl.hostname.includes('lc-cn-n1-shared.com') ||
          requestUrl.hostname.includes('lcapp.cn') ||
          requestUrl.hostname.includes('leancloud.cn') ||
          requestUrl.pathname.includes('/1.1/classes/') ||
          requestUrl.pathname.includes('/1.1/users/') ||
          requestUrl.pathname.includes('/1.1/files/') ||
          (requestUrl.hostname.includes('lc-') && requestUrl.pathname.includes('/1.1/')))) {
          // 只缓存非LeanCloud API请求
          if (netRes.ok) {
            caches.open(CACHE_NAME).then(c => {
              return c.put(event.request, resClone);
            }).catch(err => {
              console.error('缓存存储失败:', err);
            });
          }
        }
        return netRes;
      }).catch(() => {
        // 网络失败时的统一处理
        console.log('离线模式 - 尝试从缓存获取:', pathname);

        // 对于HTML文件，优先返回缓存的对应文件
        if (pathname.endsWith('.html') || pathname === '/') {
          return caches.match(pathname) || caches.match('/offline.html');
        }

        // 对于JS文件，尝试返回缓存的版本
        if (pathname.endsWith('.js')) {
          return caches.match(event.request).catch(() => {
            return new Response('// 离线模式 - JS文件不可用', {
              status: 200,
              headers: { 'Content-Type': 'application/javascript' }
            });
          });
        }

        // 对于JSON文件，返回空对象
        if (pathname.endsWith('.json')) {
          return new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 其他情况返回通用的离线响应
        return caches.match(event.request).catch(() => {
          return new Response('离线模式 - 内容不可用', { status: 503 });
        });
      });
    })
  );
});