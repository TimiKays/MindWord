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

// ===== 复制新建文档功能 =====
// 修改markdown字符串中的根标题（第一行的#标题）
function mw_updateRootTitle(md, newTitle) {
  try {
    const lines = String(md || '').split(/\r?\n/);
    if (lines.length === 0) return '# ' + newTitle + '\n';

    // 查找第一行非空行
    let firstContentLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        firstContentLineIndex = i;
        break;
      }
    }

    if (firstContentLineIndex === -1) {
      // 没有内容行，添加新标题
      return '# ' + newTitle + '\n';
    }

    const firstLine = lines[firstContentLineIndex].trim();

    // 如果第一行是标题行，替换标题内容
    if (firstLine.match(/^#{1,6}\s+/)) {
      lines[firstContentLineIndex] = '# ' + newTitle;
    } else {
      // 第一行不是标题，在第一行前插入新标题
      lines.splice(firstContentLineIndex, 0, '# ' + newTitle);
    }

    return lines.join('\n');
  } catch (e) {
    console.warn('更新根标题失败：', e);
    return md || '# ' + newTitle + '\n';
  }
}

function mw_copyNewDoc(sourceDocId) {
  const docs = mw_loadDocs();
  const sourceDoc = docs.find(d => d.id === sourceDocId);
  if (!sourceDoc) {
    alert('原文档不存在');
    return;
  }

  // 生成新文档名称
  const newName = prompt('新文档名称：', sourceDoc.name + ' (副本)');
  if (!newName) return;

  // 生成新文档ID
  const newId = 'doc_' + Date.now();

  // 更新markdown内容中的根标题
  const updatedMd = mw_updateRootTitle(sourceDoc.md || '', newName);

  // 创建新文档对象，复制原文档的核心内容
  // AI配置信息是全局的，不应该存储在单个文档中
  const newDoc = {
    id: newId,
    name: newName,
    md: updatedMd, // 使用更新后的markdown内容
    images: sourceDoc.images ? [...sourceDoc.images] : [], // 深拷贝图片数组
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1
  };

  // 将新文档添加到文档列表
  docs.push(newDoc);
  mw_saveDocs(docs);

  // 设置新文档为活动文档
  mw_setActive(newId);

  // 重新渲染文档列表
  mw_renderList();

  // 通知各个面板加载新文档
  mw_notifyEditorLoad(newDoc);
  mw_notifyPreviewLoad(newDoc);
  mw_notifyMindmapLoad(newDoc);

  try {
    showSuccess && showSuccess('文档已复制并打开');
  } catch (_) { }
}