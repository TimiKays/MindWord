import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function getRedirect(mode, search = '') {
  const source = await readFile(new URL('../unified-auth-redirect.js', import.meta.url), 'utf8');
  let redirectedTo = '';
  const href = `https://mindword.timikays.us.kg/auth${search}`;
  const location = {
    href,
    search,
    replace(url) { redirectedTo = url; }
  };
  const context = {
    URL,
    URLSearchParams,
    document: { documentElement: { dataset: { mwLegacyAuthRedirect: mode } } },
    window: { location }
  };

  vm.runInNewContext(source, context, { filename: 'unified-auth-redirect.js' });
  return new URL(redirectedTo);
}

test('旧登录入口统一跳转，并保留 MindWord 内部返回地址', async () => {
  const defaultTarget = await getRedirect('auth');
  assert.equal(defaultTarget.origin, 'https://timikays.us.kg');
  assert.equal(defaultTarget.pathname, '/auth.html');
  assert.equal(defaultTarget.searchParams.get('redirect'), 'https://mindword.timikays.us.kg/app.html');

  const registerTarget = await getRedirect(
    'auth',
    '?action=register&redirect=https%3A%2F%2Fmindword.timikays.us.kg%2Fapp.html%3Ffrom%3Dlegacy'
  );
  assert.equal(registerTarget.searchParams.get('action'), 'register');
  assert.equal(registerTarget.searchParams.get('redirect'), 'https://mindword.timikays.us.kg/app.html?from=legacy');
});

test('旧认证入口不会接受外部返回地址', async () => {
  const target = await getRedirect('auth', '?redirect=https%3A%2F%2Fevil.example%2F');
  assert.equal(target.searchParams.get('redirect'), 'https://mindword.timikays.us.kg/app.html');
});

test('旧重置页和邮件回调统一交给新密码重置页', async () => {
  const resetTarget = await getRedirect('reset');
  assert.equal(resetTarget.origin, 'https://timikays.us.kg');
  assert.equal(resetTarget.pathname, '/reset-password.html');
  assert.equal(resetTarget.searchParams.get('redirect'), 'https://mindword.timikays.us.kg/app.html');
});

test('旧页面在加载 Supabase 前先跳到统一账号中心', async () => {
  const [auth, reset, callback, app, safety, sitemap] = await Promise.all([
    readFile(new URL('../auth.html', import.meta.url), 'utf8'),
    readFile(new URL('../reset-password.html', import.meta.url), 'utf8'),
    readFile(new URL('../auth-callback.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.html', import.meta.url), 'utf8'),
    readFile(new URL('../data-safety.js', import.meta.url), 'utf8'),
    readFile(new URL('../sitemap.xml', import.meta.url), 'utf8')
  ]);

  for (const page of [auth, reset, callback]) {
    assert.match(page, /name="robots" content="noindex, nofollow"/);
    assert.match(page, /src="unified-auth-redirect\.js/);
  }
  assert.ok(auth.indexOf('unified-auth-redirect.js') < auth.indexOf('supabase-config.js'));
  assert.ok(reset.indexOf('unified-auth-redirect.js') < reset.indexOf('supabase-config.js'));
  assert.ok(callback.indexOf('unified-auth-redirect.js') < callback.indexOf('supabase-config.js'));
  assert.match(app, /href="https:\/\/timikays\.us\.kg\/auth\.html\?redirect=/);
  assert.match(safety, /https:\/\/timikays\.us\.kg\/auth\.html\?redirect=/);
  assert.doesNotMatch(sitemap, /mindword\.timikays\.us\.kg\/auth\.html/);
});
