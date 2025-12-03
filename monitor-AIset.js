/**
 * MindWord - 树心 | 像画图一样写文档的思维导图写作工具
 * GitHub: https://github.com/TimiKays/MindWord
 * 
 * Copyright 2025 Timi Kays
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// 监听AI配置和提示词模板的修改，自动记录修改时间（简洁无重复版）
// ## AI配置和提示词模板的修改监听系统
// 这个模块的作用是：

// - 监听localStorage变化 ：通过 storage 事件监听跨页面的数据变化
// - 哈希检测 ：使用简单的哈希函数检测内容是否真正发生变化，避免重复更新
// - 记录修改时间 ：当检测到内容变化时，自动记录修改时间戳
// - 防重复机制 ：使用 isUpdatingModifiedTime 标志防止循环更新
// 具体监听的数据项：

// - allAIPlatformConfigs - AI平台配置
// - promptTemplates - 提示词模板
// - myPromptTemplates - 用户的自定义提示词模板

// 简单的哈希函数
function simpleHash(str) {
  let hash = 0;
  if (!str || str.length === 0) return hash.toString(36);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}


let isUpdatingModifiedTime = false;

// 更新AI配置的修改时间
function updateAIConfigModifiedTime(newValue) {
  if (isUpdatingModifiedTime) return;

  try {
    const newHash = newValue ? simpleHash(newValue) : '';
    const storedHash = localStorage.getItem('allAIPlatformConfigs_hash') || '';

    if (newHash !== storedHash) {
      console.log(`[Storage Listener] AI配置哈希变化: ${storedHash} -> ${newHash}`);

      isUpdatingModifiedTime = true;
      localStorage.setItem('allAIPlatformConfigs_hash', newHash);
      localStorage.setItem('allAIPlatformConfigs_last_modified', Date.now().toString());
      isUpdatingModifiedTime = false;



      console.log('[Storage Listener] AI配置内容变化，已更新修改时间和哈希');
    }
  } catch (e) {
    isUpdatingModifiedTime = false;
    console.warn('[Storage Listener] 更新AI配置修改时间失败:', e);
  }
}

// 更新提示词模板的修改时间
function updatePromptTemplatesModifiedTime(newValue) {
  if (isUpdatingModifiedTime) return;

  try {
    const newHash = newValue ? simpleHash(newValue) : '';
    const storedHash = localStorage.getItem('promptTemplates_hash') || '';

    if (newHash !== storedHash) {
      console.log(`[Storage Listener] 提示词模板哈希变化: ${storedHash} -> ${newHash}`);

      isUpdatingModifiedTime = true;
      localStorage.setItem('promptTemplates_hash', newHash);
      localStorage.setItem('promptTemplates_last_modified', Date.now().toString());
      isUpdatingModifiedTime = false;


      // console.log('[Storage Listener] 提示词模板内容变化，已更新修改时间和哈希');
    }
  } catch (e) {
    isUpdatingModifiedTime = false;
    // console.warn('[Storage Listener] 更新提示词模板修改时间失败:', e);
  }
}

// 更新我的提示词模板的修改时间
function updateMyPromptTemplatesModifiedTime(newValue) {
  if (isUpdatingModifiedTime) return;

  try {
    const newHash = newValue ? simpleHash(newValue) : '';
    const storedHash = localStorage.getItem('myPromptTemplates_hash') || '';

    if (newHash !== storedHash) {
      console.log(`[Storage Listener] 我的提示词模板哈希变化: ${storedHash} -> ${newHash}`);

      isUpdatingModifiedTime = true;
      localStorage.setItem('myPromptTemplates_hash', newHash);
      localStorage.setItem('myPromptTemplates_last_modified', Date.now().toString());
      isUpdatingModifiedTime = false;

      // console.log('[Storage Listener] 我的提示词模板内容变化，已更新修改时间和哈希');
    }
  } catch (e) {
    isUpdatingModifiedTime = false;
    // console.warn('[Storage Listener] 更新我的提示词模板修改时间失败:', e);
  }
}

// 监听跨页面的storage事件（只绑定一次）
if (!window.__mw_storageEventBound) {
  window.addEventListener('storage', function (e) {
    if (e.key === 'allAIPlatformConfigs') {
      console.log('[Storage Listener] 检测到跨页面AI配置变化');
      updateAIConfigModifiedTime(e.newValue);
    } else if (e.key === 'promptTemplates') {
      console.log('[Storage Listener] 检测到跨页面提示词模板变化');
      updatePromptTemplatesModifiedTime(e.newValue);
    } else if (e.key === 'myPromptTemplates') {
      console.log('[Storage Listener] 检测到跨页面我的提示词模板变化');
      updateMyPromptTemplatesModifiedTime(e.newValue);
    }
  });
  window.__mw_storageEventBound = true;
}