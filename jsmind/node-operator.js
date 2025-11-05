// jsmind-node-operator.js
/**
 * 思维导图节点操作器
 * 提供统一的节点操作接口，兼容jsmind原生节点和converter扩展节点
 */
class MindNodeOperator {
  constructor(jsmindInstance) {
    this.jm = jsmindInstance;
    if (!this.jm) {
      throw new Error('jsmind实例不能为空');
    }
  }

  // ==================== 基础获取操作 ====================

  /**
   * 获取节点（自动处理节点ID或节点对象）
   */
  getNode(nodeOrId) {
    if (!nodeOrId) return null;

    // 如果已经是节点对象，返回真实节点
    if (typeof nodeOrId === 'object' && nodeOrId.id) {
      return this.jm.get_node(nodeOrId.id);
    }

    // 如果是ID字符串，获取节点
    return this.jm.get_node(nodeOrId);
  }

  /**
   * 获取当前选中的节点
   */
  getSelectedNode() {
    return this.jm.get_selected_node();
  }

  /**
   * 获取节点的备注（兼容多种存储位置）
   */
  getNodeNotes(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node) return '';

    // 优先级：node.data.notes > node.notes > DOM元素 > node.data.remark > ''
    let notes = '';
    try {
      notes = (node && node.data && node.data.notes) ? node.data.notes :
        (node && node.notes) ? node.notes :
          (document.getElementById && document.getElementById('nodeNotes') ?
            document.getElementById('nodeNotes').value : '') ||
          (node.data && node.data.remark) || '';
    } catch (_) { notes = ''; }
    return notes;
  }

  /**
   * 获取节点类型（兼容多层嵌套结构）
   */
  getNodeType(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node) return undefined;

    // 兼容现有代码的多层嵌套结构：node.type > node.data.type > node.data.data.type
    if (typeof node.type !== 'undefined') {
      return node.type;
    } else if (node.data && typeof node.data.type !== 'undefined') {
      return node.data.type;
    } else if (node.data && node.data.data && typeof node.data.data.type !== 'undefined') {
      return node.data.data.type;
    }
    return undefined;
  }

  /**
   * 设置节点类型
   */
  setNodeType(nodeOrId, type) {
    const node = this.getNode(nodeOrId);
    if (!node) return;

    // 兼容现有代码的设置方式
    node.type = type;
    if (node.data) {
      if (node.data.data) {
        node.data.data.type = type;
      } else {
        node.data.type = type;
      }
    }
  }

  /**
   * 获取节点层级
   */
  getNodeLevel(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node) return null;

    // 兼容现有代码的多层嵌套结构
    if (typeof node.level !== 'undefined') return node.level;
    if (node.data && typeof node.data.level !== 'undefined') return node.data.level;
    if (node.data && node.data.data && typeof node.data.data.level !== 'undefined') return node.data.data.level;

    // Fallback：如果节点topic是数字，尝试解析为层级
    if (node.topic && /^\d+$/.test(node.topic.trim())) {
      const topicLevel = parseInt(node.topic.trim());
      if (topicLevel >= 0 && topicLevel <= 6) {
        return topicLevel;
      }
    }
    return null;
  }

  /**
   * 设置节点层级
   */
  setNodeLevel(nodeOrId, level) {
    const node = this.getNode(nodeOrId);
    if (!node || level < 1 || level > 6) return;

    node.level = level;
    if (node.data) {
      if (node.data.data) {
        node.data.data.level = level;
      } else {
        node.data.level = level;
      }
    }
  }

  /**
   * 强制设置节点为列表类型（兼容现有代码）
   */
  forceListType(nodeOrId, inheritFrom) {
    const node = this.getNode(nodeOrId);
    if (!node) return;

    const oldType = this.getNodeType(node);
    let ordered = false;
    let marker = '-';

    if (inheritFrom) {
      const inheritData = this.getNodeBusinessData(inheritFrom);
      ordered = inheritData.ordered != null ? inheritData.ordered : false;
      marker = inheritData.marker != null ? inheritData.marker : (ordered ? '1.' : '-');
    }

    // 设置节点类型和属性
    this.setNodeType(node, 'list');
    node.ordered = ordered;
    node.marker = marker;

    if (!node.data) node.data = {};

    // 处理嵌套的data结构
    if (node.data.data) {
      node.data.data.type = 'list';
      node.data.data.ordered = ordered;
      node.data.data.marker = marker;
    } else {
      node.data.type = 'list';
      node.data.ordered = ordered;
      node.data.marker = marker;
    }

    // 删除层级信息
    delete node.level;
    if (node.data) {
      if (node.data.data) {
        delete node.data.data.level;
      } else {
        delete node.data.level;
      }
    }
  }

  /**
   * 根据同级或父节点对齐节点类型（兼容现有代码）
   */
  applySiblingOrParentType(nodeOrId, parentNode) {
    const node = this.getNode(nodeOrId);
    if (!node) return;

    // 收集同级节点（排除自己）
    let siblings = [];
    const parent = this.getParentNode(node);
    if (parent && parent.children && parent.children.length > 0) {
      siblings = parent.children.filter(c => c && c.id !== node.id);
    }

    // 参考类型：优先同级的第一个有类型的节点，否则父节点类型
    let refType, refLevel;

    if (siblings.length > 0) {
      for (const sibling of siblings) {
        const type = this.getNodeType(sibling);
        if (typeof type !== 'undefined') {
          refType = type;
          refLevel = this.getNodeLevel(sibling);
          break;
        }
      }
    }

    if (typeof refType === 'undefined' && siblings.length === 0 && parent) {
      const parentType = this.getNodeType(parent);
      const parentLevel = this.getNodeLevel(parent) || 0;

      if (parentType === undefined) {
        refType = 'list';
      } else {
        refType = (parentType === 'heading' && parentLevel >= 6) ? 'list' : parentType;

        if (refType === 'heading') {
          refLevel = Math.min(parentLevel + 1, 6);
        }
      }
    }

    // 应用参考类型
    if (typeof refType !== 'undefined') {
      this.setNodeType(node, refType);
      if (refType === 'heading' && typeof refLevel !== 'undefined') {
        this.setNodeLevel(node, refLevel);
      }
    }
  }

  /**
   * 获取节点的业务属性（converter扩展的属性）
   */
  getNodeBusinessData(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node || !node.data) return {};

    return {
      type: this.getNodeType(node),
      level: this.getNodeLevel(node),
      raw: node.data.raw || '',
      fullPath: node.data.fullPath || '',
      siblingNodes: node.data.siblingNodes || [],
      ordered: node.data.ordered || node.ordered || false,
      marker: node.data.marker || node.marker || '-',
      // 可以扩展更多业务属性
      ...node.data
    };
  }

  /**
   * 获取节点的完整路径
   */
  getNodeFullPath(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node) return '';

    // 优先使用全局的getNodeFullPath函数（如果存在）
    try {
      if (typeof window.getNodeFullPath === 'function') return window.getNodeFullPath(node);
    } catch (_) { }

    // 其次使用缓存的fullPath
    const businessData = this.getNodeBusinessData(node);
    if (businessData.fullPath) {
      return businessData.fullPath;
    }

    // 最后动态计算路径
    const path = [];
    let current = node;
    while (current) {
      path.unshift(current.topic || '');
      current = this.getParentNode(current);
    }
    return path.join(' / ');
  }

  // ==================== 基础修改操作 ====================

  /**
   * 更新节点主题
   */
  updateNodeTopic(nodeOrId, newTopic) {
    const node = this.getNode(nodeOrId);
    if (!node) {
      console.warn('节点不存在:', nodeOrId);
      return false;
    }

    if (!newTopic || newTopic.trim() === '') {
      console.warn('节点主题不能为空');
      return false;
    }

    try {
      this.jm.update_node(node.id, newTopic);
      return true;
    } catch (error) {
      console.error('更新节点主题失败:', error);
      return false;
    }
  }

  /**
   * 更新节点备注（自动处理多种存储位置）
   */
  updateNodeNotes(nodeOrId, notes) {
    const node = this.getNode(nodeOrId);
    if (!node) {
      console.warn('节点不存在:', nodeOrId);
      return false;
    }

    try {
      // 优先存储在node.data.notes中（推荐方式，兼容现有代码）
      if (!node.data) {
        node.data = {};
      }
      node.data.notes = notes || '';

      // 同时保持兼容性，也设置node.notes
      node.notes = notes || '';

      // 更新DOM元素（如果存在）
      try {
        const notesElement = document.getElementById('nodeNotes');
        if (notesElement) {
          notesElement.value = notes || '';
        }
      } catch (_) { }

      // 触发视图更新
      this.jm.view.update_node(node);
      return true;
    } catch (error) {
      console.error('更新节点备注失败:', error);
      return false;
    }
  }

  /**
   * 更新节点的业务属性
   */
  updateNodeBusinessData(nodeOrId, businessData) {
    const node = this.getNode(nodeOrId);
    if (!node) {
      console.warn('节点不存在:', nodeOrId);
      return false;
    }

    try {
      if (!node.data) {
        node.data = {};
      }

      // 合并业务数据
      Object.assign(node.data, businessData);

      // 触发视图更新
      this.jm.view.update_node(node);
      return true;
    } catch (error) {
      console.error('更新节点业务数据失败:', error);
      return false;
    }
  }

  // ==================== 节点结构操作 ====================

  /**
   * 添加子节点
   */
  addChildNode(parentNodeOrId, nodeId, topic, data = {}) {
    const parentNode = this.getNode(parentNodeOrId);
    if (!parentNode) {
      console.warn('父节点不存在:', parentNodeOrId);
      return null;
    }

    if (!nodeId) {
      nodeId = 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    try {
      const newNode = this.jm.add_node(parentNode, nodeId, topic, data);
      return newNode;
    } catch (error) {
      console.error('添加子节点失败:', error);
      return null;
    }
  }

  /**
   * 添加兄弟节点（在选中节点后）
   */
  addSiblingNode(nodeOrId, newNodeId, topic, data = {}) {
    const node = this.getNode(nodeOrId);
    if (!node) {
      console.warn('节点不存在:', nodeOrId);
      return null;
    }

    if (node.isroot) {
      console.warn('不能为根节点添加兄弟节点');
      return null;
    }

    if (!newNodeId) {
      newNodeId = 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    try {
      const newNode = this.jm.insert_node_after(node, newNodeId, topic, data);
      return newNode;
    } catch (error) {
      console.error('添加兄弟节点失败:', error);
      return null;
    }
  }

  /**
   * 删除节点
   */
  removeNode(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node) {
      console.warn('节点不存在:', nodeOrId);
      return false;
    }

    if (node.isroot) {
      console.warn('不能删除根节点');
      return false;
    }

    try {
      this.jm.remove_node(node);
      return true;
    } catch (error) {
      console.error('删除节点失败:', error);
      return false;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取父节点
   */
  getParentNode(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node || !node.parent) return null;
    return node.parent;
  }

  /**
   * 获取子节点列表
   */
  getChildNodes(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node || !Array.isArray(node.children)) return [];
    return node.children;
  }

  /**
   * 获取兄弟节点（排除自己）
   */
  getSiblingNodes(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node || !node.parent || !Array.isArray(node.parent.children)) return [];

    return node.parent.children.filter(child => child && child.id !== node.id);
  }

  /**
   * 获取同级节点主题列表（以逗号分隔的字符串）
   * @param {string|object} nodeOrId - 节点ID或节点对象
   * @param {string} separator - 分隔符，默认为', '
   * @returns {string} 同级节点主题列表，过滤掉空值
   */
  getSiblingTopics(nodeOrId, separator = ', ') {
    try {
      const siblings = this.getSiblingNodes(nodeOrId);
      return siblings
        .map(sibling => sibling.topic || '')
        .filter(Boolean)
        .join(separator);
    } catch (error) {
      console.warn('获取同级节点主题列表失败:', error);
      return '';
    }
  }

  /**
   * 判断节点是否有备注
   */
  hasNotes(nodeOrId) {
    const notes = this.getNodeNotes(nodeOrId);
    return notes && notes.trim().length > 0;
  }

  /**
   * 获取节点的基本信息（用于调试和显示）
   */
  getNodeInfo(nodeOrId) {
    const node = this.getNode(nodeOrId);
    if (!node) return null;

    return {
      id: node.id,
      topic: node.topic,
      isroot: node.isroot,
      expanded: node.expanded,
      direction: node.direction,
      notes: this.getNodeNotes(node),
      businessData: this.getNodeBusinessData(node),
      childCount: this.getChildNodes(node).length,
      hasNotes: this.hasNotes(node),
      fullPath: this.getNodeFullPath(node)
    };
  }
}

