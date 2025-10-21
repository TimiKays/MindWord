// 国际化语言配置文件
const i18nLocales = {
  zh: {
    // 语言
    language: {
      zh: '中文',
      en: 'EN'
    },
    
    // 导航栏
    nav: {
      features: '核心功能',
      scenarios: '适用场景',
      guide: '快速上手',
      privacy: '隐私保障',
      feedback: '反馈建议',
      tryNow: '立即体验',
      freeTrial: '免费体验',
      featureIntro: '功能介绍'
    },

    // 英雄区域
    hero: {
      title: 'MindWord',
      subtitle: '像画图一样写文档',
      description: '思维导图与Markdown结合的写作工具',
      userGroups: {
        title: '适用用户群体',
        writers: '写作者',
        productManagers: '产品经理',
        aiEnthusiasts: 'AI爱好者',
        knowledgeWorkers: '脑力工作者'
      },
      productShow: {
        dragWriting: '拖拽式写作',
        dragWritingDesc: '文档与思维导图双向实时更新',
        aiAssist: 'AI辅助生成',
        aiAssistDesc: '快速重写或扩展章节',
        alt: 'MindWord产品界面展示'
      }
    },

    // 项目背景
    background: {
      title: '项目背景',
      description: '你是否遇到过这样的困扰：好不容易在思维导图中梳理好框架，写文章时仍需要重写大纲；修改文章或导图另一侧不会变，导致框架与内容脱节？找AI头脑风暴，却难以融入已有文档？难以局部修改或深入探索？',
      traditionalPain: {
        title: '传统写作的痛点',
        point1: '思路与正文分离，难以保持一致性',
        point2: '格式调整繁琐，从草稿到正式文档耗时',
        point3: 'AI辅助与手动编辑难以无缝结合',
        point4: '想把AI回复或文章存到文档，却丢了格式'
      },
      mindwordSolution: {
        title: 'MindWord 的解决方案',
        point1: '拖拽式文档结构调整，即时双向同步',
        point2: '一键导出符合格式要求的Word文档',
        point3: 'AI辅助节点生成，无缝融入创作流程',
        point4: '支持贴入富文本生成文档，保留格式和层级'
      }
    },

    // 功能特性
    features: {
      title: '核心功能',
      mindmap: {
        title: '思维导图',
        desc: '直观的大纲式写作，支持拖拽排序'
      },
      markdown: {
        title: 'Markdown编辑',
        desc: '所见即所得的Markdown编辑器'
      },
      sync: {
        title: '云端同步',
        desc: '支持LeanCloud云端同步，数据不丢失'
      },
      export: {
        title: '多种导出',
        desc: '支持导出为Word、PDF、图片等格式'
      }
    },

    // 应用界面
    app: {
      // 面板标题
      editor: '文本编辑',
      preview: '文档预览',
      mindmap: '思维导图',
      focus: '专注',

      // 标签页
      tabs: {
        mindmap: '思维导图',
        editor: '文档编辑',
        export: '导出设置'
      },

      // 工具栏
      toolbar: {
        newDoc: '新建文档',
        save: '保存',
        export: '导出',
        settings: '设置',
        language: '语言'
      },

      // 节点操作
      node: {
        addSibling: '添加同级',
        addChild: '添加子级',
        delete: '删除',
        edit: '编辑',
        expand: '展开',
        collapse: '折叠'
      },

      // 导出选项
      export: {
        word: '导出为Word',
        pdf: '导出为PDF',
        image: '导出为图片',
        markdown: '导出为Markdown'
      },

      // 设置
      settings: {
        title: '设置',
        language: '语言设置',
        theme: '主题设置',
        sync: '同步设置',
        about: '关于'
      },

      // 提示信息
      messages: {
        saveSuccess: '保存成功',
        saveFailed: '保存失败',
        exportSuccess: '导出成功',
        exportFailed: '导出失败',
        syncSuccess: '同步成功',
        syncFailed: '同步失败',
        confirmDelete: '确定要删除这个节点吗？',
        loading: '加载中...',
        noData: '暂无数据'
      }
    },


    // 错误信息
    errors: {
      networkError: '网络错误，请检查网络连接',
      fileTooLarge: '文件过大，请减小文件大小',
      invalidFormat: '格式错误',
      operationFailed: '操作失败'
    },

    // 认证相关
    auth: {
      logout: '退出登录'
    },

    // 云备份
    cloud: {
      backupTitle: '云备份',
      capacityLimit: '容量上限：每用户 10MB（仅保留最新一份）',
      sync: '一键同步',
      clear: '清空备份',
      close: '关闭'
    }
  },

  en: {
    // 语言
    language: {
      zh: '中文',
      en: 'EN'
    },
    
    // 导航栏
    nav: {
      features: 'Features',
      scenarios: 'Scenarios',
      guide: 'Guide',
      privacy: 'Privacy',
      feedback: 'Feedback',
      tryNow: 'Try Now',
      freeTrial: 'Free Trial',
      featureIntro: 'Features'
    },

    // 英雄区域
    hero: {
      title: 'MindWord',
      subtitle: 'Write Documents Like Drawing',
      description: 'Mind mapping and Markdown combined writing tool',
      userGroups: {
        title: 'Target User Groups',
        writers: 'Writers',
        productManagers: 'Product Managers',
        aiEnthusiasts: 'AI Enthusiasts',
        knowledgeWorkers: 'Knowledge Workers'
      },
      productShow: {
        dragWriting: 'Drag & Drop Writing',
        dragWritingDesc: 'Bidirectional real-time sync between document and mind map',
        aiAssist: 'AI Assisted Generation',
        aiAssistDesc: 'Quickly rewrite or expand sections',
        alt: 'MindWord Product Interface Display'
      }
    },

    // 项目背景
    background: {
      title: 'Project Background',
      description: 'Have you ever encountered such troubles: after finally organizing the framework in a mind map, you still need to rewrite the outline when writing articles; when modifying articles or mind maps, the other side won\'t change, causing the framework and content to become disconnected? Looking for AI brainstorming, but difficult to integrate into existing documents? Difficult to make partial modifications or in-depth exploration?',
      traditionalPain: {
        title: 'Traditional Writing Pain Points',
        point1: 'Separation of ideas and main text, difficult to maintain consistency',
        point2: 'Tedious format adjustments, time-consuming from draft to formal document',
        point3: 'AI assistance and manual editing are difficult to seamlessly combine',
        point4: 'Want to save AI responses or articles to documents, but lose formatting'
      },
      mindwordSolution: {
        title: 'MindWord Solutions',
        point1: 'Drag and drop document structure adjustment with instant bidirectional synchronization',
        point2: 'One-click export of Word documents that meet format requirements',
        point3: 'AI-assisted node generation, seamlessly integrated into the creative process',
        point4: 'Support pasting rich text to generate documents, preserving format and hierarchy'
      }
    },

    // 功能特性
    features: {
      title: 'Core Features',
      mindmap: {
        title: 'Mind Mapping',
        desc: 'Intuitive outline writing with drag-and-drop sorting'
      },
      markdown: {
        title: 'Markdown Editor',
        desc: 'What you see is what you get Markdown editor'
      },
      sync: {
        title: 'Cloud Sync',
        desc: 'Support LeanCloud cloud sync, data never lost'
      },
      export: {
        title: 'Multiple Export',
        desc: 'Export to Word, PDF, Image and other formats'
      }
    },

    // 应用界面
    app: {
      // 面板标题
      editor: 'Text Editor',
      preview: 'Document Preview',
      mindmap: 'Mind Map',
      focus: 'Focus',

      // 标签页
      tabs: {
        mindmap: 'Mind Map',
        editor: 'Editor',
        export: 'Export'
      },

      // 工具栏
      toolbar: {
        newDoc: 'New Document',
        save: 'Save',
        export: 'Export',
        settings: 'Settings',
        language: 'Language'
      },

      // 节点操作
      node: {
        addSibling: 'Add Sibling',
        addChild: 'Add Child',
        delete: 'Delete',
        edit: 'Edit',
        expand: 'Expand',
        collapse: 'Collapse'
      },

      // 导出选项
      export: {
        word: 'Export as Word',
        pdf: 'Export as PDF',
        image: 'Export as Image',
        markdown: 'Export as Markdown'
      },

      // 设置
      settings: {
        title: 'Settings',
        language: 'Language Settings',
        theme: 'Theme Settings',
        sync: 'Sync Settings',
        about: 'About'
      },

      // 提示信息
      messages: {
        saveSuccess: 'Saved successfully',
        saveFailed: 'Save failed',
        exportSuccess: 'Exported successfully',
        exportFailed: 'Export failed',
        syncSuccess: 'Synced successfully',
        syncFailed: 'Sync failed',
        confirmDelete: 'Are you sure you want to delete this node?',
        loading: 'Loading...',
        noData: 'No data'
      }
    },

    // 错误信息
    errors: {
      networkError: 'Network error, please check your connection',
      fileTooLarge: 'File too large, please reduce file size',
      invalidFormat: 'Invalid format',
      operationFailed: 'Operation failed'
    },

    // 认证相关
    auth: {
      logout: 'Logout'
    },

    // 云备份
    cloud: {
      backupTitle: 'Cloud Backup',
      capacityLimit: 'Capacity limit: 10MB per user (latest version only)',
      sync: 'One-click Sync',
      clear: 'Clear Backup',
      close: 'Close'
    }
  }
};

// 导出语言配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18nLocales;
} else if (typeof window !== 'undefined') {
  window.i18nLocales = i18nLocales;
}