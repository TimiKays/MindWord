import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadAccountMode({ search = '', session = {} } = {}) {
  const source = await readFile(new URL('../account-mode.js', import.meta.url), 'utf8');
  const values = new Map(Object.entries(session));
  const mount = {
    dataset: {},
    addEventListener() {},
    querySelector() { return null; }
  };
  const existingStyles = { sheet: {} };
  const window = {
    location: { search, href: `https://mindword.example/app.html${search}` },
    sessionStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    TimiAuth: { init() {} },
    TimiCloud: { init() {} },
    TimiTopBar: { renderAuth() {} },
    TimiTopBarStyles: {}
  };
  const document = {
    readyState: 'complete',
    documentElement: { classList: { add() {}, remove() {} } },
    head: { appendChild() {} },
    addEventListener() {},
    querySelector(selector) {
      return selector.startsWith('link[data-mw-sdk=') ? existingStyles : null;
    },
    getElementById(id) {
      return id === 'mw-unified-account-mount' ? mount : null;
    },
    createElement() {
      return { addEventListener() {}, dataset: {} };
    }
  };
  const context = {
    URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    document,
    Promise,
    setTimeout,
    window
  };

  vm.runInNewContext(source, context, { filename: 'account-mode.js' });
  await window.MW_ACCOUNT_MODE.ready;
  return { mode: window.MW_ACCOUNT_MODE, values };
}

test('正式入口默认使用统一账户', async () => {
  const { mode } = await loadAccountMode();
  assert.equal(mode.isUnified(), true);
  assert.equal(mode.mode, 'unified');
});

test('legacy 参数在当前会话中显式启用旧 Supabase 回退', async () => {
  const { mode, values } = await loadAccountMode({ search: '?account_mode=legacy' });
  assert.equal(mode.isUnified(), false);
  assert.equal(values.get('mw_account_mode_v2'), 'legacy');
});

test('新的 unified 参数可结束旧链路回退会话', async () => {
  const { mode, values } = await loadAccountMode({
    search: '?account_mode=unified',
    session: { mw_account_mode_v2: 'legacy' }
  });
  assert.equal(mode.isUnified(), true);
  assert.equal(values.get('mw_account_mode_v2'), 'unified');
});
