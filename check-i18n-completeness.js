#!/usr/bin/env node

/**
 * MindWord 国际化键完整性检测脚本
 * 检测所有国际化键是否在各语言版本中被正确翻译
 * 
 * 使用方法:
 * node check-i18n-completeness.js
 */

const fs = require('fs');
const path = require('path');

// 项目根目录
const PROJECT_ROOT = __dirname;

// 支持的语言
const SUPPORTED_LANGUAGES = ['zh', 'en', 'es'];

// 需要检查的文件类型和路径
const HTML_FILES = [
  'index.html',
  'app.html',
  'auth.html',
  'jsmind/mindmap.html'
];

const JS_FILES = [
  'i18n/i18n-manager.js',
  'three-iframes.js',
  'documents.js',
  'leancloud-sync.js'
];

/**
 * 从locales.js中提取所有定义的国际化键
 */
function extractDefinedKeys() {
  console.log('正在提取定义的国际化键...');

  const localesPath = path.join(PROJECT_ROOT, 'i18n/locales.js');
  const content = fs.readFileSync(localesPath, 'utf8');

  // 提取i18nLocales对象
  const localesMatch = content.match(/const i18nLocales = ({[\s\S]*});/);
  if (!localesMatch) {
    console.error('无法找到i18nLocales对象');
    process.exit(1);
  }

  try {
    // 使用eval来解析对象（在生产环境中应使用更安全的方法）
    const localesObject = eval(`(${localesMatch[1]})`);
    const allKeys = new Set();

    // 递归提取所有键
    function extractKeys(obj, prefix = '') {
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof obj[key] === 'object' && obj[key] !== null) {
          extractKeys(obj[key], fullKey);
        } else {
          allKeys.add(fullKey);
        }
      }
    }

    // 提取中文(zh)版本的所有键作为基准
    if (localesObject.zh) {
      extractKeys(localesObject.zh);
    }

    console.log(`找到 ${allKeys.size} 个定义的国际化键`);
    return { keys: Array.from(allKeys), localesObject };
  } catch (error) {
    console.error('解析locales.js失败:', error);
    process.exit(1);
  }
}

/**
 * 从HTML文件中提取使用的国际化键
 */
