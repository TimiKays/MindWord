/**
 * AST转Markdown转换器
 * 将AST结构转换回Markdown文本
 */

import { ASTNode } from './ast-node.js';

export class AstToMdConverter {
  constructor() {
    this.indentSize = 2;
  }

  /**
   * 转换AST为Markdown
   */
  convert(ast) {
    if (!ast) return '';
    
    return this.convertNode(ast, 0).trim();
  }

  /**
   * 转换单个节点
   */
  convertNode(node, depth = 0) {
    if (!node) return '';

    let markdown = '';
    const indent = ' '.repeat(depth * this.indentSize);

    switch (node.type) {
      case 'document':
      case 'Document':
        // 文档根节点，只处理子节点
        markdown = node.children
          .map(child => this.convertNode(child, depth))
          .join('\n\n');
        break;

      case 'heading':
        const level = Math.min(Math.max(node.level || 1, 1), 6);
        const prefix = '#'.repeat(level);
        markdown = `${prefix} ${node.name}`;
        if (node.notes) {
          markdown += `\n${indent}  ${node.notes}`;
        }
        
        // 处理子节点（通常是列表项）
        if (node.children.length > 0) {
          markdown += '\n\n' + node.children
            .map(child => this.convertNode(child, depth))
            .join('\n');
        }
        break;

      case 'list':
        const marker = node.ordered ? '1.' : '-';
        markdown = `${indent}${marker} ${node.name}`;
        if (node.notes) {
          markdown += `\n${indent}  ${node.notes}`;
        }
        
        // 处理子节点（嵌套列表项）
        if (node.children.length > 0) {
          markdown += '\n' + node.children
            .map(child => this.convertNode(child, depth + 1))
            .join('\n');
        }
        break;

      case 'title':
        // 标题节点（兼容旧格式）
        const titleLevel = Math.min(Math.max(node.level || 1, 1), 6);
        const titlePrefix = '#'.repeat(titleLevel);
        markdown = `${titlePrefix} ${node.name}`;
        break;

      default:
        // 未知类型，按文本处理
        markdown = node.name || '';
        if (node.notes) {
          markdown += `\n${indent}  ${node.notes}`;
        }
    }

    return markdown;
  }

  /**
   * 批量转换多个AST节点
   */
  convertBatch(nodes) {
    if (!Array.isArray(nodes)) return '';
    
    return nodes
      .map(node => this.convert(node))
      .join('\n\n---\n\n');
  }

  /**
   * 设置缩进大小
   */
  setIndentSize(size) {
    this.indentSize = Math.max(1, size || 2);
  }

  /**
   * 获取转换统计信息
   */
  getStats(ast) {
    const stats = {
      totalNodes: 0,
      headings: 0,
      lists: 0,
      lines: 0
    };

    if (!ast) return stats;

    const traverse = (node) => {
      stats.totalNodes++;
      
      switch (node.type) {
        case 'heading':
        case 'title':
          stats.headings++;
          break;
        case 'list':
          stats.lists++;
          break;
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    // 如果ast是数组，遍历数组中的每个节点
    if (Array.isArray(ast)) {
      ast.forEach(traverse);
    } else {
      traverse(ast);
    }
    
    stats.lines = this.convert(ast).split('\n').length;
    
    return stats;
  }
}