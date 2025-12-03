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
 * AST节点模型
 * 定义AST节点的基本结构和行为
 * # 规则概述：
## 节点定义：
标题节点（title）：所有 # 标题
列表节点（list）：所有有序列表（1. xxx）和所有无序列表（- xxx, * xxx, + xxx）
普通文本行和图片在任何情况下不作为单独节点，只作为备注。
列表节点只能是标题节点的子节点，不可作为标题节点的同级节点或父节点；

## 备注（节点属性）：
如果在某个节点下面出现段落（即一段或多段普通文字，没有标题、没有列表，只是文字或图片），这些文字都归属到最近的那个节点，作为备注。
如果有连续的多个段落，作为其往上最近的一个节点的备注内容。

## AST JSON属性说明：
在AST解析中，只有两种节点类型：**title**（标题节点）和**list**（列表节点），其他所有内容都作为节点的content属性。

### 通用属性：
- **id**: 唯一标识符，例如 `node_1`。
- **type**: 节点类型，值为 `"title"` 或 `"list"`。
- **name**: 节点的主要文本内容，例如标题文本或列表项文本。
<!-- - **raw**: 节点对应的原始 Markdown 文本行。 -->
- **notes**: 节点的备注内容，包含所有非标题、非列表的补充文本，直到下一个节点为止。
<!-- - **lineStart**: 节点在原始 Markdown 文本中的起始行号（从 1 开始计数）。
- **lineEnd**: 节点在原始 Markdown 文本中的结束行号（包含备注内容的最后一行）。 -->
- **depth**: 节点在 AST 树中的深度，根节点（Document）的子节点深度为 1，以此类推。
- **children**: 子节点数组，包含当前节点的所有子节点。

### 标题节点特有属性：
- **level**: 标题级别（1-6，对应 # 到 ######）

### 列表节点特有属性：
<!-- - **ordered**: 布尔值，表示是否为有序列表（`true` 表示 `1.`, `2.` 等；`false` 表示 `-`, `*`, `+` 等）。 -->
- **marker**: 列表标记符号，例如 `"-"`, `"*"`, `"+"`, `"1."` 等。
- **indent**: 列表项的缩进空格数，用于判断列表的层级关系。

 */

export class ASTNode {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.type = options.type || 'unknown'; // heading, list, document，其中document节点不同步给markdown，如果一级节点大于1个才同步给nodeTree
    this.name = options.name || ''; //节点名称，或者叫节点标题
    this.notes = options.notes || ''; //节点备注

    // 特定类型的属性
    this.level = options.level || null;      // 标题级别 (1-6)
    this.ordered = options.ordered || false; // 列表是否有序
    this.marker = options.marker || null;    // 列表标记
    this.indent = options.indent || 0;       // 缩进空格数

    // 位置信息
    this.raw = options.raw || '';
    this.depth = options.depth || 1;

    // 父节点引用
    this.parent = options.parent || null;

    // 子节点
    this.children = options.children || [];
    
    // 新增字段
    this.fullPath = options.fullPath || ''; // 完整路径，包含所有父级节点
    this.siblingNodes = options.siblingNodes || []; // 兄弟节点名称列表
  }

  generateId() {
    return 'node_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 添加子节点
   */
  addChild(node) {
    if (!(node instanceof ASTNode)) {
      node = new ASTNode(node);
    }
    // 设置子节点的父节点引用
    node.parent = this;
    this.children.push(node);
    return this;
  }

  /**
   * 移除子节点
   */
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index > -1) {
      this.children.splice(index, 1);
    }
    return this;
  }

  /**
   * 查找子节点
   */
  findChild(predicate) {
    return this.children.find(predicate);
  }

  /**
   * 遍历所有子节点
   */
  traverse(callback, depth = 0) {
    callback(this, depth);
    this.children.forEach(child => {
      child.traverse(callback, depth + 1);
    });
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      notes: this.notes,
      level: this.level,
      ordered: this.ordered,
      marker: this.marker,
      indent: this.indent,
      depth: this.depth,
      parent: this.parent ? this.parent.id : null,
      fullPath: this.fullPath,
      siblingNodes: this.siblingNodes,
      children: this.children.map(child => child.toJSON())
    };
  }

  /**
   * 从JSON恢复
   */
  static fromJSON(json) {
    const node = new ASTNode(json);
    node.children = (json.children || []).map(child => ASTNode.fromJSON(child));
    // 设置子节点的父节点引用
    node.children.forEach(child => child.parent = node);
    return node;
  }

  /**
   * 克隆节点
   */
  clone() {
    return ASTNode.fromJSON(this.toJSON());
  }

  /**
   * 获取节点统计信息
   */
  getStats() {
    const stats = {
      totalNodes: 0,
      types: {},
      maxDepth: 0
    };

    this.traverse((node, depth) => {
      stats.totalNodes++;
      stats.types[node.type] = (stats.types[node.type] || 0) + 1;
      stats.maxDepth = Math.max(stats.maxDepth, depth);
    });

    return stats;
  }
}