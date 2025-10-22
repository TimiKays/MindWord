/**
 * 转换器统一入口
 * 提供Markdown、AST、NodeTree之间的双向转换
 */

import { MdToAstConverter } from './md-to-ast.js';
import { AstToMdConverter } from './ast-to-md.js';
import { AstToNodeTreeConverter } from './ast-to-node-tree.js';
import { NodeTreeToAstConverter } from './node-tree-to-ast.js';

/**
 * 转换器管理器
 * 统一管理所有转换器，提供便捷的API
 */
export class ConverterManager {
  constructor() {
    console.log('ConverterManager: 初始化转换器管理器');

    try {
      this.mdToAstConverter = new MdToAstConverter();
      console.log('✅ MdToAstConverter 初始化成功', this.mdToAstConverter);
    } catch (e) {
      console.error('❌ MdToAstConverter 初始化失败:', e);
    }

    try {
      this.astToMdConverter = new AstToMdConverter();
      console.log('✅ AstToMdConverter 初始化成功', this.astToMdConverter);
    } catch (e) {
      console.error('❌ AstToMdConverter 初始化失败:', e);
    }

    try {
      this.astToNodeTreeConverter = new AstToNodeTreeConverter();
      console.log('✅ AstToNodeTreeConverter 初始化成功', this.astToNodeTreeConverter);
    } catch (e) {
      console.error('❌ AstToNodeTreeConverter 初始化失败:', e);
    }

    try {
      this.nodeTreeToAstConverter = new NodeTreeToAstConverter();
      console.log('✅ NodeTreeToAstConverter 初始化成功', this.nodeTreeToAstConverter);
    } catch (e) {
      console.error('❌ NodeTreeToAstConverter 初始化失败:', e);
    }

    console.log('ConverterManager: 所有转换器初始化完成');
  }

  /**
   * Markdown -> AST
   */
  mdToAst(markdown) {
    console.log('ConverterManager.mdToAst: 开始转换', { markdown: markdown.substring(0, 100) + '...' });

    if (!this.mdToAstConverter) {
      console.error('❌ this.mdToAstConverter 未定义或初始化失败');
      throw new Error('MdToAstConverter 未正确初始化');
    }

    if (typeof this.mdToAstConverter.convert !== 'function') {
      console.error('❌ this.mdToAstConverter.convert 不是一个函数', this.mdToAstConverter);
      throw new Error('MdToAst.convert 不是一个函数');
    }

    try {
      const result = this.mdToAstConverter.convert(markdown);
      console.log('✅ mdToAst 转换成功', result);
      return result;
    } catch (error) {
      console.error('❌ mdToAst 转换失败:', error);
      throw error;
    }
  }

  /**
   * AST -> Markdown
   */
  astToMd(ast) {
    return this.astToMdConverter.convert(ast);
  }

  /**
   * AST -> NodeTree
   */
  astToNodeTree(ast) {
    return this.astToNodeTreeConverter.convert(ast);
  }

  /**
   * NodeTree -> AST
   */
  nodeTreeToAst(nodeTree) {
    return this.nodeTreeToAstConverter.convert(nodeTree);
  }

  /**
   * Markdown -> NodeTree (通过AST)
   */
  mdToNodeTree(markdown) {
    const ast = this.mdToAst(markdown);
    return this.astToNodeTreeConverter.convert(ast);
  }

  /**
   * NodeTree -> Markdown (通过AST)
   */
  nodeTreeToMd(nodeTree) {
    const ast = this.nodeTreeToAst(nodeTree);
    return this.astToMdConverter.convert(ast);
  }

  /**
   * 获取转换统计信息
   */
  getStats(data, format) {
    switch (format) {
      case 'markdown':
        const ast = this.mdToAst(data);
        return {
          ast: this.astToMdConverter.getStats(ast),
          nodeTree: this.mdToNodeTree(data) ?
            this.astToNodeTreeConverter.getStats(this.mdToNodeTree(data)) : null
        };

      case 'ast':
        return {
          ast: this.astToMdConverter.getStats(data),
          nodeTree: this.astToNodeTreeConverter.getStats(this.astToNodeTree(data))
        };

      case 'nodeTree':
        const convertedAst = this.nodeTreeToAst(data);
        return {
          ast: this.astToMdConverter.getStats(convertedAst),
          nodeTree: this.astToNodeTreeConverter.getStats(data)
        };

      default:
        return null;
    }
  }

  /**
   * 验证转换结果
   */
  validate(data, format) {
    try {
      switch (format) {
        case 'markdown':
          return typeof data === 'string' && data.trim().length > 0;

        case 'ast':
          return data && typeof data === 'object' && data.type;

        case 'nodeTree':
          return data &&
            typeof data === 'object' &&
            (data.format === 'node_tree' || data.format === 'node_array') &&
            data.data;

        default:
          return false;
      }
    } catch (error) {
      console.error('验证失败:', error);
      return false;
    }
  }

  /**
   * 双向验证（往返转换测试）
   */
  roundTripTest(input, inputFormat) {
    try {
      let result = {};

      if (inputFormat === 'markdown') {
        const ast = this.mdToAst(input);
        const nodeTree = this.astToNodeTree(ast);
        const backToAst = this.nodeTreeToAst(nodeTree);
        const backToMd = this.astToMd(backToAst);

        result = {
          success: input.trim() === backToMd.trim(),
          original: input,
          converted: backToMd,
          ast: ast,
          nodeTree: nodeTree
        };
      } else if (inputFormat === 'nodeTree') {
        const ast = this.nodeTreeToAst(input);
        const markdown = this.astToMd(ast);
        const backToAst = this.mdToAst(markdown);
        const backToNodeTree = this.astToNodeTree(backToAst);

        result = {
          success: JSON.stringify(input) === JSON.stringify(backToNodeTree),
          original: input,
          converted: backToNodeTree,
          ast: ast,
          markdown: markdown
        };
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 导出所有转换器
export {
  MdToAstConverter,
  AstToMdConverter,
  AstToNodeTreeConverter,
  NodeTreeToAstConverter
};

// 默认导出管理器
export { ConverterManager as default };