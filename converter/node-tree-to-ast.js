/**
 * jsMind节点树转AST转换器
 * 将jsMind的node_tree格式转换为AST结构
 */

import { ASTNode } from './ast-node.js';

export class NodeTreeToAstConverter {
  constructor() {
    this.lineCounter = 0;
  }

  /**
   * 将node_tree格式转换为AST
   * 直接转换data内的所有节点，不创建文档根节点
   */
  convert(nodeTree) {
    if (!nodeTree) return null;

    this.lineCounter = 0;

    // 直接提取data部分，忽略元数据结构
    let data = nodeTree.data || nodeTree;

    // 处理不同格式的数据
    if (data.format === 'node_tree') {
      // 如果是嵌套的node_tree，提取内部的data
      data = data.data || data;
    } else if (data.format === 'node_array') {
      // 将node_array转换为node_tree格式
      data = this.convertNodeArrayToTree(data.data || data);
    }

    // 直接转换节点，不创建文档根节点
    if (Array.isArray(data)) {
      // 多个根节点 - 返回节点数组
      return data.map(node => this.convertNode(node, 1, { type: 'Document', level: null }, 0, null)).filter(Boolean);
    } else {
      // 单个根节点 - 返回单个节点
      return this.convertNode(data, 1, { type: 'Document', level: null }, 0, null);
    }
  }

