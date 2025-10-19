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

  // 文件大小限制
  const MAX_IMAGE_SIZE = 200 * 1024; // 200KB
  const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10M

  function getLang() {
    try { return localStorage.getItem(LANG_KEY) || 'zh'; } catch (_) { return 'zh'; }
  }

  // 新的合并算法：将云端数据合并到本地
  function mergeWithCloudData(localDocs, localAIConfig, localPromptTemplates, cloudData) {
    const mergedDocs = [...localDocs];
    const cloudDocs = cloudData.docs || [];

    // 创建文档映射表
    const localDocMap = new Map();
    localDocs.forEach(doc => {
      if (doc && doc.id) {
        localDocMap.set(doc.id, doc);
      }
    });

    const cloudDocMap = new Map();
    cloudDocs.forEach(doc => {
      if (doc && doc.id) {
        cloudDocMap.set(doc.id, doc);
      }
    });

    // 处理云端文档
    cloudDocs.forEach(cloudDoc => {
      if (!cloudDoc || !cloudDoc.id) return;

      const localDoc = localDocMap.get(cloudDoc.id);

      if (!localDoc) {
        // 本地没有，直接添加云端文档
        mergedDocs.push(cloudDoc);
      } else {
        // 两边都有，比较时间戳决定保留哪个
        const localTime = Number(localDoc.updatedAt || localDoc.deletedAt || 0);
        const cloudTime = Number(cloudDoc.updatedAt || cloudDoc.deletedAt || 0);

        if (cloudTime > localTime) {
          // 云端更新，用云端版本替换本地版本
          const index = mergedDocs.findIndex(d => d.id === cloudDoc.id);
          if (index >= 0) {
            mergedDocs[index] = cloudDoc;
          }
        }
      }
    });

    // 处理本地独有但被删除的文档
    const finalDocs = mergedDocs.filter(doc => {
      if (!doc || !doc.id) return false;

      // 如果文档被标记为删除，检查云端是否还存在
      if (doc.deletedAt) {
        const cloudDoc = cloudDocMap.get(doc.id);
        if (cloudDoc && !cloudDoc.deletedAt) {
          // 云端没有删除，保留云端版本
          return false;
        }
      }

      return true;
    });

    // 合并AI配置（优先使用最新的）
    let mergedAIConfig = { ...localAIConfig };
    if (cloudData.aiConfig && cloudData.aiConfig.updatedAt) {
      const localAIConfigTime = Number(localAIConfig.updatedAt || 0);
      const cloudAIConfigTime = Number(cloudData.aiConfig.updatedAt || 0);

      if (cloudAIConfigTime > localAIConfigTime) {
        mergedAIConfig = { ...cloudData.aiConfig };
      }
    }

    // 合并提示词模板（优先使用最新的）
    let mergedTemplates = [...localPromptTemplates];
    if (cloudData.promptTemplates && cloudData.promptTemplates.updatedAt) {
      const localTemplatesTime = Number(localPromptTemplates.updatedAt || 0);
      const cloudTemplatesTime = Number(cloudData.promptTemplates.updatedAt || 0);

      if (cloudTemplatesTime > localTemplatesTime) {
        mergedTemplates = [...cloudData.promptTemplates];
      }
    }

    return {
      docs: finalDocs,
      aiConfig: mergedAIConfig,
      promptTemplates: mergedTemplates
    };
  }

  // 检查合并后的数据与云端数据是否有差异
  function checkDataDifferences(mergedData, cloudData) {
    // 检查文档差异
    const mergedDocs = mergedData.docs || [];
    const cloudDocs = cloudData.docs || [];

    if (mergedDocs.length !== cloudDocs.length) {
      return true; // 数量不同，有差异
    }

    // 创建映射表快速比较
    const mergedDocMap = new Map();
    mergedDocs.forEach(doc => {
      if (doc && doc.id) {
        mergedDocMap.set(doc.id, doc);
      }
    });

    const cloudDocMap = new Map();
    cloudDocs.forEach(doc => {
      if (doc && doc.id) {
        cloudDocMap.set(doc.id, doc);
      }
    });

    // 检查每个文档
    for (const [docId, mergedDoc] of mergedDocMap) {
      const cloudDoc = cloudDocMap.get(docId);
      if (!cloudDoc) {
        return true; // 云端缺少文档
      }

      // 简单的内容比较（可以优化为更复杂的比较）
      if (JSON.stringify(mergedDoc) !== JSON.stringify(cloudDoc)) {
        return true; // 内容不同
      }
    }

    // 检查AI配置差异
    if (JSON.stringify(mergedData.aiConfig) !== JSON.stringify(cloudData.aiConfig || {})) {
      return true;
    }

    // 检查提示词模板差异
    if (JSON.stringify(mergedData.promptTemplates) !== JSON.stringify(cloudData.promptTemplates || [])) {
      return true;
    }

    return false; // 没有差异
  }

  // 上传合并后的数据到云端（仅在有时才调用）
  async function uploadToCloud(mergedData) {
    const results = { cloudUpdated: 0, errors: [] };

    try {
      const currentData = await fetchOrCreateRecord();

      // 更新文档
      currentData.set('docs', mergedData.docs);
      currentData.set('docUpdatedAt', Date.now());
      results.cloudUpdated += (mergedData.docs || []).length;

      // 更新AI配置
      currentData.set('aiConfig', mergedData.aiConfig);
      currentData.set('configUpdatedAt', Date.now());
      if (Object.keys(mergedData.aiConfig || {}).length > 0) {
        results.cloudUpdated++;
      }

      // 更新提示词模板
      currentData.set('promptTemplates', mergedData.promptTemplates);
      currentData.set('templateUpdatedAt', Date.now());
      if ((mergedData.promptTemplates || []).length > 0) {
        results.cloudUpdated++;
      }

      // 保存到云端
      await currentData.save();

    } catch (error) {
      results.errors.push(error.message);
      throw new Error('上传到云端失败：' + error.message);
    }

    return results;
  }
  function isLoggedIn() {
    try { return !!(window.AV && AV.User && AV.User.current()); } catch (_) { return false; }
  }

  function getLocalDocs() { try { return (typeof mw_loadDocs === 'function') ? mw_loadDocs() : []; } catch (_) { return []; } }
  function saveLocalDocs(docs) { try { return (typeof mw_saveDocs === 'function') ? mw_saveDocs(docs) : null; } catch (_) { return null; } }

  // 获取AI配置和提示词模板
  function getLocalAIConfig() {
    try {
      return (typeof mw_loadAIConfig === 'function') ? mw_loadAIConfig() : {};
    } catch (_) {
      return {};
    }
  }
  function getLocalPromptTemplates() {
    try {
      return (typeof mw_loadPromptTemplates === 'function') ? mw_loadPromptTemplates() : [];
    } catch (_) {
      return [];
    }
  }

  // 保存AI配置和提示词模板
  function saveLocalAIConfig(config) {
    try {
      return (typeof mw_saveAIConfig === 'function') ? mw_saveAIConfig(config) : null;
    } catch (_) {
      return null;
    }
  }
  function saveLocalPromptTemplates(templates) {
    try {
      return (typeof mw_savePromptTemplates === 'function') ? mw_savePromptTemplates(templates) : null;
    } catch (_) {
      return null;
    }
  }

  // 文件大小检查函数
  function checkFileSize(docs) {
    let totalSize = 0;
    const errors = [];

    for (const doc of (docs || [])) {
      if (!doc) continue;

      // 计算文档文本内容大小（UTF-8编码）
      if (doc.content) {
        const contentSize = new Blob([doc.content]).size;
        totalSize += contentSize;
      }

      // 计算标题大小
      if (doc.title) {
        const titleSize = new Blob([doc.title]).size;
        totalSize += titleSize;
      }

      // 计算备注大小
      if (doc.note) {
        const noteSize = new Blob([doc.note]).size;
        totalSize += noteSize;
      }

      // 检查文档中的图片
      if (doc.content) {
        const imgMatches = doc.content.match(/data:image\/[^;]+;base64,[^"']+/g) || [];
        for (const imgData of imgMatches) {
          const base64Data = imgData.split(',')[1];
          const imgSize = Math.ceil(base64Data.length * 0.75); // base64解码后的大小

          if (imgSize > MAX_IMAGE_SIZE) {
            errors.push(`文档"${doc.title || doc.id}"中的图片超过200KB限制`);
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

  // 分析同步需求，返回需要执行的操作列表
  function analyzeSyncNeeds(localData, cloudData) {
    const operations = {
      local: {
        updateDocs: [],
        addDocs: [], // 新增：需要新增的文档
        updateAIConfig: false,
        updateTemplates: false,
        deleteDocs: [] // 新增：需要删除的文档
      },
      cloud: {
        updateDocs: [],
        addDocs: [], // 新增：需要新增的文档
        updateAIConfig: false,
        updateTemplates: false,
        deleteDocs: [] // 新增：需要删除的文档
      },
      conflicts: []
    };

    // 分析文档同步需求
    const localDocTimestamps = getDocTimestamps(localData.docs);
    const cloudDocTimestamps = getDocTimestamps(cloudData.docs);
    const allDocIds = new Set([...Object.keys(localDocTimestamps), ...Object.keys(cloudDocTimestamps)]);

    // 冲突检测：如果时间差超过5分钟，认为是潜在冲突
    const CONFLICT_THRESHOLD = 5 * 60 * 1000; // 5分钟
    const now = Date.now();

    for (const docId of allDocIds) {
      const localTime = localDocTimestamps[docId] || 0;
      const cloudTime = cloudDocTimestamps[docId] || 0;
      const localDoc = localData.docs.find(d => d.id === docId);
      const cloudDoc = cloudData.docs.find(d => d.id === docId);

      // 检测冲突：如果两边都有修改且时间接近（可能存在同时编辑）
      if (localTime > 0 && cloudTime > 0 && Math.abs(localTime - cloudTime) < CONFLICT_THRESHOLD) {
        if (localDoc && cloudDoc) {
          // 检查内容是否不同（简单的标题比较，实际可以更复杂）
          if (localDoc.title !== cloudDoc.title || localDoc.content !== cloudDoc.content) {
            operations.conflicts.push({
              type: 'document',
              id: docId,
              title: localDoc.title || cloudDoc.title || '未命名文档',
              localTime: localTime,
              cloudTime: cloudTime,
              localPreview: (localDoc.title || '').substring(0, 50) + '...',
              cloudPreview: (cloudDoc.title || '').substring(0, 50) + '...'
            });
          }
        }
      }

      if (localTime > 0 && cloudTime > 0) {
        // 两边都有文档，比较时间戳和内容
        if (localTime === cloudTime) {
          // 时间戳相同，检查内容是否相同
          const isContentSame = localDoc && cloudDoc &&
            localDoc.title === cloudDoc.title &&
            localDoc.content === cloudDoc.content;

          if (!isContentSame) {
            // 内容不同，更新时间戳较新的（虽然时间戳相同，但可能有微秒差异）
            if (localDoc && cloudDoc) {
              // 优先使用本地版本，但更新时间戳
              operations.cloud.updateDocs.push(localDoc);
            }
          }
          // 如果内容相同，不做任何操作
        } else if (localTime > cloudTime) {
          // 本地较新，需要更新云端
          if (localDoc) {
            // 检查本地文档是否被标记为删除
            if (localDoc.deletedAt) {
              operations.cloud.deleteDocs.push(localDoc);
            } else {
              operations.cloud.updateDocs.push(localDoc);
            }
          }
        } else {
          // 云端较新，需要更新本地
          if (cloudDoc) {
            // 检查云端文档是否被标记为删除
            if (cloudDoc.deletedAt) {
              operations.local.deleteDocs.push(cloudDoc);
            } else {
              operations.local.updateDocs.push(cloudDoc);
            }
          }
        }
      } else if (localTime > 0 && cloudTime === 0) {
        // 本地有，云端没有（本地独有）
        if (localDoc) {
          if (localDoc.deletedAt) {
            // 本地标记为删除，不需要同步到云端
            continue;
          } else {
            operations.cloud.addDocs.push(localDoc);
          }
        }
      } else if (localTime === 0 && cloudTime > 0) {
        // 本地没有，云端有（云端独有）
        if (cloudDoc) {
          if (cloudDoc.deletedAt) {
            // 云端标记为删除，不需要同步到本地
            continue;
          } else {
            // 云端有而本地没有，需要新增到本地
            operations.local.addDocs.push(cloudDoc);
          }
        }
      }
    }

    // 分析AI配置同步需求
    if (localData.configUpdatedAt > cloudData.configUpdatedAt) {
      operations.cloud.updateAIConfig = true;
    } else if (cloudData.configUpdatedAt > localData.configUpdatedAt) {
      operations.local.updateAIConfig = true;
    }

    // 分析提示词模板同步需求
    if (localData.templateUpdatedAt > cloudData.templateUpdatedAt) {
      operations.cloud.updateTemplates = true;
    } else if (cloudData.templateUpdatedAt > localData.templateUpdatedAt) {
      operations.local.updateTemplates = true;
    }

    return operations;
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

  function toIdMap(arr) {
    const map = new Map();
    for (const d of (arr || [])) { if (d && d.id) map.set(d.id, d); }
    return map;
  }

  // 执行同步操作
  async function executeSync(operations) {
    const results = {
      localUpdated: 0,
      cloudUpdated: 0,
      errors: []
    };

    try {
      // 更新本地数据
      if (operations.local.updateDocs.length > 0 || operations.local.addDocs.length > 0 || operations.local.deleteDocs.length > 0) {
        const currentDocs = getLocalDocs();
        let updatedDocs = [...currentDocs];

        // 处理新增
        for (const newDoc of operations.local.addDocs) {
          const exists = updatedDocs.some(d => d.id === newDoc.id);
          if (!exists) {
            updatedDocs.push(newDoc);
          }
        }

        // 处理更新
        for (const newDoc of operations.local.updateDocs) {
          const index = updatedDocs.findIndex(d => d.id === newDoc.id);
          if (index >= 0) {
            updatedDocs[index] = newDoc;
          } else {
            updatedDocs.push(newDoc);
          }
        }

        // 处理删除 - 只保留ID和删除时间，移除其他数据以节省空间
        for (const deleteDoc of operations.local.deleteDocs) {
          const index = updatedDocs.findIndex(d => d.id === deleteDoc.id);
          if (index >= 0) {
            updatedDocs[index] = {
              id: updatedDocs[index].id,
              deletedAt: Date.now(),
              updatedAt: Date.now()
            };
          }
        }

        saveLocalDocs(updatedDocs);
        results.localUpdated += operations.local.updateDocs.length + operations.local.addDocs.length + operations.local.deleteDocs.length;
      }

      if (operations.local.updateAIConfig) {
        // AI配置更新逻辑
        const cloudData = await downloadCloud();
        saveLocalAIConfig(cloudData.aiConfig || {});
      }

      if (operations.local.updateTemplates) {
        // 提示词模板更新逻辑
        const cloudData = await downloadCloud();
        saveLocalPromptTemplates(cloudData.promptTemplates || []);
      }

      // 更新云端数据
      if (operations.cloud.updateDocs.length > 0 || operations.cloud.addDocs.length > 0 || operations.cloud.deleteDocs.length > 0 || operations.cloud.updateAIConfig || operations.cloud.updateTemplates) {
        const currentData = await fetchOrCreateRecord();

        if (operations.cloud.updateDocs.length > 0 || operations.cloud.addDocs.length > 0 || operations.cloud.deleteDocs.length > 0) {
          const currentDocs = currentData.get('docs') || [];
          let updatedDocs = [...currentDocs];

          // 处理新增
          for (const newDoc of operations.cloud.addDocs) {
            const exists = updatedDocs.some(d => d.id === newDoc.id);
            if (!exists) {
              updatedDocs.push(newDoc);
            }
          }

          // 处理更新
          for (const newDoc of operations.cloud.updateDocs) {
            const index = updatedDocs.findIndex(d => d.id === newDoc.id);
            if (index >= 0) {
              updatedDocs[index] = newDoc;
            } else {
              updatedDocs.push(newDoc);
            }
          }

          // 处理删除 - 只保留ID和删除时间，移除其他数据以节省空间
          for (const deleteDoc of operations.cloud.deleteDocs) {
            const index = updatedDocs.findIndex(d => d.id === deleteDoc.id);
            if (index >= 0) {
              updatedDocs[index] = {
                id: updatedDocs[index].id,
                deletedAt: Date.now(),
                updatedAt: Date.now()
              };
            }
          }

          currentData.set('docs', updatedDocs);
          currentData.set('docUpdatedAt', Date.now()); // 更新文档时间戳
          results.cloudUpdated += operations.cloud.updateDocs.length + operations.cloud.addDocs.length + operations.cloud.deleteDocs.length;
        }

        if (operations.cloud.updateAIConfig) {
          currentData.set('aiConfig', getLocalAIConfig());
          currentData.set('configUpdatedAt', Date.now());
        }

        if (operations.cloud.updateTemplates) {
          currentData.set('promptTemplates', getLocalPromptTemplates());
          currentData.set('templateUpdatedAt', Date.now());
        }

        await currentData.save();
      }

    } catch (error) {
      results.errors.push(error.message);
    }

    return results;
  }

  async function downloadCloud() {
    const obj = await fetchOrCreateRecord();
    const docs = obj.get('docs') || [];
    const aiConfig = obj.get('aiConfig') || {};
    const promptTemplates = obj.get('promptTemplates') || [];
    const docUpdatedAt = obj.get('docUpdatedAt') || 0;
    const configUpdatedAt = obj.get('configUpdatedAt') || 0;
    const templateUpdatedAt = obj.get('templateUpdatedAt') || 0;

    return {
      obj,
      docs,
      aiConfig,
      promptTemplates,
      docUpdatedAt,
      configUpdatedAt,
      templateUpdatedAt
    };
  }

  async function uploadCloud(obj, docs) {
    obj.set('docs', docs);
    obj.set('updatedAtMs', Date.now());
    return await obj.save();
  }

  // 新的同步逻辑：按照用户方案实现
  async function bidirectionalSync() {
    try {
      if (getLang() !== 'zh') { showInfo('当前为英文模式，已使用 Cloudflare Worker 同步'); return; }
      if (!isLoggedIn()) { throw new Error('未登录'); }
      showInfo('正在智能同步...');

      const localDocs = getLocalDocs();
      const localAIConfig = getLocalAIConfig();
      const localPromptTemplates = getLocalPromptTemplates();

      // 文件大小检查
      const sizeCheck = checkFileSize(localDocs);
      if (!sizeCheck.valid) {
        throw new Error('文件大小检查失败：' + sizeCheck.errors.join('；'));
      }

      // 1. 获取云端数据
      const cloudData = await downloadCloud();

      // 2. 生成本地最新版本（合并云端数据）
      const mergedLocalData = mergeWithCloudData(localDocs, localAIConfig, localPromptTemplates, cloudData);

      // 3. 保存合并后的版本到本地
      saveLocalDocs(mergedLocalData.docs);
      saveLocalAIConfig(mergedLocalData.aiConfig);
      saveLocalPromptTemplates(mergedLocalData.promptTemplates);

      // 4. 对比合并后的本地版本与云端版本
      const hasChanges = checkDataDifferences(mergedLocalData, cloudData);

      if (!hasChanges) {
        showInfo('数据已是最新，无需同步');
        return;
      }

      // 5. 仅在存在差异时才调用云端API
      const results = await uploadToCloud(mergedLocalData);

      // 刷新列表与当前文档视图
      try {
        if (typeof mw_renderList === 'function') mw_renderList();
        if (typeof mw_getActive === 'function') {
          const activeId = mw_getActive();
          if (activeId) {
            const docsNow = getLocalDocs();
            const activeDoc = (docsNow || []).find(d => d.id === activeId) || null;
            if (activeDoc) {
              if (typeof mw_notifyEditorLoad === 'function') mw_notifyEditorLoad(activeDoc);
              if (typeof mw_notifyPreviewLoad === 'function') mw_notifyPreviewLoad(activeDoc);
              if (typeof mw_notifyMindmapLoad === 'function') mw_notifyMindmapLoad(activeDoc);
            }
          }
        }
      } catch (_) { }

      showSuccess(`同步成功！云端更新${results.cloudUpdated}项`);

      // 同步完成后更新状态显示
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
    const syncBtn = document.getElementById('lc-sync-btn');
    const clearBtn = document.getElementById('lc-clear-btn');

    // 添加状态显示元素
    if (zhCtrls && !document.getElementById('lc-sync-status')) {
      const statusDiv = document.createElement('div');
      statusDiv.id = 'lc-sync-status';
      statusDiv.style.cssText = 'margin-left: 8px; padding: 4px 8px; background: #f8f9fa; border-radius: 4px;';
      zhCtrls.appendChild(statusDiv);
    }

    if (syncBtn) syncBtn.onclick = () => bidirectionalSync();
    if (clearBtn) clearBtn.onclick = () => clearCloud();

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
  });

  // 显示文件大小和同步状态
  function updateSyncStatus() {
    try {
      const docs = getLocalDocs();
      const sizeCheck = checkFileSize(docs);

      // 更新状态显示
      const statusElement = document.getElementById('lc-sync-status');
      if (statusElement) {
        const totalSizeMB = (sizeCheck.totalSize / 1024 / 1024).toFixed(1);
        const fileCount = docs ? docs.length : 0;

        statusElement.innerHTML = `
          <small style="color: #666; font-size: 11px;">
            文件: ${fileCount}个 | 大小: ${totalSizeMB}MB / 10MB
          </small>
        `;

        // 根据使用情况改变颜色
        if (sizeCheck.totalSize > 8 * 1024 * 1024) { // 超过8MB
          statusElement.querySelector('small').style.color = '#e74c3c';
        } else if (sizeCheck.totalSize > 5 * 1024 * 1024) { // 超过5MB
          statusElement.querySelector('small').style.color = '#f39c12';
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

    } catch (error) {
      console.warn('更新同步状态失败:', error);
    }
  }

  // 暴露手动入口（如需）
  window.MW_LC_SYNC = { sync: bidirectionalSync, clear: clearCloud, updateStatus: updateSyncStatus };

})();
