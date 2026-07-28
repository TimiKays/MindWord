import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const FEEDBACK_URL = 'https://timikays.feishu.cn/share/base/form/shrcnCnxRRhU4naUS2s14KbPwph';

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('广告和已退役的公开集成文件不再参与发布', async () => {
  const removedFiles = [
    'leancloud-sync.js',
    'auth-leancloud.html',
    'local-deps/av-min.js',
    'feedback-supabase.html'
  ];

  for (const relativePath of removedFiles) {
    await assert.rejects(access(new URL(`../${relativePath}`, import.meta.url)));
  }

  const index = await read('index.html');
  assert.doesNotMatch(index, /googlesyndication|adsbygoogle|广告位招租/);
});

test('公开页面和当前产品说明不再引用 LeanCloud', async () => {
  const files = [
    'app.html',
    'auth.html',
    'lazy-loader.js',
    'language-switch.js',
    'sw.js',
    'update-version.js',
    'utils/image-storage.js',
    'supabase-config.js',
    'supabase-sync.js',
    'user-supabase.js',
    'timi-cloud-provider.js',
    'NOTICE',
    'privacy.html',
    'humans.txt',
    'SECURITY.md',
    'ai/newai/AIServiceModal.html',
    'supoort/support.html'
  ];

  for (const relativePath of files) {
    const source = await read(relativePath);
    assert.doesNotMatch(source, /LeanCloud|leancloud|av-min|lc-cn-n1-shared\.com|lcapp\.cn/);
  }
});

test('所有公开反馈入口都指向现用飞书表单', async () => {
  const [app, aiModal, support] = await Promise.all([
    read('app.html'),
    read('ai/newai/AIServiceModal.html'),
    read('supoort/support.html')
  ]);

  for (const source of [app, aiModal, support]) {
    assert.match(source, new RegExp(FEEDBACK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(source, /(?:\.\.\/)*feedback\.html/);
  }
});