  /**
   * 转换单个节点
   */
  convertNode(node, depth = 0, parentInfo = { type: 'Document', level: null }, parentIndent = 0, parentNode = null) {
    if (!node) return null;

    const topic = node.topic || '';
    const data = node.data || {};

    // 根据主题与上下文推断节点类型（传入 node、parentInfo、parentNode 以支持同级判断）
    const nodeType = this.inferNodeType(topic, data, node, parentInfo, parentNode);
    
    // 优先使用节点中已有的depth值，如果没有则使用默认值
    const nodeDepth = node.depth !== undefined ? node.depth : depth;
    
    // 计算缩进：优先使用保存的 indent，否则根据节点类型和父节点计算
    let indent = 0;
    // 优先使用保存的 indent 信息（如果存在）
    if (data && typeof data.indent !== 'undefined' && data.indent !== null) {
      indent = data.indent;
    } else if (nodeType.type === 'list') {
      if (parentInfo && (parentInfo.type === 'heading' || parentInfo.type === 'Document')) {
        // 标题或文档下的直属列表节点，缩进为0
        indent = 0;
      } else if (parentInfo && parentInfo.type === 'list') {
        // 列表下的子级列表节点，在父级缩进基础上+2个空格
        indent = parentIndent + 2;
      }
    } else {
      // 非列表节点保持父级缩进
      indent = parentIndent;
    }
    
    // 保留fullPath和siblingNodes字段（如果存在）
    const fullPath = data.fullPath || '';
    const siblingNodes = data.siblingNodes || [];
    
    const astNode = new ASTNode({
      id: node.id,  // 保持与NodeTree相同的ID
      type: nodeType.type,
      name: nodeType.name,
      notes: node.notes || '',  // 从节点根级别读取notes，而不是data.notes
      level: nodeType.level,
      ordered: nodeType.ordered,
      marker: nodeType.marker,
      indent: indent,
      depth: nodeDepth,  // 显式传递depth值
      parent: null,  // 父节点将在addChild方法中设置
      fullPath: fullPath,  // 传递完整路径
      siblingNodes: siblingNodes,  // 传递兄弟节点列表
      children: []
    });

    // 处理子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        const childNode = this.convertNode(child, nodeDepth + 1, nodeType, indent, node);
        if (childNode) {
          astNode.addChild(childNode);
        }
      });
    }

    return astNode;
  }

  /**
   * 推断节点类型（基于存储的元数据或主题内容）
   */
  inferNodeType(topic, data, node, parentInfo, parentNode) {
    const result = {
      type: 'list',
      name: (topic || '').trim(),
      level: null,
      ordered: false,
      marker: '-'
    };

    if (!topic) return result;

    // 1) 优先使用 data.type；2) 否则回退使用 node.type（根级）
    const hintedType = (data && data.type) ? data.type : (node && typeof node.type !== 'undefined' ? node.type : undefined);
    if (hintedType) {
      const type = hintedType;
      const lvl = (data && data.level != null) ? data.level : (node && node.level != null ? node.level : null);
      const ord = (data && data.ordered != null) ? data.ordered : (node && node.ordered != null ? node.ordered : false);
      const mrk = (data && data.marker != null) ? data.marker : (node && node.marker != null ? node.marker : (ord ? '1.' : '-'));

      if (type === 'heading') {
        return {
          type: 'heading',
          name: (topic || '').trim(),
          level: lvl || 1,
          ordered: false,
          marker: null
        };
      }

      if (type === 'list') {
        return {
          type: 'list',
          name: (topic || '').trim(),
          level: null,
          ordered: !!ord,
          marker: mrk || '-'
        };
      }

      // 其他类型透传
      return {
        type: type,
        name: (topic || '').trim(),
        level: lvl != null ? lvl : null,
        ordered: !!ord,
        marker: mrk != null ? mrk : null
      };
    }

    // 如果没有data.type，则根据主题内容智能推断
    // 检测可能的标题（纯文本，可能是h1-h6）
    // 根据节点在树中的位置和深度推断

    // 同级优先规则：若同级有标题，则采用同级标题的级别；若同级无标题但有列表，则采用同级列表的标识
    if (parentNode && parentNode.children && parentNode.children.length > 0) {
      const siblings = parentNode.children.filter(s => s && s.id !== (node && node.id));
      if (siblings.length > 0) {
        // 查找同级中的标题（放宽判断：显式类型或存在level字段）
        let headingSibling = null;
        for (const s of siblings) {
          const st = (s.data && s.data.type) ? s.data.type : (typeof s.type !== 'undefined' ? s.type : undefined);
          const isHeading = st === 'heading' || (s.data && s.data.level != null) || (s.level != null);
          if (isHeading) {
            headingSibling = s;
            break;
          }
        }
        if (headingSibling) {
          const lvl = (headingSibling.data && headingSibling.data.level != null)
            ? headingSibling.data.level
            : (headingSibling.level != null ? headingSibling.level : 1);
          return {
            type: 'heading',
            name: (topic || '').trim(),
            level: Math.min((lvl || 1), 6),
            ordered: false,
            marker: null
          };
        }

        // 若同级无标题，则看是否存在列表同级（放宽判断：显式类型或存在ordered/marker特征）
        let listSibling = null;
        for (const s of siblings) {
          const st = (s.data && s.data.type) ? s.data.type : (typeof s.type !== 'undefined' ? s.type : undefined);
          const isList = st === 'list'
            || (s.data && (s.data.ordered != null || s.data.marker != null))
            || (s.ordered != null || s.marker != null);
          if (isList) {
            listSibling = s;
            break;
          }
        }
        if (listSibling) {
          const ord = (listSibling.data && listSibling.data.ordered != null)
            ? listSibling.data.ordered
            : (listSibling.ordered != null ? listSibling.ordered : false);
          const mrk = (listSibling.data && listSibling.data.marker != null)
            ? listSibling.data.marker
            : (listSibling.marker != null ? listSibling.marker : (ord ? '1.' : '-'));
          return {
            type: 'list',
            name: (topic || '').trim(),
            level: null,
            ordered: !!ord,
            marker: mrk
          };
        }
      }
    }

    // 如果没有显式类型也没有同级提示，但父节点是标题：
    // - 父为H6时，子节点强制为列表
    // - 否则子为父级+1标题（封顶H6）
    if (parentInfo && parentInfo.type === 'heading') {
      const parentLevel = parentInfo.level || 1;
      if (parentLevel >= 6) {
        return {
          type: 'list',
          name: (topic || '').trim(),
          level: null,
          ordered: false,
          marker: '-'
        };
      }
      return {
        type: 'heading',
        name: (topic || '').trim(),
        level: Math.min(parentLevel + 1, 6),
        ordered: false,
        marker: null
      };
    }

    // 默认作为列表项处理
    return result;
  }

  /**
   * 将node_array转换为node_tree格式
   */
  convertNodeArrayToTree(nodeArray) {
    if (!Array.isArray(nodeArray) || nodeArray.length === 0) {
      return [];
    }

    // 创建节点映射
    const nodeMap = new Map();
    const rootNodes = [];

    // 首先创建所有节点
    nodeArray.forEach(node => {
      nodeMap.set(node.id, {
        ...node,
        children: []
      });
    });

    // 构建树结构
    nodeArray.forEach(node => {
      const treeNode = nodeMap.get(node.id);
      if (node.parentid && nodeMap.has(node.parentid)) {
        const parent = nodeMap.get(node.parentid);
        if (!parent.children) parent.children = [];
        parent.children.push(treeNode);
      } else {
        rootNodes.push(treeNode);
      }
    });

    return rootNodes.length === 1 ? rootNodes[0] : rootNodes;
  }

  /**
   * 批量转换多个节点树
   */
  convertBatch(nodeTrees) {
    if (!Array.isArray(nodeTrees)) return [];
    
    return nodeTrees.map(tree => this.convert(tree)).filter(Boolean);
  }

  /**
   * 获取转换统计信息
   */
  getStats(ast) {
    const stats = {
      totalNodes: 0,
      headings: 0,
      lists: 0,
      maxDepth: 0
    };

    if (!ast) return stats;

    const traverse = (node, depth = 0) => {
      stats.totalNodes++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      switch (node.type) {
        case 'heading':
        case 'title':
          stats.headings++;
          break;
        case 'list':
          stats.lists++;
          break;
      }

      node.children.forEach(child => traverse(child, depth + 1));
    };

    traverse(ast);
    
    return stats;
  }

  /**
   * 设置行号起始值
   */
  setLineStart(line) {
    this.lineCounter = Math.max(0, line || 0);
  }
}