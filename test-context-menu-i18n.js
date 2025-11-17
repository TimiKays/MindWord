/**
 * 测试右键菜单国际化功能
 */
function testContextMenuI18n() {
  console.log('=== 右键菜单国际化测试开始 ===');
  
  // 等待页面完全加载
  setTimeout(() => {
    // 检查i18nManager是否可用
    if (!window.i18nManager) {
      console.error('❌ i18nManager 未加载');
      return;
    }
    
    console.log('✅ i18nManager 已加载');
    console.log('当前语言:', window.i18nManager.getCurrentLanguage());
    
    // 检查右键菜单是否存在
    const contextMenu = document.getElementById('nodeContextMenu');
    if (!contextMenu) {
      console.error('❌ 右键菜单元素未找到');
      return;
    }
    
    console.log('✅ 右键菜单元素已找到');
    
    // 检查菜单项的data-i18n属性
    const menuItems = contextMenu.querySelectorAll('[data-i18n]');
    console.log(`找到 ${menuItems.length} 个需要翻译的菜单项`);
    
    menuItems.forEach((item, index) => {
      const key = item.getAttribute('data-i18n');
      const currentText = item.textContent;
      console.log(`菜单项 ${index + 1}: key="${key}", 当前文本="${currentText}"`);
      
      // 检查是否有对应的翻译
      const translation = window.i18nManager.t(key);
      if (translation && translation !== key) {
        console.log(`  ✅ 翻译存在: "${translation}"`);
      } else {
        console.log(`  ❌ 翻译缺失`);
      }
    });
    
    // 测试切换语言
    console.log('\n=== 测试语言切换 ===');
    const currentLang = window.i18nManager.getCurrentLanguage();
    const newLang = currentLang === 'zh' ? 'en' : 'zh';
    
    console.log(`从 ${currentLang} 切换到 ${newLang}`);
    window.i18nManager.setLanguage(newLang);
    
    // 延迟检查切换后的效果
    setTimeout(() => {
      console.log('\n切换后的菜单项文本:');
      menuItems.forEach((item, index) => {
        const key = item.getAttribute('data-i18n');
        const newText = item.textContent;
        console.log(`菜单项 ${index + 1}: "${newText}"`);
      });
      
      // 切换回原语言
      window.i18nManager.setLanguage(currentLang);
      console.log('\n=== 测试完成 ===');
    }, 500);
    
  }, 1000);
}

// 执行测试
testContextMenuI18n();