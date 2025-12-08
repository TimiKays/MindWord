/**
 * MindWord PWA Service Worker - 简化版
 * 只缓存核心文件，避免路径重复问题
 */

const CACHE_NAME = 'mindword-v13';

// 只缓存最关键的核心文件
const CORE_FILES = [
  // 修复：移除根路径缓存以避免重定向循环
  // '/',

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
  '/leancloud-sync.js',
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
  '/res/delete.svg',
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
      .then(cache => cache.addAll(CORE_FILES))
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

  // 修复：正确处理导航请求，支持离线访问
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // 先尝试从网络获取
      fetch(event.request).catch(() => {
        // 网络失败时，从缓存获取对应HTML文档
        const url = new URL(event.request.url);
        const pathname = url.pathname;

        // 处理根路径
        if (pathname === '/') {
          // 尝试直接匹配index.html缓存
          return caches.match('/index.html').then(match => {
            return match || caches.match('/offline.html');
          });
        }

        // 处理带.html扩展名的路径
        if (pathname.endsWith('.html')) {
          return caches.match(pathname) || caches.match('/offline.html');
        }

        // 处理不带扩展名的路径（尝试添加.html）
        return caches.match(pathname + '.html') || caches.match(pathname) || caches.match('/offline.html');
      })
    );
    return;
  }

  // 修复：处理资源请求
  const url = new URL(event.request.url);

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(netRes => {
        // 修复：先克隆响应，避免body被使用后无法克隆
        const resClone = netRes.clone();

        // 缓存所有成功的GET请求响应
        if (netRes.ok) {
          caches.open(CACHE_NAME).then(c => {
            return c.put(event.request, resClone);
          }).catch(err => {
            console.error('缓存存储失败:', err);
          });
        }
        return netRes;
      }).catch(() => {
        // 网络失败时返回离线页面或错误
        if (event.request.destination === 'document') {
          return caches.match('/offline.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});