// ==================== 使用示例和集成 ====================

/**
 * 全局节点操作器实例
 */
window.mindNodeOperator = null;

/**
 * 使用示例：
 * 
 * // 初始化操作器
 * const nodeOperator = new MindNodeOperator(jm);
 * 
 * // 获取选中节点
 * const selectedNode = nodeOperator.getSelectedNode();
 * 
 * // 获取节点备注（兼容现有代码的多种存储位置）
 * const notes = nodeOperator.getNodeNotes(selectedNode);
 * 
 * // 获取节点类型（兼容node.type、node.data.type、node.data.data.type）
 * const nodeType = nodeOperator.getNodeType(selectedNode);
 * 
 * // 获取节点层级
 * const nodeLevel = nodeOperator.getNodeLevel(selectedNode);
 * 
 * // 更新节点主题
 * nodeOperator.updateNodeTopic(selectedNode, '新主题');
 * 
 * // 更新节点备注（同时更新node.data.notes、node.notes和DOM元素）
 * nodeOperator.updateNodeNotes(selectedNode, '新的备注内容');
 * 
 * // 添加子节点
 * const newNode = nodeOperator.addChildNode(selectedNode, null, '子节点主题');
 * 
 * // 删除节点
 * nodeOperator.removeNode(selectedNode);
 * 
 * // 强制设置为列表类型（兼容现有代码的列表处理）
 * nodeOperator.forceListType(selectedNode);
 * 
 * // 根据同级或父节点对齐类型
 * nodeOperator.applySiblingOrParentType(selectedNode);
 * 
 * // 获取同级节点主题列表（用于AI提示等场景）
 * const siblingTopics = nodeOperator.getSiblingTopics(selectedNode);
 * 
 * // 与现有代码集成示例：
 * // 在ai-handler.js中替换原有的复杂节点操作
 * function _buildPlaceholders(selectedNode) {
 *   const nodeOperator = getMindNodeOperator();
 *   const node = nodeOperator.getNode(selectedNode);
 *   const topic = nodeOperator.getNodeTopic(node);
 *   const notes = nodeOperator.getNodeNotes(node);
 *   const fullPath = nodeOperator.getNodeFullPath(node);
 *   const siblingTopics = nodeOperator.getSiblingTopics(selectedNode);
 *   // ... 其他逻辑
 * }
 */
function initMindNodeOperator() {
  if (window.jm) {
    window.mindNodeOperator = new MindNodeOperator(window.jm);
    console.log('节点操作器初始化成功');
    return true;
  } else {
    console.error('jsmind实例未找到，无法初始化节点操作器');
    return false;
  }
}

/**
 * 获取节点操作器（懒加载）
 */
function getMindNodeOperator() {
  if (!window.mindNodeOperator) {
    initMindNodeOperator();
  }
  return window.mindNodeOperator;
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MindNodeOperator, initMindNodeOperator, getMindNodeOperator };
}