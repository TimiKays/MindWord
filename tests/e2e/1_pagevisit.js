/*
页面访问测试
1、打开index.html；
2、点击语言切换下拉，id="lang-switch"，切换到中文；
3、能看到“立即体验”按钮，点击“立即体验”按钮；
4、等待跳转到app.html；
5、能看到textarea id="editor" 的值包含“# 欢迎使用 MindWord”；
*/

import { test, expect } from '@playwright/test';

test.describe('页面访问测试', () => {
  test('完整页面访问流程', async ({ page }) => {
    // 1、打开index.html
    await page.goto('/index.html');

    // 2、点击语言切换下拉，id="lang-switch"，切换到中文
    // 使用selectOption方法直接选择下拉框的值
    await page.selectOption('#lang-switch', 'zh');

    // 3、能看到"立即体验"链接，点击"立即体验"链接
    // 使用getByRole获取导航栏中的立即体验链接
    const startButton = page.getByRole('link', { name: '立即体验' }).first();
    await expect(startButton).toBeVisible();
    await startButton.click();

    // 4、等待跳转到app.html
    await page.waitForURL('**/app.html');

    // 等待iframe加载完成
  await page.waitForSelector('#iframe-editor');
  
  // 切换到iframe上下文，定位编辑器
  const editorFrame = page.frameLocator('#iframe-editor');
  
  // 验证编辑器内容是否包含欢迎文本
  const editor = editorFrame.locator('#editor');
  
  // 等待编辑器可见并检查内容
  await expect(editor).toBeVisible({ timeout: 3000 });
  
  // 检查实际内容（而不是placeholder），因为localStorage为空时应该加载placeholder作为内容
  await expect(editor).toHaveValue(/欢迎使用 MindWord/);
  });
});