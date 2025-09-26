/**
 * Markdown 转 AST 转换器
 * 将Markdown文本解析为结构化的AST
 */

import { ASTNode } from './ast-node.js';

export class MdToAstConverter {
  constructor() {
    this.reset();
  }

  reset() {
    this.lineNumber = 0;
    this.nodeId = 1;
  }

  generateId() {
    return `node_${this.nodeId++}`;
  }

  /**
   * 将Markdown文本转换为AST
   * @param {string} markdown - Markdown文本
   * @returns {Object} AST根节点或节点数组
   */
  convert(markdown) {
    this.reset();
    const lines = markdown.split('\n');

    // 创建临时根节点用于解析
    const tempRoot = new ASTNode({
      id: this.generateId(),
      type: 'Document',
      name: 'Root',
      raw: markdown
    });

    this.parseBlocks(lines, tempRoot);
    
    // 如果第一层只有一个节点，则直接返回该节点，并调整其深度
    if (tempRoot.children.length === 1) {
      const singleNode = tempRoot.children[0];
      this.adjustDepths(singleNode, -1);
      return singleNode;
    }
    
    // 如果第一层有多个节点，则返回根节点
    return tempRoot;
  }

  /**
   * 解析块级元素
   * @private
   */
  parseBlocks(lines, parent) {
    let i = 0;
    let currentNotes = [];
    let lastNode = null;

    const stack = [{
      node: parent,
      level: 0,
      indent: 0,
      depth: 0
    }];

    while (i < lines.length) {
      const line = lines[i];
      const lineNum = i + 1;

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);

      if (headingMatch || listMatch) {
        // 处理前一个节点的备注
        if (lastNode) {
          lastNode.notes = currentNotes.join('\n').trim();
        }
        currentNotes = [];

        let newNode;
        if (headingMatch) {
          newNode = this.createHeadingNode(headingMatch, lineNum, line);
        } else {
          newNode = this.createListNode(listMatch, lineNum, line);
        }

        this.addToTree(stack, newNode);
        lastNode = newNode;
      } else {
        if (lastNode || parent.children.length > 0) {
          currentNotes.push(line);
        }
      }

      i++;
    }

    if (lastNode) {
      lastNode.notes = currentNotes.join('\n').trim();
    }

    this.calculateDepths(parent, 1);
  }

  createHeadingNode(match, lineNum, rawLine) {
    const level = match[1].length;
    const name = match[2].trim();

    return new ASTNode({
      id: this.generateId(),
      type: 'heading',
      name: name,
      level: level,
      raw: rawLine,
      parent: null,
      children: []
    });
  }

  createListNode(match, lineNum, rawLine) {
    const indent = match[1].length;
    const marker = match[2];
    const name = match[3].trim();
    const isOrdered = /^\d+\./.test(marker);

    return new ASTNode({
      id: this.generateId(),
      type: 'list',
      name: name,
      ordered: isOrdered,
      marker: marker,
      indent: indent,
      raw: rawLine,
      parent: null,
      children: []
    });
  }

  addToTree(stack, node) {
    // 根据节点类型选择合适的父节点
    if (node.type === 'heading') {
      this.addHeadingToTree(stack, node);
    } else {
      this.addListToTree(stack, node);
    }
  }

  addHeadingToTree(stack, node) {
    // 找到合适的标题父节点
    for (let i = stack.length - 1; i >= 0; i--) {
      const info = stack[i];
      if (info.node.type === 'heading' && info.level < node.level) {
        info.node.addChild(node);
        this.updateStackForHeading(stack, node);
        return;
      }
    }
    
    stack[0].node.addChild(node);
    this.updateStackForHeading(stack, node);
  }

  addListToTree(stack, node) {
    // 找到合适的列表父节点
    let parentFound = false;
    
    // 根据缩进规则查找父节点（每2个空格为一级）
    const expectedParentIndent = node.indent - 2;
    
    for (let i = stack.length - 1; i >= 0; i--) {
      const info = stack[i];
      // 查找缩进正好少2个空格的列表节点作为父节点
      if (info.node.type === 'list' && info.indent === expectedParentIndent) {
        info.node.addChild(node);
        this.updateStackForList(stack, node);
        parentFound = true;
        break;
      }
    }
    
    if (!parentFound) {
      // 查找最近的标题或文档作为父节点
      for (let i = stack.length - 1; i >= 0; i--) {
        const info = stack[i];
        if (info.node.type === 'heading' || info.node.type === 'Document') {
          info.node.addChild(node);
          this.updateStackForList(stack, node);
          break;
        }
      }
    }
  }

  updateStackForList(stack, node) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= node.indent) {
      stack.pop();
    }
    stack.push({
      node: node,
      indent: node.indent,
      depth: stack[stack.length - 1].depth + 1
    });
  }

  updateStackForHeading(stack, node) {
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    stack.push({
      node: node,
      level: node.level,
      depth: stack[stack.length - 1].depth + 1
    });
  }

  calculateDepths(node, depth) {
    node.depth = depth;
    node.children.forEach(child => {
      this.calculateDepths(child, depth + 1);
    });
  }

  /**
   * 调整节点深度
   * @param {Object} node - AST节点
   * @param {number} adjustment - 调整值
   * @private
   */
  adjustDepths(node, adjustment) {
    node.depth += adjustment;
    node.children.forEach(child => {
      this.adjustDepths(child, adjustment);
    });
  }

  /**
   * 获取AST统计信息
   * @param {Object} ast - AST根节点
   * @returns {Object} 统计信息
   */
  getStats(ast) {
    const stats = {
      totalNodes: 0,
      headings: 0,
      lists: 0,
      maxDepth: 0
    };

    const traverse = (node, depth) => {
      stats.totalNodes++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      if (node.type === 'heading') {
        stats.headings++;
      } else if (node.type === 'list') {
        stats.lists++;
      }

      node.children.forEach(child => {
        traverse(child, depth + 1);
      });
    };

    // 如果是单个节点而非根节点，从深度0开始遍历
    if (!ast.type || ast.type !== 'Document') {
      traverse(ast, 0);
    } else {
      traverse(ast, 1);
    }
    return stats;
  }
}