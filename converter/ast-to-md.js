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

    // 统一清理标题名称：去掉整段被 ** 包裹的粗体标记，避免生成形如 "#### **标题**"
    // 只处理首尾成对的 **，中间保留普通粗体格式
    const sanitizeHeadingText = (text) => {
      if (!text) return '';
      const trimmed = String(text).trim();
      const m = trimmed.match(/^\*\*(.+)\*\*$/);
      return m ? m[1].trim() : trimmed;
    };

    // 将 HTML 的 <strong> 标签转换回 Markdown 的 **文本** 格式
    const convertHtmlBoldToMarkdown = (text) => {
      if (!text || typeof text !== 'string') return text;
      // 将 <strong>文本</strong> 转换为 **文本**
      return text.replace(/<strong>([^<]+?)<\/strong>/gi, '**$1**');
    };

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
        // 先将 HTML 的 <strong> 转换回 **文本**，然后再清理标题首尾的 **
        const headingNameWithBold = convertHtmlBoldToMarkdown(node.name);
        const headingText = sanitizeHeadingText(headingNameWithBold);
        markdown = `${prefix} ${headingText}`;
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
        // 优先使用保存的 marker，如果没有则根据 ordered 判断
        const marker = node.marker || (node.ordered ? '1.' : '-');
        // 列表节点的缩进应该使用 node.indent（如果存在），否则使用 depth 计算
        const listIndent = (node.indent !== undefined && node.indent !== null) 
          ? ' '.repeat(node.indent) 
          : indent;
        // 将 HTML 的 <strong> 标签转换回 Markdown 的 **文本** 格式
        const listName = convertHtmlBoldToMarkdown(node.name);
        markdown = `${listIndent}${marker} ${listName}`;
        if (node.notes) {
          markdown += `\n${listIndent}  ${node.notes}`;
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
        const titleNameWithBold = convertHtmlBoldToMarkdown(node.name);
        markdown = `${titlePrefix} ${sanitizeHeadingText(titleNameWithBold)}`;
        break;

      default:
        // 未知类型，按文本处理
        const defaultName = convertHtmlBoldToMarkdown(node.name || '');
        markdown = defaultName;
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