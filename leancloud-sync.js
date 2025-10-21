/**
 * LeanCloud Data 同步（中文模式）
 * 仅在语言为中文时启用 UI；提供：一键同步（智能分析）、清空云数据
 * 改进：支持文件大小检查（单图200KB，总量10M），分类型时间戳记录
 * 字段：docs(json), aiConfig(json), promptTemplates(json), 
 *       docUpdatedAt(number), configUpdatedAt(number), templateUpdatedAt(number)
 */
(function () {
  const LANG_KEY = 'mw_lang';
  const CLASS_NAME = 'MWData';
  let cachedCloudRaw = null;   // 缓存第一次 downloadCloud() 的原生对象

  // 文件大小限制
  const MAX_IMAGE_SIZE = 200 * 1024; // 200KB
  const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10M

  function getLang() {
    try { return localStorage.getItem(LANG_KEY) || 'zh'; } catch (_) { return 'zh'; }
  }

  // 新的合并算法：将云端数据合并到本地

  function isLoggedIn() {
    try { return !!(window.AV && AV.User && AV.User.current()); } catch (_) { return false; }
  }

  function getLocalDocs() { try { return (typeof mw_loadDocs === 'function') ? mw_loadDocs() : []; } catch (_) { return []; } }
  function saveLocalDocs(docs) { try { return (typeof mw_saveDocs === 'function') ? mw_saveDocs(docs) : null; } catch (_) { return null; } }

  // 获取AI配置和提示词模板
  function getLocalAIConfig() {
    try {
      const configStr = localStorage.getItem('allAIPlatformConfigs');
      return configStr ? JSON.parse(configStr) : {};
    } catch (_) {
      return {};
    }
  }

  function getLocalPromptTemplates() {
    try {
      const templatesStr = localStorage.getItem('promptTemplates');
      return templatesStr ? JSON.parse(templatesStr) : [];
    } catch (_) {
      return [];
    }
  }

  // 保存AI配置和提示词模板
  function saveLocalAIConfig(config) {
    try {
      localStorage.setItem('allAIPlatformConfigs', JSON.stringify(config));
      localStorage.setItem('allAIPlatformConfigs_last_modified', Date.now().toString());
      return true;
    } catch (_) {
      return false;
    }
  }

  function saveLocalPromptTemplates(templates) {
    try {
      localStorage.setItem('promptTemplates', JSON.stringify(templates));
      localStorage.setItem('promptTemplates_last_modified', Date.now().toString());
      return true;
    } catch (_) {
      return false;
    }
  }

  // 直接读现成的 hash 与 last_modified，不再自己算
  function getDataHashAndTime(_data, storageKey) {
    const hash = localStorage.getItem(storageKey + '_hash') || '';
    const lastModified = parseInt(localStorage.getItem(storageKey + '_last_modified') || '0');
    return { hash, lastModified };
  }

  // 文件大小检查函数
  function checkFileSize(docs) {
    let totalSize = 0;
    const errors = [];

    for (const doc of (docs || [])) {
      if (!doc) continue;

      // 计算文档文本内容大小（UTF-8编码）
      if (doc.md) {
        const contentSize = new Blob([doc.md]).size;
        totalSize += contentSize;
      }

      // 计算标题大小
      if (doc.name) {
        const titleSize = new Blob([doc.name]).size;
        totalSize += titleSize;
      }

      // 计算备注大小
      if (doc.note) {
        const noteSize = new Blob([doc.note]).size;
        totalSize += noteSize;
      }

      // 检查文档中的图片
      if (doc.md) {
        const imgMatches = doc.md.match(/data:image\/[^;]+;base64,[^"']+/g) || [];
        for (const imgData of imgMatches) {
          const base64Data = imgData.split(',')[1];
          const imgSize = Math.ceil(base64Data.length * 0.75); // base64解码后的大小

          if (imgSize > MAX_IMAGE_SIZE) {
            errors.push(`文档"${doc.name || doc.id}"中的图片超过200KB限制`);
          }
          totalSize += imgSize;
        }
      }

      // 检查备注中的图片
      if (doc.note) {
        const noteImgMatches = doc.note.match(/data:image\/[^;]+;base64,[^"']+/g) || [];
        for (const imgData of noteImgMatches) {
          const base64Data = imgData.split(',')[1];
          const imgSize = Math.ceil(base64Data.length * 0.75);

          if (imgSize > MAX_IMAGE_SIZE) {
            errors.push(`文档"${doc.title || doc.id}"备注中的图片超过200KB限制`);
          }
          totalSize += imgSize;
        }
      }
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      errors.push(`总文件大小超过10M限制（当前${Math.ceil(totalSize / 1024 / 1024)}M）`);
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      totalSize: totalSize
    };
  }

  // 获取文档的时间戳映射表
  function getDocTimestamps(docs) {
    const timestamps = {};
    for (const doc of (docs || [])) {
      if (doc && doc.id) {
        // 对于已删除的文档，使用deletedAt作为时间戳，确保同步逻辑正确
        timestamps[doc.id] = Number(doc.updatedAt || doc.deletedAt || 0);
      }
    }
    return timestamps;
  }

  // ============= 新同步核心：同结构快照 + 三向合并 =============

  // 把云端原始 doc 转成本地格式，并补全缺失字段
  function normalizeCloudDoc(cDoc) {
    return {
      id: cDoc.id,
      name: cDoc.name || '',
      md: cDoc.md || '',
      updatedAt: Number(cDoc.updatedAt || 0),
      deletedAt: cDoc.deletedAt ? Number(cDoc.deletedAt) : undefined
    };
  }

  // 拉取并组装成与 localFullData 完全同构的对象
  async function fetchCloudFullData() {
    // 优先用缓存，没有再拉
    const cloudRaw = cachedCloudRaw || await downloadCloud();
    if (!cachedCloudRaw) cachedCloudRaw = cloudRaw;
    return {
      docs: (cloudRaw.docs || []).map(normalizeCloudDoc),
      aiConfig: cloudRaw.aiConfig || {},
      aiConfigHash: cloudRaw.aiConfigHash,                // 直接取云端存的哈希
      aiConfigLastModified: Number(cloudRaw.configUpdatedAt || 0),
      promptTemplates: cloudRaw.promptTemplates || [],
      promptTemplatesHash: cloudRaw.promptTemplatesHash,    // 直接取云端存的哈希
      promptTemplatesLastModified: Number(cloudRaw.templateUpdatedAt || 0),
      lastSyncAt: 0                                         // 云端无此字段
    };
  }

  // 三向合并：本地 + 云端 → 目标结构
  function mergeToTarget(local, cloud) {
    const target = {
      docs: [],
      aiConfig: {},
      promptTemplates: [],
      aiConfigHash: undefined,
      aiConfigLastModified: 0,
      promptTemplatesHash: undefined,
      promptTemplatesLastModified: 0,
      lastSyncAt: Date.now()
    };

    // 1. 文档数组：按 ID 三向合并（跳过已删除，哈希相同取云端，不同按时间戳）
    const hashDoc = d => {
      const str = (d.name || '') + '\n' + (d.md || '');
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = (h << 5) + h + str.charCodeAt(i);
      return h >>> 0;          // 转成正 32 位整数
    };

    const localDocMap = new Map(local.docs.map(d => [d.id, d]));
    const cloudDocMap = new Map(cloud.docs.map(d => [d.id, d]));
    // 只排除云端已删除的 id；本地已删除仍要参与合并，以便把删除同步到云端
    const aliveIds = new Set([
      ...local.docs.map(d => d.id),                       // 本地全部保留
      ...cloud.docs.filter(d => !d.deletedAt).map(d => d.id) // 云端只留未删除
    ]);
    const allIds = aliveIds;

    for (const id of allIds) {
      const ld = localDocMap.get(id);
      const cd = cloudDocMap.get(id);

      if (!ld && cd) {           // 仅云端有
        target.docs.push(cd);
      } else if (ld && !cd) {    // 仅本地有
        target.docs.push(ld);
      } else {                   // 两边都有
        const hashL = hashDoc(ld);
        const hashC = hashDoc(cd);
        if (hashL === hashC) {   // 内容相同，用云端
          target.docs.push(cd);
        } else {                 // 内容不同，按时间戳决胜
          target.docs.push(Number(ld.updatedAt) >= Number(cd.updatedAt) ? ld : cd);
        }
      }
    }

    // 2. AI 配置：三向合并（哈希相同用云端，不同谁新用谁）
    if (!local.aiConfigLastModified && cloud.aiConfigLastModified) {
      target.aiConfig = cloud.aiConfig;
      target.aiConfigHash = cloud.aiConfigHash;
      target.aiConfigLastModified = cloud.aiConfigLastModified;
    } else if (local.aiConfigLastModified && !cloud.aiConfigLastModified) {
      target.aiConfig = local.aiConfig;
      target.aiConfigHash = local.aiConfigHash;
      target.aiConfigLastModified = local.aiConfigLastModified;
    } else if (local.aiConfigHash === cloud.aiConfigHash) {
      target.aiConfig = cloud.aiConfig;
      target.aiConfigHash = cloud.aiConfigHash;
      target.aiConfigLastModified = cloud.aiConfigLastModified;
    } else if (local.aiConfigLastModified >= cloud.aiConfigLastModified) {
      target.aiConfig = local.aiConfig;
      target.aiConfigHash = local.aiConfigHash;
      target.aiConfigLastModified = local.aiConfigLastModified;
    } else {
      target.aiConfig = cloud.aiConfig;
      target.aiConfigHash = cloud.aiConfigHash;
      target.aiConfigLastModified = cloud.aiConfigLastModified;
    }

    // 3. 提示词模板：三向合并（哈希相同用云端，不同谁新用谁）
    if (!local.promptTemplatesLastModified && cloud.promptTemplatesLastModified) {
      target.promptTemplates = cloud.promptTemplates;
      target.promptTemplatesHash = cloud.promptTemplatesHash;
      target.promptTemplatesLastModified = cloud.promptTemplatesLastModified;
    } else if (local.promptTemplatesLastModified && !cloud.promptTemplatesLastModified) {
      target.promptTemplates = local.promptTemplates;
      target.promptTemplatesHash = local.promptTemplatesHash;
      target.promptTemplatesLastModified = local.promptTemplatesLastModified;
    } else if (local.promptTemplatesHash === cloud.promptTemplatesHash) {
      target.promptTemplates = cloud.promptTemplates;
      target.promptTemplatesHash = cloud.promptTemplatesHash;
      target.promptTemplatesLastModified = cloud.promptTemplatesLastModified;
    } else if (local.promptTemplatesLastModified >= cloud.promptTemplatesLastModified) {
      target.promptTemplates = local.promptTemplates;
      target.promptTemplatesHash = local.promptTemplatesHash;
      target.promptTemplatesLastModified = local.promptTemplatesLastModified;
    } else {
      target.promptTemplates = cloud.promptTemplates;
      target.promptTemplatesHash = cloud.promptTemplatesHash;
      target.promptTemplatesLastModified = cloud.promptTemplatesLastModified;
    }

    console.log('合并后的目标结构:', target);
    return target;
  }

  // 落地：云端
  async function applyTargetToCloud(target, cloudFullData) {
    const user = AV.User.current();
    if (!user) throw new Error('未登录');

    // 0. 先补回云端已删除记录（本地可能已彻底剔除），得到完整目标
    const targetIds = new Set((target.docs || []).map(d => d.id));
    const mergedDocs = [...(target.docs || [])];
    for (const cd of (cloudFullData ? cloudFullData.docs : [])) {
      if (!targetIds.has(cd.id) && cd.deletedAt) {
        mergedDocs.push(cd);   // 云端独有且已标记删除
      }
    }


    // 1. 用补回后的完整目标与云端对比，若完全一致直接跳过
    if (cloudFullData &&
      target.aiConfigHash === cloudFullData.aiConfigHash &&
      target.promptTemplatesHash === cloudFullData.promptTemplatesHash &&
      JSON.stringify(mergedDocs.map(d => ({ id: d.id, updatedAt: d.updatedAt, deleted: d.deleted }))) ===
      JSON.stringify(cloudFullData.docs.map(d => ({ id: d.id, updatedAt: d.updatedAt, deleted: d.deleted })))) {
      showSuccess('云端与本地一致，无需同步');
      return;   // 无需真正落库
    }


    const obj = await fetchOrCreateRecord();
    obj.set('docs', mergedDocs);
    obj.set('aiConfig', target.aiConfig);
    obj.set('aiConfigHash', target.aiConfigHash);
    obj.set('configUpdatedAt', target.aiConfigLastModified);
    obj.set('promptTemplates', target.promptTemplates);
    obj.set('promptTemplatesHash', target.promptTemplatesHash);
    obj.set('templateUpdatedAt', target.promptTemplatesLastModified);
    obj.set('docUpdatedAt', Math.max(...mergedDocs.map(d => Number(d.updatedAt)), 0));
    obj.set('updatedAtMs', Date.now());   // 补上统一时间戳

    await obj.save();
  }




  // 显示冲突确认对话框
  function showConflictDialog(conflicts) {
    if (!conflicts || conflicts.length === 0) return true;

    const conflictList = conflicts.map(conflict =>
      `文档：${conflict.title}\n` +
      `本地修改时间：${new Date(conflict.localTime).toLocaleString()}\n` +
      `云端修改时间：${new Date(conflict.cloudTime).toLocaleString()}\n`
    ).join('\n---\n\n');

    const message = `检测到 ${conflicts.length} 个潜在冲突：\n\n${conflictList}\n` +
      '这些文档在本地和云端都有修改，且时间很接近。\n' +
      '继续同步将按照"谁新用谁"的规则处理。\n\n' +
      '是否继续同步？';

    return confirm(message);
  }

  function showInfo(msg) { try { window.showInfo && window.showInfo(msg); } catch (_) { } }
  function showSuccess(msg) { try { window.showSuccess && window.showSuccess(msg); } catch (_) { } }
  function showError(msg) { try { window.showError && window.showError(msg); } catch (_) { alert(msg); } }
  function applyLangUIOnce() { try { if (typeof window.__mw_applyLangToUI === 'function') window.__mw_applyLangToUI(); } catch (_) { } }

  async function fetchOrCreateRecord() {
    const user = AV.User.current();
    if (!user) throw new Error('未登录');
    const MWData = AV.Object.extend(CLASS_NAME);
    try {
      const query = new AV.Query(MWData);
      query.equalTo('ownerId', user.id);
      const list = await query.find();
      if (list && list.length > 0) return list[0];
    } catch (e) {
      // Class 尚未创建或无 schema：忽略查询错误，直接创建
    }
    const obj = new MWData();
    obj.set('ownerId', user.id);
    obj.set('docs', []);
    obj.set('aiConfig', {});
    obj.set('promptTemplates', []);
    obj.set('docUpdatedAt', Date.now()); // 使用当前时间而不是0
    obj.set('configUpdatedAt', Date.now());
    obj.set('templateUpdatedAt', Date.now());
    return await obj.save();
  }


  async function downloadCloud() {
    const obj = await fetchOrCreateRecord();
    const docs = obj.get('docs') || [];
    const docUpdatedAt = obj.get('docUpdatedAt') || 0;
    const aiConfig = obj.get('aiConfig') || {};
    const promptTemplates = obj.get('promptTemplates') || [];

    const configUpdatedAt = obj.get('configUpdatedAt') || 0;
    const templateUpdatedAt = obj.get('templateUpdatedAt') || 0;

    // 新增：补齐上行时会写入的哈希与统一时间戳
    const aiConfigHash = obj.get('aiConfigHash') || undefined;
    const promptTemplatesHash = obj.get('promptTemplatesHash') || undefined;

    const updatedAtMs = obj.get('updatedAtMs') || 0;

    return {
      obj,
      docs,
      aiConfig,
      promptTemplates,
      docUpdatedAt,
      configUpdatedAt,
      templateUpdatedAt,
      aiConfigHash,        // 新增
      promptTemplatesHash, // 新增
      updatedAtMs          // 新增
    };
  }

  // 落地：本地（同步后物理删除已标记文档）
  function applyTargetToLocal(target) {
    // 物理剔除已删除文档
    const aliveDocs = target.docs.filter(d => !d.deletedAt);
    localStorage.setItem('mw_documents', JSON.stringify(aliveDocs));
    // AI 配置
    localStorage.setItem('allAIPlatformConfigs', JSON.stringify(target.aiConfig));
    localStorage.setItem('allAIPlatformConfigs_hash', target.aiConfigHash);
    localStorage.setItem('allAIPlatformConfigs_last_modified', String(target.aiConfigLastModified));
    // 提示词模板
    localStorage.setItem('promptTemplates', JSON.stringify(target.promptTemplates));
    localStorage.setItem('promptTemplates_hash', target.promptTemplatesHash);
    localStorage.setItem('promptTemplates_last_modified', String(target.promptTemplatesLastModified));
    // 同步时间戳
    localStorage.setItem('mindword_last_sync_at', String(Date.now()));
  }

  // async function uploadCloud(obj, docs) {
  //   obj.set('docs', docs);
  //   obj.set('updatedAtMs', Date.now());
  //   return await obj.save();
  // }

  // 新的同步逻辑：按照用户方案实现
  async function bidirectionalSync() {
    try {
      if (getLang() !== 'zh') { showInfo('当前为英文模式，已使用 Cloudflare Worker 同步'); return; }
      if (!isLoggedIn()) { throw new Error('未登录'); }
      showInfo('正在智能同步...');

      // 1. 组装本地完整快照
      const localDocs = getLocalDocs();
      const localAIConfig = getLocalAIConfig();
      const localPromptTemplates = getLocalPromptTemplates();
      const localFullData = {
        docs: localDocs,
        aiConfig: localAIConfig,
        aiConfigHash: localStorage.getItem('allAIPlatformConfigs_hash') || undefined,
        aiConfigLastModified: Number(localStorage.getItem('allAIPlatformConfigs_last_modified') || 0),
        promptTemplates: localPromptTemplates,
        promptTemplatesHash: localStorage.getItem('promptTemplates_hash') || undefined,
        promptTemplatesLastModified: Number(localStorage.getItem('promptTemplates_last_modified') || 0),
        lastSyncAt: Number(localStorage.getItem('mindword_last_sync_at') || 0)
      };

      // 文件大小检查
      const sizeCheck = checkFileSize(localDocs);
      if (!sizeCheck.valid) {
        throw new Error('文件大小检查失败：' + sizeCheck.errors.join('；'));
      }

      // 2. 拉取云端同结构快照（首次拉取时缓存原生对象）
      cachedCloudRaw = await downloadCloud();
      const cloudFullData = await fetchCloudFullData();

      // 3. 三向合并 → 目标结构
      const targetFullData = mergeToTarget(localFullData, cloudFullData);

      // 4. 落地：先写本地，再写云端（确保本地优先）
      applyTargetToLocal(targetFullData);
      await applyTargetToCloud(targetFullData, cloudFullData);

      // 5. 刷新 UI
      if (typeof mw_renderList === 'function') mw_renderList();

      // 6. 如果当前有正在编辑的文档，刷新数据展示
      if (typeof mw_getActive === 'function' && typeof mw_notifyEditorLoad === 'function') {
        const activeId = mw_getActive();
        if (activeId && typeof mw_loadDocs === 'function') {
          const docs = mw_loadDocs();
          const currentDoc = docs.find(d => d.id === activeId);
          if (currentDoc) {
            // 刷新当前文档到各个面板
            mw_notifyEditorLoad(currentDoc);
            if (typeof mw_notifyPreviewLoad === 'function') mw_notifyPreviewLoad(currentDoc);
            if (typeof mw_notifyMindmapLoad === 'function') mw_notifyMindmapLoad(currentDoc);
            console.log('[SYNC] 已刷新当前编辑文档:', activeId);
          }
        }

        // 检查当前文档是否被删除，如果是则切换到第一个有效文档
        const currentActiveId = mw_getActive();
        if (currentActiveId) {
          const docs = getLocalDocs();
          const currentDoc = docs.find(d => d.id === currentActiveId);
          if (!currentDoc || currentDoc.deletedAt) {
            console.log('[SYNC] 当前文档已被删除，准备切换到第一个有效文档');
            // 切换到第一个未删除的文档
            const firstValidDoc = docs.find(d => !d.deletedAt);
            if (firstValidDoc) {
              mw_setActive(firstValidDoc.id);
              mw_notifyEditorLoad(firstValidDoc);
              mw_notifyPreviewLoad(firstValidDoc);
              mw_notifyMindmapLoad(firstValidDoc);
              console.log('[SYNC] 已切换到第一个有效文档:', firstValidDoc.id);
            } else {
              // 没有有效文档，创建新文档
              const newId = 'doc_' + Date.now();
              const newDoc = {
                id: newId,
                name: '未命名文档',
                md: '# 未命名文档\n',
                images: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                version: 1
              };
              docs.push(newDoc);
              mw_saveDocs(docs);
              mw_setActive(newId);
              mw_renderList();
              mw_notifyEditorLoad(newDoc);
              mw_notifyPreviewLoad(newDoc);
              mw_notifyMindmapLoad(newDoc);
              console.log('[SYNC] 已创建新文档:', newId);
            }
          }
        }
      }
      showSuccess('同步完成');
      setTimeout(updateSyncStatus, 300);
    } catch (e) {
      showError(e.message || '同步失败');
    }
  }

  async function clearCloud() {
    try {
      if (getLang() !== 'zh') { showInfo('当前为英文模式，请用“清空备份”按钮'); return; }
      if (!isLoggedIn()) { throw new Error('未登录'); }
      if (!confirm('确认清空云端数据？此操作不可撤销')) return;
      const { obj } = await downloadCloud();

      // 清空所有数据
      obj.set('docs', []);
      obj.set('aiConfig', {});
      obj.set('promptTemplates', []);
      obj.set('docUpdatedAt', Date.now());
      obj.set('configUpdatedAt', Date.now());
      obj.set('templateUpdatedAt', Date.now());

      await obj.save();
      showSuccess('云端数据已清空');
    } catch (e) {
      showError(e.message || '清空失败');
    }
  }

  function initUIBindings() {
    const zhCtrls = document.getElementById('lc-sync-controls');


    // 个人菜单中的按钮
    const menuSyncBtn = document.getElementById('lc-sync-btn-menu');
    const menuClearBtn = document.getElementById('lc-clear-btn-menu');

    // 添加状态显示元素
    if (zhCtrls && !document.getElementById('lc-sync-status')) {
      const statusDiv = document.createElement('div');
      statusDiv.id = 'lc-sync-status';
      statusDiv.style.cssText = 'margin-left: 8px; padding: 4px 8px; background: #f8f9fa; border-radius: 4px;';
      zhCtrls.appendChild(statusDiv);
    }



    // 绑定个人菜单按钮 - 使用addEventListener确保函数可访问
    if (menuSyncBtn) {
      menuSyncBtn.addEventListener('click', bidirectionalSync);
    }
    if (menuClearBtn) {
      menuClearBtn.addEventListener('click', clearCloud);
    }

    // 登录状态或语言变化时切换显示
    function refreshVisible() {
      const authUser = document.getElementById('auth-user');
      const enCtrls = document.getElementById('cloud-sync-controls');
      // 未登录：两组隐藏，避免初次闪现
      if (!authUser || authUser.style.display === 'none') {
        if (enCtrls) enCtrls.style.display = 'none';
        if (zhCtrls) zhCtrls.style.display = 'none';
        return;
      }
      if (getLang() === 'zh') {
        if (enCtrls) enCtrls.style.display = 'none';
        if (zhCtrls) zhCtrls.style.display = 'inline-flex';
      } else {
        if (enCtrls) enCtrls.style.display = 'inline-flex';
        if (zhCtrls) zhCtrls.style.display = 'none';
      }
    }

    document.addEventListener('DOMContentLoaded', refreshVisible);
    window.addEventListener('storage', function (e) {
      if (e.key === LANG_KEY || (e.key && e.key.startsWith('AV/'))) setTimeout(refreshVisible, 50);
    });
    // 提供给外部在认证区变化后刷新
    window.__mw_refreshSyncLangUI = refreshVisible;

    // 初始化状态显示
    setTimeout(updateSyncStatus, 500);
  }

  // 页面就绪后初始化
  document.addEventListener('DOMContentLoaded', function () {
    initUIBindings();
    // 尝试在认证区刷新后应用一次
    setTimeout(applyLangUIOnce, 300);

    // 监听文档变化，自动更新状态
    if (typeof mw_getDocs === 'function') {
      // 监听本地存储变化
      window.addEventListener('storage', function (e) {
        if (e.key && e.key.includes('doc')) {
          setTimeout(updateSyncStatus, 100);
        }
      });

      // 定期更新状态（每30秒）
      setInterval(updateSyncStatus, 30000);
    }

    // 初始化个人菜单状态
    setTimeout(() => {
      updateSyncStatus();
      // 同时更新Cloudflare Worker的个人菜单状态
      if (typeof window.__mw_initCloudSyncUI === 'function') {
        window.__mw_initCloudSyncUI();
      }
    }, 100);
  });

  // 显示文件大小和同步状态
  function updateSyncStatus() {
    try {
      const docs = getLocalDocs();
      const sizeCheck = checkFileSize(docs);

      // 更新状态显示（主界面）
      const statusElement = document.getElementById('lc-sync-status');
      if (statusElement) {
        const totalSizeMB = (sizeCheck.totalSize / 1024).toFixed(1);
        const fileCount = docs ? docs.length : 0;

        statusElement.innerHTML = `
          <small style="color: #666; font-size: 11px;">
            文件: ${fileCount}个<br>${totalSizeMB}KB / 10MB
          </small>
        `;

        // 根据使用情况改变颜色
        if (sizeCheck.totalSize > 8 * 1024 * 1024) { // 超过8MB
          statusElement.querySelector('small').style.color = '#e74c3c';
        } else if (sizeCheck.totalSize > 5 * 1024 * 1024) { // 超过5MB
          statusElement.querySelector('small').style.color = '#f39c12';
        }
      }

      // 更新个人菜单中的状态显示
      const menuStatusElement = document.getElementById('lc-sync-status-menu');
      if (menuStatusElement) {
        const totalSizeMB = (sizeCheck.totalSize / 1024).toFixed(1);
        const fileCount = docs ? docs.length : 0;

        menuStatusElement.innerHTML = `文件: ${fileCount}个<br>${totalSizeMB}KB / 10MB`;

        // 根据使用情况改变颜色
        if (sizeCheck.totalSize > 8 * 1024 * 1024) { // 超过8MB
          menuStatusElement.style.color = '#e74c3c';
        } else if (sizeCheck.totalSize > 5 * 1024 * 1024) { // 超过5MB
          menuStatusElement.style.color = '#f39c12';
        } else {
          menuStatusElement.style.color = '#9ca3af';
        }
      }

      // 更新按钮状态
      const syncBtn = document.getElementById('lc-sync-btn');
      if (syncBtn) {
        if (!sizeCheck.valid) {
          syncBtn.disabled = true;
          syncBtn.title = '文件大小检查失败：' + sizeCheck.errors.join('；');
          syncBtn.style.opacity = '0.6';
        } else {
          syncBtn.disabled = false;
          syncBtn.title = '一键同步';
          syncBtn.style.opacity = '1';
        }
      }

      // 更新个人菜单中的同步按钮状态
      const menuSyncBtn = document.getElementById('lc-sync-btn-menu');
      if (menuSyncBtn) {
        if (!sizeCheck.valid) {
          menuSyncBtn.disabled = true;
          menuSyncBtn.title = '文件大小检查失败：' + sizeCheck.errors.join('；');
          menuSyncBtn.style.opacity = '0.6';
        } else {
          menuSyncBtn.disabled = false;
          menuSyncBtn.title = '一键同步';
          menuSyncBtn.style.opacity = '1';
        }
      }

    } catch (error) {
      console.warn('更新同步状态失败:', error);
    }
  }

  // 暴露手动入口（如需）
  window.MW_LC_SYNC = { sync: bidirectionalSync, clear: clearCloud, updateStatus: updateSyncStatus };

})();
