// ============================================================
// jsMind 节点数据结构完整说明
// ============================================================

/**
 * 📋 jsMind 节点数据结构详解
 * 
 * jsMind 使用灵活的 JSON 对象结构来表示思维导图节点。
 * 这个数据结构在项目中广泛使用，理解它对于开发和调试非常重要。
 */

// ===== 基础节点结构（必需字段）=====
const basicNodeStructure = {
  // 🔑 必需字段
  id: "node_123",           // 字符串：节点唯一标识符
  topic: "节点主题",        // 字符串：节点显示的文本内容

  // 🔗 层级关系（由 jsMind 管理）
  parent: null,             // 对象：父节点引用（jsMind 内部使用）
  children: [],            // 数组：子节点数组
  isroot: false,           // 布尔：是否为根节点
  expanded: true,          // 布尔：节点是否展开
  direction: "right",      // 字符串：节点方向（"left" 或 "right"）

  // 📊 样式属性（可选）
  background: "#ffffff",   // 字符串：背景颜色
  color: "#333333",        // 字符串：文字颜色
  font: {
    size: 14,              // 数字：字体大小
    weight: "normal",      // 字符串：字体粗细
    style: "normal"        // 字符串：字体样式
  },

  // 📋 数据容器（扩展字段存储在这里）
  data: {
    // 这是最重要的部分！所有自定义扩展字段都存储在这里
  }
};

// ===== 实际项目中的扩展数据结构 =====
const extendedNodeStructure = {
  // 🔑 基础字段（必需）
  id: "node_123",
  topic: "项目功能需求",

  // 📋 数据扩展（项目中实际使用的结构）
  data: {
    // 📝 备注相关（多种存储位置，为了兼容性）
    notes: "这是节点的详细备注内容",      // 主要备注字段
    remark: "备用备注字段",              // 备用备注
    comment: "评论或说明",               // 评论字段

    // 🏷️ 类型系统（三层嵌套结构，为了兼容性）
    type: "heading",                     // 节点类型
    level: 1,                            // 标题层级（1-6）

    // 📊 列表特性
    ordered: false,                      // 是否为有序列表
    marker: "-",                         // 列表标记（-, *, +, 1. 等）

    // 📍 路径和位置信息
    fullPath: "根节点 / 功能需求 / 具体功能", // 完整路径
    parentPath: "根节点 / 功能需求",        // 父路径

    // 🔗 同级节点信息
    siblingNodes: ["兄弟节点1", "兄弟节点2"], // 同级节点主题列表

    // 📄 原始数据
    raw: "- 项目功能需求",                // 原始文本（用于转换）

    // 🎯 业务数据（converter 扩展）
    converter: {
      type: "list_item",                   // 转换器类型
      level: 2,                            // 转换器层级
      metadata: {}                         // 其他元数据
    }
  },

  // 🎯 兼容性字段（某些代码直接设置在节点上）
  notes: "节点备注（兼容旧代码）",        // 直接设置在节点上的备注
  type: "heading",                       // 直接设置在节点上的类型
  level: 1,                             // 直接设置在节点上的层级

  // 🔗 层级关系
  children: [],
  parent: null,
  isroot: false,
  expanded: true
};

// ===== 项目中观察到的复杂嵌套结构 =====
const complexNodeStructure = {
  // 某些代码使用三层嵌套结构（最复杂的情况）
  id: "node_456",
  topic: "### 复杂功能需求",

  data: {
    // 第一层数据
    notes: "主要备注",
    type: "heading",
    level: 3,

    // 某些代码在 data.data 中存储（为了兼容性）
    data: {
      // 第二层数据嵌套
      type: "heading",           // node.data.data.type
      level: 3,                   // node.data.data.level
      raw: "### 复杂功能需求",
      siblingNodes: ["兄弟1", "兄弟2"]
    }
  },

  // 某些字段直接存储在节点上
  notes: "兼容性备注",
  type: "heading",              // node.type
  level: 3                       // node.level
};

