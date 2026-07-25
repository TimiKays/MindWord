import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function createElement() {
  const listeners = new Map();
  return {
    style: {},
    textContent: '',
    parentNode: null,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    getListener(type) {
      return listeners.get(type);
    },
    cloneNode() {
      return createElement();
    },
    remove() {}
  };
}

test('统一账户已登录时，退出入口会绑定并打开数据保留确认框', async () => {
  const source = await readFile(new URL('../user-supabase.js', import.meta.url), 'utf8');
  const authUser = createElement();
  const authUsername = createElement();
  const logoutDialog = createElement();
  const logoutSave = createElement();
  const logoutNoSave = createElement();
  const logoutCancel = createElement();
  const logoutParent = {
    replaceChild(next) {
      currentLogoutButton = next;
      next.parentNode = logoutParent;
    }
  };
  let currentLogoutButton = createElement();
  currentLogoutButton.parentNode = logoutParent;
  let dialogInserted = false;
  let logoutCalls = 0;

  const document = {
    readyState: 'complete',
    referrer: '',
    body: {
      insertAdjacentHTML() {
        dialogInserted = true;
      }
    },
    addEventListener() {},
    querySelector() { return null; },
    getElementById(id) {
      return {
        'auth-user': authUser,
        'auth-username': authUsername,
        'auth-logout-menu': currentLogoutButton,
        'logout-dialog': logoutDialog,
        'logout-save': logoutSave,
        'logout-nosave': logoutNoSave,
        'logout-cancel': logoutCancel
      }[id] || null;
    }
  };
  const window = {
    MW_ACCOUNT_MODE: {
      isUnified: () => true,
      ready: Promise.resolve(true)
    },
    MW_TIMI_CLOUD: {
      getCurrentUser: async () => ({ id: 'member-1', email: 'member@example.com' })
    },
    TimiAuth: {
      getCurrentUser: () => ({ id: 'member-1', email: 'member@example.com' }),
      logout: async () => { logoutCalls += 1; },
      onAuthChange() {}
    }
  };

  vm.runInNewContext(source, {
    Promise,
    console: { log() {}, warn() {}, error() {} },
    document,
    setTimeout() { return 0; },
    window
  }, { filename: 'user-supabase.js' });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(authUser.style.display, 'inline-flex');
  assert.equal(authUsername.textContent, 'member@example.com');
  const onLogoutClick = currentLogoutButton.getListener('click');
  assert.equal(typeof onLogoutClick, 'function');

  await onLogoutClick();
  assert.equal(dialogInserted, true);
  assert.equal(logoutCalls, 0);
});
