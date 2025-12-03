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

/**
 * AST转jsMind节点树转换器
 * 将AST结构转换为jsMind可用的node_tree格式
 */

// 浏览器兼容版本
class AstToNodeTreeConverter {
  constructor() {
    this.nodeIdCounter = 0;
  }

  /**
   * 转换AST为node_tree格式
   */
  convert(ast) {
    if (!ast) return null;

    const nodeTree = {
      meta: {
        name: 'jsMind remote',
        author: 'mindword',
        version: '1.0.0'
      },
      format: 'node_tree',
      data: {}
    };

    // 重置计数器
    this.nodeIdCounter = 0;

    // 转换根节点
    if (ast.type === 'document') {
      if (ast.children.length === 0) {
        // 空文档
        nodeTree.data = {
          id: ast.id || 'root',
          topic: 'New Document',
          children: []
        };
      } else if (ast.children.length === 1) {
        // 单根节点
        nodeTree.data = this.convertNode(ast.children[0], null, ast, '');
      } else {
        // 多根节点，创建一个虚拟根节点
        const rootId = ast.id || 'root';
        const rootTopic = 'Document';
        nodeTree.data = {
          id: rootId,
          topic: rootTopic,
          children: ast.children.map(child => this.convertNode(child, rootId, ast, rootTopic))
        };
      }
    } else {
      // 单个节点
      nodeTree.data = this.convertNode(ast, null, null, '');
    }

    return nodeTree;
  }

  /**
   * 转换单个节点
   */
  convertNode(node, parentId, parentNode = null, parentPath = '') {
    if (!node) return null;

    // 保持与AST相同的ID，如果没有则生成新的
    const nodeId = node.id || this.generateNodeId();

    // 提取当前节点的主题
    const nodeTopic = this.extractTopic(node);
    
    // 计算当前节点的完整路径
    const currentPath = parentPath ? `${parentPath}/${nodeTopic}` : nodeTopic;

    // 获取兄弟节点名称列表
    const siblingNames = [];
    if (parentNode && parentNode.children) {
      parentNode.children.forEach(sibling => {
        if (sibling !== node) {
          siblingNames.push(this.extractTopic(sibling));
        }
      });
    }

    const mindNode = {
      id: nodeId,
      topic: nodeTopic,
      parentid: parentId || (node.parent ? node.parent.id : null)
    };

    // 添加额外信息到data对象，但不包含notes
    mindNode.data = {
      type: node.type,
      level: node.level,
      raw: node.raw,
      fullPath: currentPath,         // 新增：完整路径
      siblingNodes: siblingNames     // 新增：兄弟节点名称列表
    };

    // 如果有notes，添加到节点根级别，而不是data中
    if (node.notes && node.notes.trim()) {
      mindNode.notes = node.notes;
    }

    // 处理子节点
    if (node.children && node.children.length > 0) {
      mindNode.children = node.children.map(child =>
        this.convertNode(child, nodeId, node, currentPath)
      );
    } else {
      mindNode.children = [];
    }

    return mindNode;
  }

  /**
   * 提取节点主题（去掉#等标识符）
   */
  extractTopic(node) {
    switch (node.type) {
      case 'heading':
        // 去掉标题的#标识符，只保留纯文本内容
        return node.name || 'Heading';

      case 'title':
        return node.name || 'Title';

      case 'list':
        // 去掉列表标识符，只保留内容
        return node.name || 'List Item';

      case 'document':
        return 'Document';

      default:
        return node.name || node.type || 'Node';
    }
  }

  /**
   * 生成唯一节点ID
   */
  generateNodeId() {
    return `node_${++this.nodeIdCounter}`;
  }

  /**
   * 批量转换多个AST节点
   */
  convertBatch(nodes) {
    if (!Array.isArray(nodes)) return [];

    return nodes.map(node => this.convert(node)).filter(Boolean);
  }

  /**
   * 获取转换统计信息
   */
  getStats(nodeTree) {
    const stats = {
      totalNodes: 0,
      maxDepth: 0,
      nodeTypes: {}
    };

    if (!nodeTree || !nodeTree.data) return stats;

    const traverse = (node, depth = 0) => {
      stats.totalNodes++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      const type = node.data?.type || 'unknown';
      stats.nodeTypes[type] = (stats.nodeTypes[type] || 0) + 1;

      if (node.children) {
        node.children.forEach(child => traverse(child, depth + 1));
      }
    };

    traverse(nodeTree.data);

    return stats;
  }

  /**
   * 设置自定义节点ID前缀
   */
  setIdPrefix(prefix) {
    this.idPrefix = prefix || 'node';
  }
}

// ES模块导出
export { AstToNodeTreeConverter };