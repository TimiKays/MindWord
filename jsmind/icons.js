/* jsmind/icons.js — 分组的图标模块，兼容 module / 非 module 使用 */
(function (global) {
  // 分组定义：仅保留指定四组（中文组名），每组 7 个表情
  const groupedIcons = {
    "状态": [
      { emoji: '✅', name: '完成' },
      { emoji: '❌', name: '失败' },
      { emoji: '⚠️', name: '警告' },
      { emoji: '❗', name: '重要' },
      { emoji: '🔒', name: '锁定' },
      { emoji: '🔓', name: '解锁' },
      { emoji: '❓', name: '疑问' }
    ],
    "进度": [
      { emoji: '🔴', name: '未开始' },
      { emoji: '🟡', name: '进行中' },
      { emoji: '🟢', name: '已开始' },
      { emoji: '⏳', name: '等待中' },
      { emoji: '✅', name: '已完成' },
      { emoji: '🔁', name: '循环' },
      { emoji: '🚀', name: '推进' }
    ],
    "数字": [
      { emoji: '1️⃣', name: '一' },
      { emoji: '2️⃣', name: '二' },
      { emoji: '3️⃣', name: '三' },
      { emoji: '4️⃣', name: '四' },
      { emoji: '5️⃣', name: '五' },
      { emoji: '6️⃣', name: '六' },
      { emoji: '7️⃣', name: '七' }
    ],
    "标签": [
      { emoji: '🏷️', name: '标签' },
      { emoji: '🔖', name: '书签' },
      { emoji: '📌', name: '固定' },
      { emoji: '🗂️', name: '分类' },
      { emoji: '🎯', name: '目标' },
      { emoji: '💡', name: '想法' },
      { emoji: '⭐', name: '星标' }
    ]
  };

  // 将分组扁平化为数组（去重保序）
  function flattenGroups(groups) {
    const seen = new Set();
    const flat = [];
    Object.keys(groups).forEach(groupKey => {
      groups[groupKey].forEach(item => {
        const key = item.emoji + '|' + (item.name || '');
        if (!seen.has(key)) {
          seen.add(key);
          flat.push(item);
        }
      });
    });
    return flat;
  }

  // 将图标写到 window.availableIcons，返回扁平数组
  function exposeIcons(arr) {
    try { global.availableIcons = arr; } catch (e) { /* ignore */ }
    return arr;
  }

  // 直接使用内置图标集合（不再尝试从本地 json 加载）
  function loadIconsFromLocalJson(path = '../res/icons.json') {
    // 保持返回 Promise，以兼容原有调用方式
    return Promise.resolve(flattenGroups(groupedIcons));
  }

  // 初始化：确保 window.availableIcons 存在并返回分组信息
  async function initIconModule(options = {}) {
    const path = options.jsonPath || '../res/icons.json';
    let flat = [];
    try {
      if (global.availableIcons && Array.isArray(global.availableIcons) && global.availableIcons.length) {
        flat = global.availableIcons;
      } else {
        flat = await loadIconsFromLocalJson(path);
      }
    } catch (e) {
      flat = flattenGroups(groupedIcons);
    }
    exposeIcons(flat);
    // 提供分组访问 API
    try { global.MWIcons = global.MWIcons || {}; } catch (e) { global.MWIcons = {}; }
    try { global.MWIcons.getGroups = function () { return groupedIcons; }; } catch (e) { /* ignore */ }
    try { global.MWIcons.get = function () { return global.availableIcons || []; }; } catch (e) { /* ignore */ }

    // 兼容旧页面：若存在 initIconPicker 函数则调用
    try { if (typeof global.initIconPicker === 'function') global.initIconPicker(); } catch (e) { console.warn('initIconPicker error', e); }
    return { groups: groupedIcons, flat: flat };
  }

  // 暴露接口
  try { global.MWIcons = global.MWIcons || {}; } catch (e) { global.MWIcons = {}; }
  global.MWIcons.init = initIconModule;
  global.MWIcons.get = function () { return global.availableIcons || flattenGroups(groupedIcons); };
  global.MWIcons.getGroups = function () { return groupedIcons; };

  // 自动初始化（除非 documentElement.dataset.mwIconsNoAutoInit === 'true'）
  try {
    const autoinit = !(document.documentElement.dataset && document.documentElement.dataset.mwIconsNoAutoInit === 'true');
    if (autoinit) {
      setTimeout(() => { initIconModule(); }, 80);
    }
  } catch (e) { /* ignore */ }

})(window);