// ===== 实际代码中的数据访问模式 =====
const dataAccessPatterns = {
  // 📋 备注获取（多种位置，按优先级）
  getNotes: (node) => {
    // 优先级：node.data.notes → node.notes → DOM元素 → node.data.remark
    if (node && node.data && node.data.notes) return node.data.notes;
    if (node && node.notes) return node.notes;
    const domNotes = document.getElementById('nodeNotes');
    if (domNotes) return domNotes.value;
    if (node && node.data && node.data.remark) return node.data.remark;
    return '';
  },

  // 🏷️ 类型获取（三层嵌套检查）
  getType: (node) => {
    // 优先级：node.type → node.data.type → node.data.data.type
    if (node && node.type) return node.type;
    if (node && node.data && node.data.type) return node.data.type;
    if (node && node.data && node.data.data && node.data.data.type) return node.data.data.type;
    return '';
  },

  // 📊 层级获取（多层检查 + 回退）
  getLevel: (node) => {
    // 优先级：node.data.level → node.data.data.level → node.level → 从topic解析
    if (node && node.data && typeof node.data.level !== 'undefined') return node.data.level;
    if (node && node.data && node.data.data && typeof node.data.data.level !== 'undefined') return node.data.data.level;
    if (node && typeof node.level !== 'undefined') return node.level;
    // 回退：从topic中的标题标记解析（如 "### 标题"）
    const match = node.topic && node.topic.match(/^(#+)\s*/);
    return match ? match[1].length : 1;
  }
};

// ===== 项目中常见的数据操作 =====
const commonOperations = {
  // 📝 更新备注（需要更新多个位置）
  updateNotes: (node, newNotes) => {
    // 为了兼容性，需要更新多个位置
    if (node.data) node.data.notes = newNotes;
    node.notes = newNotes;
    const domNotes = document.getElementById('nodeNotes');
    if (domNotes) domNotes.value = newNotes;
  },

  // 🏷️ 更新类型（多层结构）
  updateType: (node, newType) => {
    if (node.data) {
      if (node.data.data) node.data.data.type = newType;
      node.data.type = newType;
    }
    node.type = newType;
  },

  // 📊 更新层级
  updateLevel: (node, newLevel) => {
    if (node.data) {
      if (node.data.data) node.data.data.level = newLevel;
      node.data.level = newLevel;
    }
    node.level = newLevel;
  }
};

// ===== 实际项目中的JSON示例 =====
const realProjectExample = {
  "meta": {
    "name": "思维导图",
    "author": "user",
    "version": "1.0.0"
  },
  "format": "node_tree",
  "data": {
    "id": "root",
    "topic": "项目规划",
    "isroot": true,
    "data": {
      "notes": "这是根节点的备注",
      "type": "root",
      "level": 0
    },
    "children": [
      {
        "id": "node_1",
        "topic": "## 功能需求",
        "data": {
          "notes": "详细的功能需求说明",
          "type": "heading",
          "level": 2,
          "ordered": false,
          "marker": "-",
          "fullPath": "项目规划 / 功能需求",
          "raw": "## 功能需求",
          "data": {  // 注意：这里有三层嵌套
            "type": "heading",
            "level": 2,
            "siblingNodes": ["技术架构", "UI设计"]
          }
        },
        "children": [
          {
            "id": "node_1_1",
            "topic": "用户管理",
            "data": {
              "notes": "用户注册、登录、权限管理",
              "type": "list_item",
              "level": 0,
              "ordered": true,
              "marker": "1.",
              "fullPath": "项目规划 / 功能需求 / 用户管理"
            }
          }
        ]
      }
    ]
  }
};

// ===== 调试和检查工具 =====
const debuggingTools = {
  // 🔍 检查节点结构完整性
  inspectNode: (node) => {
    console.log('=== 节点结构检查 ===');
    console.log('基础信息:', {
      id: node.id,
      topic: node.topic,
      hasChildren: !!node.children,
      childrenCount: node.children ? node.children.length : 0
    });

    console.log('数据容器:', {
      hasData: !!node.data,
      dataKeys: node.data ? Object.keys(node.data) : []
    });

    if (node.data) {
      console.log('嵌套data:', {
        hasNestedData: !!node.data.data,
        nestedDataKeys: node.data.data ? Object.keys(node.data.data) : []
      });
    }

    console.log('兼容性字段:', {
      hasDirectNotes: !!node.notes,
      hasDirectType: !!node.type,
      hasDirectLevel: typeof node.level !== 'undefined'
    });
  },

  // 📊 获取所有备注字段
  getAllNotesFields: (node) => {
    return {
      'node.data.notes': node.data && node.data.notes,
      'node.notes': node.notes,
      'node.data.remark': node.data && node.data.remark,
      'node.data.data.notes': node.data && node.data.data && node.data.data.notes
    };
  }
};

console.log('📋 jsMind 节点数据结构完整说明已加载');
console.log('💡 主要特点：');
console.log('   1. 基础字段：id, topic 是必需的');
console.log('   2. 数据扩展：所有自定义字段存储在 node.data 中');
console.log('   3. 兼容性：某些字段可能直接存储在节点上（node.type, node.notes）');
console.log('   4. 复杂嵌套：某些代码使用 node.data.data 三层嵌套');
console.log('   5. 优先级：获取数据时需要按优先级检查多个位置');

// 导出给其他地方使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    basicNodeStructure,
    extendedNodeStructure,
    complexNodeStructure,
    dataAccessPatterns,
    commonOperations,
    debuggingTools
  };
}