import { test, expect } from '@playwright/test';

/**
 * 语言切换功能测试用例
 * 验证应用能够正确切换语言并显示对应的内容
 */
test.describe('语言切换功能测试', () => {
  
  test('切换语言为中文并验证思维导图显示', async ({ page }) => {
    // 前置条件：默认状态，无需特殊准备
    
    // 步骤1: 打开应用页面
    await page.goto('/app.html');
    
    // 步骤2: 切换语言为中文
    const langSelector = 'select[id="lang-switch"]'; // 语言选择器
    await page.selectOption(langSelector, 'zh');
    
    // 步骤3: 验证能看到思维导图相关中文内容
    // 等待语言切换生效，确保页面内容已更新
    await page.waitForTimeout(1000); // 给语言切换一点时间生效
    
    // 验证思维导图面板标题文本可见（使用更精确的选择器）
    const mindmapPanelHeader = page.locator('#mindmap-panel .panel-header span[data-i18n="app.mindmap"]');
    await expect(mindmapPanelHeader).toBeVisible({ timeout: 5000 });
    await expect(mindmapPanelHeader).toHaveText('思维导图');
    
    // 额外验证：确保语言切换确实生效
    // 检查页面标题或其他关键元素是否显示中文
    const pageTitle = await page.title();
    console.log(`页面标题: ${pageTitle}`);
    
    // 验证语言选择器的值确实是中文
    const selectedLang = await page.locator(langSelector).inputValue();
    expect(selectedLang).toBe('zh');
    
    console.log('✅ 语言切换测试通过 - 成功切换到中文并显示思维导图');
  });
  
  test('验证语言切换的完整功能', async ({ page }) => {
    await page.goto('/app.html');
    
    // 等待页面加载完成
    await page.waitForLoadState('networkidle');
    
    // 测试切换到英文
    const langSelector = 'select[id="lang-switch"]';
    await page.selectOption(langSelector, 'en');
    await page.waitForTimeout(1000);
    
    // 验证英文内容（检查具体的英文文本）
    const mindmapPanelHeaderEn = page.locator('#mindmap-panel .panel-header span[data-i18n="app.mindmap"]');
    await expect(mindmapPanelHeaderEn).toBeVisible();
    await expect(mindmapPanelHeaderEn).toHaveText('MindMap');
    
    // 切换回中文
    await page.selectOption(langSelector, 'zh');
    await page.waitForTimeout(1000);
    
    // 验证中文元素存在
    const mindmapPanelHeaderZh = page.locator('#mindmap-panel .panel-header span[data-i18n="app.mindmap"]');
    await expect(mindmapPanelHeaderZh).toBeVisible();
    await expect(mindmapPanelHeaderZh).toHaveText('思维导图');
    
    console.log('✅ 语言切换完整功能测试通过');
  });
});