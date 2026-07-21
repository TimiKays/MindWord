import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('密码重置邮件始终回到正式域名的重置页', async () => {
  const authPage = await readFile(new URL('../auth.html', import.meta.url), 'utf8');

  assert.match(
    authPage,
    /const PASSWORD_RESET_REDIRECT_URL = 'https:\/\/mindword\.timikays\.us\.kg\/reset-password';/
  );
  assert.match(
    authPage,
    /resetPasswordForEmail\(email, \{\s*redirectTo: PASSWORD_RESET_REDIRECT_URL\s*\}\)/
  );
});
