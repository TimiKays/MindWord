/**
 * MindWord PWA Service Worker - 简化版
 * 只缓存核心文件，避免路径重复问题
 */

const CACHE_NAME = 'mindword-v11';

// 只缓存最关键的核心文件
const CORE_FILES = [
  '/',
  '/app',
  // 根目录文件（除了.md和.txt文件，按文件名升序排列）
  'ai-modal.js',

  'auth.html',
  'copynew_file.js',
  'documents.js',
  'favicon.ico',
  'index.html',
  'init.js',
  'language-switch.js',
  'lazy-loader.js',
  'leancloud-sync.js',
  'LICENSE.txt',
  'LOGO.ico',
  'manifest.json',
  'mobile-suit.js',
  'monitor-AIset.js',
  'msg-listener-show.js',
  'notification-bridge.js',
  'offline-config.json',
  'styles.css',
  'sw.js',
  'three-iframes.js',
  'user.js',

  // ai目录
  'ai/newai/AIServiceModal.html',
  'ai/newai/platform-configs.json',
  'ai/newai/prompt-templates.json',
  'ai/newai/user-template-manager.html',
  'ai/newai/user-templates.json',

  // changelog目录
  'changelog/changelog.html',
  'changelog/2025-11-21_1.gif',
  'changelog/CHANGELOG.md',

  // converter目录
  'converter/ast-node.js',
  'converter/ast-to-md.js',
  'converter/ast-to-node-tree.js',
  'converter/converter.js',
  'converter/load.js',
  'converter/main.css',
  'converter/md-to-ast.js',
  'converter/node-tree-to-ast.js',
  'converter/sync.js',

  // editor目录
  'editor/editor.html',
  'editor/editor',

  // fonts目录
  'fonts/fontawesome-webfont.ttf',
  'fonts/fontawesome-webfont.woff',
  'fonts/fontawesome-webfont.woff2',

  // i18n目录
  'i18n/i18n-manager.js',
  'i18n/locales.js',

  // jsmind目录
  'jsmind/ai-handler.js',
  'jsmind/icons.js',
  'jsmind/mindmap-core.js',
  'jsmind/mindmap.css',
  'jsmind/mindmap.html',
  'jsmind/mindmap',
  'jsmind/node-data-structure.js',
  'jsmind/node-operator.js',
  'jsmind/plugins/undo_manager.js',
  'jsmind/themes/modern-minimal.css',
  'jsmind/tree-operator.js',
  'jsmind/ViewStateManager.js',

  // jsmind-local目录
  'jsmind-local/data_example.json',
  'jsmind-local/jsmind-latest.css',
  'jsmind-local/jsmind.css',
  'jsmind-local/jsmind.draggable-node.js',
  'jsmind-local/jsmind.js',
  'jsmind-local/jsmind.screenshot.js',



  // local-deps目录
  'local-deps/av-min.js',
  'local-deps/bootstrap.bundle.min.js',
  'local-deps/bootstrap.min.css',
  'local-deps/dom-to-image.min.js',
  'local-deps/FileSaver.min.js',
  'local-deps/font-awesome.min.css',
  'local-deps/jquery.min.js',
  'local-deps/jsmind.screenshot.js',
  'local-deps/markdown-it.min.js',
  'local-deps/pizzip.min.js',
  'local-deps/tailwindcss.min.js',
  'local-deps/jszip.min.js',

  // md2word目录
  'md2word/default-template.docx',
  'md2word/md2word.html',
  'md2word/md2word',

  // res目录
  'res/add.svg',
  'res/close.svg',
  'res/code.svg',
  'res/delete.svg',
  'res/detail.svg',
  'res/download.svg',
  'res/edit.svg',
  'res/empty.svg',
  'res/export.svg',
  'res/help.svg',
  'res/import.svg',
  'res/kuaisu.svg',
  'res/LOGO.png',
  'res/LOGO256.ico',
  'res/LOGO32.ico',
  'res/MindWord二维码.png',
  'res/rec-mindmap.gif',
  'res/rec-docx.gif',
  'res/redo.svg',
  'res/screenShot-all.png',
  'res/screenShot-docx.png',
  'res/screenShot-editor.png',
  'res/screenShot-phone.png',
  'res/screenShot-tags.png',
  'res/setting.svg',
  'res/tag.svg',
  'res/undo.svg',
  'res/upload.svg',
  'res/word.svg',
  'res/上钻.svg',
  'res/下钻.svg',
  'res/删除.svg',
  'res/添加子树.svg',
  'res/添加子级.svg',
  'res/添加同级.svg',
  'res/扩写备注.svg',
  'res/思维导图.svg',
  'res/生成初始树.svg',


  // utils目录
  'utils/html-to-markdown.js'


];

// 安装 SW 并缓存全部核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_FILES))
      .then(() => self.skipWaiting())
  );
});

// 激活 SW，清除旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => k !== CACHE_NAME && caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 统一路径为真实文件路径，例如 /app → /app.html
function normalize(urlPath) {
  let clean = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;

  // 让 / 映射到 index.html
  if (clean === '') return 'index.html';

  // 无后缀但存在对应的 .html 文件
  if (!clean.includes('.') && CORE_FILES.includes(clean + '.html')) {
    return clean + '.html';
  }

  return clean;
}

// fetch 拦截
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const key = normalize(url.pathname);

  // 不在核心列表的不拦截
  if (!CORE_FILES.includes(key)) return;

  const cacheKey = new Request('/' + key);

  event.respondWith(
    caches.match(cacheKey).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
        }
        return networkResponse;
      });
    })
  );
});