function extractUsedKeysFromHTML(filePath) {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf8');
  const keys = new Set();

  // 匹配data-i18n属性
  const dataI18nRegex = /data-i18n="([^"]+)"/g;
  let match;
  while ((match = dataI18nRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  // 匹配data-i18n-placeholder属性
  const placeholderRegex = /data-i18n-placeholder="([^"]+)"/g;
  while ((match = placeholderRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  // 匹配data-i18n-title属性
  const titleRegex = /data-i18n-title="([^"]+)"/g;
  while ((match = titleRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  // 匹配data-i18n-value属性
  const valueRegex = /data-i18n-value="([^"]+)"/g;
  while ((match = valueRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  return keys;
}

/**
 * 从JS文件中提取使用的国际化键
 */
function extractUsedKeysFromJS(filePath) {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf8');
  const keys = new Set();

  // 匹配i18n.t()调用
  const tFunctionRegex = /i18n\.t\(['"`]([^'"`]+)['"`]\)/g;
  let match;
  while ((match = tFunctionRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  // 匹配window.i18n.t()调用
  const windowTFunctionRegex = /window\.i18n\.t\(['"`]([^'"`]+)['"`]\)/g;
  while ((match = windowTFunctionRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  return keys;
}

/**
 * 提取所有使用的国际化键
 */
function extractUsedKeys() {
  console.log('正在提取使用的国际化键...');

  const allUsedKeys = new Set();

  // 从HTML文件中提取
  HTML_FILES.forEach(file => {
    try {
      const keys = extractUsedKeysFromHTML(file);
      console.log(`从 ${file} 中提取到 ${keys.size} 个键`);
      keys.forEach(key => allUsedKeys.add(key));
    } catch (error) {
      console.warn(`无法处理文件 ${file}:`, error.message);
    }
  });

  // 从JS文件中提取
  JS_FILES.forEach(file => {
    try {
      const keys = extractUsedKeysFromJS(file);
      console.log(`从 ${file} 中提取到 ${keys.size} 个键`);
      keys.forEach(key => allUsedKeys.add(key));
    } catch (error) {
      console.warn(`无法处理文件 ${file}:`, error.message);
    }
  });

  console.log(`总共找到 ${allUsedKeys.size} 个使用的国际化键`);
  return Array.from(allUsedKeys);
}

/**
 * 检查翻译完整性
 */
function checkTranslationCompleteness(definedKeys, usedKeys, localesObject) {
  console.log('\n正在检查翻译完整性...\n');

  let hasErrors = false;

  // 检查使用的键是否都有定义
  const undefinedKeys = usedKeys.filter(key => !definedKeys.includes(key));
  if (undefinedKeys.length > 0) {
    console.error('❌ 发现未定义的国际化键:');
    undefinedKeys.forEach(key => {
      console.error(`  - ${key}`);
    });
    hasErrors = true;
  } else {
    console.log('✅ 所有使用的键都已定义');
  }

  // 检查各语言的翻译完整性
  SUPPORTED_LANGUAGES.forEach(lang => {
    if (!localesObject[lang]) {
      console.error(`❌ 语言 ${lang} 的配置不存在`);
      hasErrors = true;
      return;
    }

    const missingTranslations = [];

    definedKeys.forEach(key => {
      const keys = key.split('.');
      let value = localesObject[lang];

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          missingTranslations.push(key);
          break;
        }
      }
    });

    if (missingTranslations.length > 0) {
      console.error(`❌ 语言 ${lang} 缺少以下翻译:`);
      missingTranslations.forEach(key => {
        console.error(`  - ${key}`);
      });
      hasErrors = true;
    } else {
      console.log(`✅ 语言 ${lang} 的翻译完整`);
    }
  });

  // 检查是否有空的翻译
  SUPPORTED_LANGUAGES.forEach(lang => {
    if (!localesObject[lang]) return;

    const emptyTranslations = [];

    definedKeys.forEach(key => {
      const keys = key.split('.');
      let value = localesObject[lang];

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return;
        }
      }

      if (value === '' || value === null || value === undefined) {
        emptyTranslations.push(key);
      }
    });

    if (emptyTranslations.length > 0) {
      console.warn(`⚠️  语言 ${lang} 以下翻译为空:`);
      emptyTranslations.forEach(key => {
        console.warn(`  - ${key}`);
      });
    }
  });

  return !hasErrors;
}

/**
 * 生成报告
 */
function generateReport(definedKeys, usedKeys, localesObject) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalDefined: definedKeys.length,
      totalUsed: usedKeys.length,
      supportedLanguages: SUPPORTED_LANGUAGES
    },
    languages: {}
  };

  // 为每种语言生成统计信息
  SUPPORTED_LANGUAGES.forEach(lang => {
    if (!localesObject[lang]) {
      report.languages[lang] = {
        status: 'missing',
        translatedCount: 0,
        missingKeys: definedKeys
      };
      return;
    }

    const translatedKeys = [];
    const missingKeys = [];
    const emptyKeys = [];

    definedKeys.forEach(key => {
      const keys = key.split('.');
      let value = localesObject[lang];

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          missingKeys.push(key);
          return;
        }
      }

      if (value === '' || value === null || value === undefined) {
        emptyKeys.push(key);
      } else {
        translatedKeys.push(key);
      }
    });

    report.languages[lang] = {
      status: missingKeys.length === 0 ? 'complete' : 'incomplete',
      translatedCount: translatedKeys.length,
      missingCount: missingKeys.length,
      emptyCount: emptyKeys.length,
      missingKeys: missingKeys,
      emptyKeys: emptyKeys
    };
  });

  // 保存报告
  const reportPath = path.join(PROJECT_ROOT, 'i18n-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 详细报告已保存到: ${reportPath}`);
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 MindWord 国际化键完整性检测\n');

  // 提取定义的键
  const { keys: definedKeys, localesObject } = extractDefinedKeys();

  // 提取使用的键
  const usedKeys = extractUsedKeys();

  // 检查翻译完整性
  const isComplete = checkTranslationCompleteness(definedKeys, usedKeys, localesObject);

  // 生成报告
  generateReport(definedKeys, usedKeys, localesObject);

  // 输出结果
  console.log('\n📋 检测摘要:');
  console.log(`  - 定义的键总数: ${definedKeys.length}`);
  console.log(`  - 使用的键总数: ${usedKeys.length}`);
  console.log(`  - 支持的语言: ${SUPPORTED_LANGUAGES.join(', ')}`);

  if (isComplete) {
    console.log('\n✅ 国际化翻译完整性检测通过!');
    process.exit(0);
  } else {
    console.log('\n❌ 发现国际化问题，请查看上述错误信息并修复');
    process.exit(1);
  }
}

// 运行主函数
main();