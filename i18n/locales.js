// 国际化语言配置文件
const i18nLocales = {
  zh: {
    // 语言
    language: {
      zh: '中文',
      en: 'EN'
    },

    // 适用场景
    scenarios: {
      title: '适用场景',
      description: 'MindWord 适用于各种写作场景，让您的创作更加高效',
      learningPlan: {
        title: '学习计划',
        desc: '整理学习内容，制定学习计划和总结',
        audience: {
          title: '目标人群',
          student: '学生',
          lifelongLearner: '终身学习者',
          researcher: '研究人员'
        }
      },
      productPRD: {
        title: '产品PRD',
        desc: '撰写产品需求文档、功能说明书',
        audience: {
          title: '目标人群',
          productManager: '产品经理',
          projectManager: '项目经理',
          entrepreneur: '创业者'
        }
      },
      articleWriting: {
        title: '文章写作',
        desc: '创作文章、博客、论文等内容',
        audience: {
          title: '目标人群',
          writer: '作家',
          selfMedia: '自媒体人',
          contentCreator: '内容创作者'
        }
      }
    },

    // 快速上手
    quickGuide: {
      title: '快速上手',
      description: '只需几个简单步骤，即可开始使用 MindWord 提升您的写作效率',
      steps: {
        step1: {
          title: '初始化',
          description: '上传Markdown文件，或复制粘贴markdown或富文本，即可看到对应预览和思维导图。',
          exampleTitle: '示例 Markdown 片段',
          importTip: '导入下面的 Markdown 片段会形成对应树状结构：',
          exampleContent: '# 产品需求文档\n## 功能概述\n- 背景说明\n- 目标用户\n## 功能详情\n### 登录\n- 支持手机号\n- 支持第三方\n### 写作编辑\n- 思维导图视图\n- Markdown 编辑器'
        },
        step2: {
          title: '编辑方式',
          description: '双击右侧思维导图节点，可编辑标题或备注，拖拽调整结构；在左侧Markdown编辑器编辑对应部分，任一侧修改会同步到另一侧。',
          shortcutsTitle: '常用快捷与操作',
          shortcuts: {
            newChild: '• 新建子级节点：选中节点后按Tab',
            newSibling: '• 新增同级节点：选中节点后按 Enter',
            deleteNode: '• 删除节点：选中后节点按 Delete',
            undo: '• 撤销：Ctrl+z，可撤销最近10次',
            redo: '• 重做：Ctrl+Shift+Z',
            multiSelect: '• 多选：支持鼠标框选'
          }
        },
        step3: {
          title: '导出',
          description: 'Markdown可导出为md文件，如有图片会一并打包为zip文件。也可直接导出为格式化的Word文档。'
        }
      }
    },

    // 隐私保障
    privacy: {
      title: '隐私保障',
      subtitle: '我们重视您的数据安全和隐私保护，让您放心使用',
      localStorage: {
        title: '本地存储',
        desc: '所有文档和图片都存储在本地浏览器缓存或本地文件中（取决于导入方式），不会上传到任何服务器，确保您的数据安全。'
      },
      aiFunction: {
        title: 'AI功能说明',
        desc: '使用外部AI服务时，会将相关文本发送到您配置的AI平台进行处理，请注意。'
      }
    },

    // 开始使用
    getStarted: {
      title: '开始使用 MindWord',
      subtitle: '立即体验思维导图与Markdown结合的高效写作方式，让您的创意和思路更加井井有条',
      webVersion: '访问网页版',
      compatibility: '兼容PC和移动端，全平台一致体验'
    },

    // 反馈建议
    feedback: {
      title: '反馈建议',
      subtitle: '本产品由1名产品经理+ChatGPT+KIMI独立开发，如有问题或建议，欢迎随时联系我~',
      contactInfo: '产品 | UI | 开发 | 测试 | 运营 | 客服',
      wechat: '微信：TimiKays'
    },

    // 页脚
    footer: {
      copyright: '© 2025 MindWord. 保留所有权利。',
      changelog: '更新日志'
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
      description: 'MindWord 提供强大的思维导图、Markdown编辑和文档生成功能，让您的创作更加高效',
      tabs: {
        markdown: 'Markdown编辑器',
        mindmap: '思维导图',
        word: 'Word文档生成'
      },
      markdown: {
        title: 'Markdown编辑器',
        description: '强大的数据采集与初始化功能，支持多种导入方式',
        dataSources: {
          title: '多数据源支持',
          item1: '粘贴Markdown纯文本',
          item2: '粘贴富文本自动转Markdown',
          item3: '粘贴图片',
          item4: '上传md/zip（含图片）'
        },
        importExport: {
          title: '导入导出源文件',
          desc: '支持导入导出标准语法md/zip（含图片），可反复修改复用，无工具锁定之忧。'
        },
        localStorage: {
          title: '本地离线存储',
          desc: '所有数据存储在本地（无服务器），安全可控，保护您的隐私和知识产权。'
        }
      },
      mindmap: {
        title: '思维导图',
        description: '可视化同步编辑文档结构，让您的思路更清晰有条理',
        nodeDefinition: {
          title: '树节点定义',
          desc: '所有Markdown的1-6级标题、有序/无序列表行，都作为节点标题，其他文本作为节点备注属性。'
        },
        syncEdit: {
          title: '双向同步编辑',
          desc: '在左侧Markdown文本或右侧可视化思维导图任一侧编辑，另一侧即时更新，解决同步难题。'
        },
        aiSubnodes: {
          title: 'AI生成子节点',
          desc: '头脑风暴或细化主题时，可让AI基于某节点一键生成子节点，人工采纳或编辑。'
        }
      },
      word: {
        title: 'Word文档生成',
        description: '输出日常办公文档，形成闭环，满足正式文档需求',
        presetTemplates: {
          title: '预设模板',
          desc: '无需额外配置，直接基于预设模板样式一键生成Word文件，快速满足基本需求。'
        },
        customTemplates: {
          title: '自定义模板',
          desc: '对Word样式有要求的用户，可下载模板并修改样式集，上传模板生成特定格式的文档。'
        },
        structurePreservation: {
          title: '完整结构保留',
          desc: '生成的Word文档完整保留思维导图的层级结构，格式规范，外观专业。'
        }
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
        copy: '复制',
        settings: '设置',
        language: '语言',
        undo: '撤销',
        redo: '重做',
        downloadImage: '下载图片',
        viewJSON: '查看JSON',
        aiGenerateInitialTree: 'AI生成初始树',
        config: '配置',
        drillDown: '下钻到选中节点',
        drillUp: '上钻到根节点',
        addSubtree: '添加子树',
        aiGenerateChild: 'AI生成子节点',
        aiGenerateSibling: 'AI生成同级节点',
        aiExpandNotes: 'AI扩写备注',
        nodeDetails: '节点详情',
        deleteNode: '删除节点',
        selectIcon: '选择图标',
        expandToLevel1: '展开到第1级',
        expandToLevel2: '展开到第2级',
        expandToLevel3: '展开到第3级',
        expandToLevel4: '展开到第4级',
        expandToLevel5: '展开到第5级',
        expandAll: '展开全部',
        quickAIGenerate: '快速AI生成：开启时将关闭AI弹窗，直接生成内容',
        detailPanelPermanent: '详情面板常驻',
        help: '帮助'
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

      // 右键菜单
      contextMenu: {
        editNode: '编辑节点',
        drillDown: '下钻',
        aiGenerateChild: 'AI生成子节点',
        aiGenerateSibling: 'AI生成同级节点',
        aiExpandNotes: 'AI扩写备注',
        addSubtree: '添加子树',
        addChildNode: '添加子节点',
        addSiblingNode: '添加同级节点',
        deleteNode: '删除节点'
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
        loadingEditor: '正在加载编辑器...',
        loadingPreview: '正在加载预览...',
        loadingMindmap: '正在加载思维导图...',
        noData: '暂无数据',
        address: '地址',
        notConfigured: '未配置'
      }
    },


    // 错误信息
    errors: {
      networkError: '网络错误，请检查网络连接',
      fileTooLarge: '文件过大，请减小文件大小',
      invalidFormat: '格式错误',
      operationFailed: '操作失败',
      pageNotConfigured: '页面地址未配置',
      setPageAddress: '请在 PAGE_CONFIG.${panelName}.url 中设置页面地址',
      pageLoadFailed: '页面加载失败',
      retry: '重试',
      reloading: '正在重新加载',
      keepOnePanel: '至少需要保留一个视图面板！'
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
      close: '关闭',
      latestBackup: '最新备份时间',
      fileCount: '已备份文件数',
      totalSize: '总体大小'
    },

    // 文档管理
    docs: {
      myDocuments: '我的文档',
      newDoc: '新增',
      exportAllZip: '全部导出ZIP',
      importZip: '导入ZIP',
      clearData: '清空数据',
      registerLogin: '注册/登录',
      personalAccount: '个人账户',
      clearCloudData: '清空云数据',
      deleteAllCloudBackups: '删除所有云端备份',
      bidirectionalSync: '双向同步为最新',
      oneClickSync: '一键同步',
      batchMode: '批量模式',
      selectAll: '全选',
      selectNone: '全不选',
      batchDelete: '批量删除',
      cancel: '取消',
      confirm: '确定',
      create: '创建',
      aiGenerate: 'AI生成',
      confirmBatchDelete: '确定要删除选中的文档吗？',
      noDocsSelected: '请至少选择一个文档'
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
      featureIntro: 'Features',
      changelog: 'Changelog'
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



    // 适用场景
    scenarios: {
      title: 'Applicable Scenarios',
      subtitle: 'MindWord is suitable for various writing scenarios, making your creation more efficient',
      description: 'MindWord is suitable for various writing scenarios, making your creation more efficient',
      learningPlan: {
        title: 'Learning Plan',
        desc: 'Organize learning content, develop study plans and summaries',
        audience: {
          title: 'Target Audience',
          student: 'Student',
          lifelongLearner: 'Lifelong Learner',
          researcher: 'Researcher'
        }
      },
      productPRD: {
        title: 'Product PRD',
        desc: 'Write product requirement documents, functional specifications',
        audience: {
          title: 'Target Audience',
          productManager: 'Product Manager',
          projectManager: 'Project Manager',
          entrepreneur: 'Entrepreneur'
        }
      },
      articleWriting: {
        title: 'Article Writing',
        desc: 'Create articles, blogs, thesis and other content',
        audience: {
          title: 'Target Audience',
          writer: 'Writer',
          selfMedia: 'Self-Media',
          contentCreator: 'Content Creator'
        }
      }
    },

    // 快速上手
    quickGuide: {
      title: 'Quick Start',
      subtitle: 'Just a few simple steps to start using MindWord to improve your writing efficiency',
      description: 'MindWord is a powerful tool that combines mind mapping and markdown editing. Follow these simple steps to get started and improve your writing efficiency.',
      steps: {
        step1: {
          title: 'Initialization',
          description: 'Upload Markdown files, or copy and paste markdown or rich text to see corresponding preview and mind map.',
          exampleTitle: 'Example Markdown Snippet',
          importTip: 'Import the following Markdown snippet to form corresponding tree structure:',
          exampleContent: '# Product Requirements Document\n## Feature Overview\n- Background Description\n- Target Users\n## Feature Details\n### Login\n- Support Phone Number\n- Support Third-party\n### Writing Editor\n- Mind Map View\n- Markdown Editor'
        },
        step2: {
          title: 'Editing Methods',
          description: 'Double-click nodes in the right mind map to edit titles or notes, drag to adjust structure; edit corresponding parts in the left Markdown editor, modifications on either side sync to the other.',
          shortcutsTitle: 'Common Shortcuts & Operations',
          shortcuts: {
            newChild: 'New child node: Select node and press Tab',
            newSibling: 'New sibling node: Select node and press Enter',
            deleteNode: 'Delete node: Select node and press Delete',
            undo: 'Undo: Ctrl+Z, can undo last 10 operations',
            redo: 'Redo: Ctrl+Shift+Z',
            multiSelect: 'Multi-select: Support mouse box selection'
          }
        },
        step3: {
          title: 'Export',
          description: 'Markdown can be exported as md files, if there are images they will be packaged into zip files together. Can also directly export as formatted Word documents.'
        }
      }
    },

    // 隐私保障
    privacy: {
      title: 'Privacy Protection',
      subtitle: 'We value your data security and privacy protection, allowing you to use with confidence',
      localStorage: {
        title: 'Local Storage',
        desc: 'All documents and images are stored in local browser cache or local files (depending on import method), no uploads to any server, ensuring your data security.'
      },
      aiFunction: {
        title: 'AI Function Description',
        desc: 'When using external AI services, relevant text will be sent to the configured AI platform for processing, please be aware.'
      }
    },

    // 开始使用
    getStarted: {
      title: 'Start Using MindWord',
      subtitle: 'Experience the efficient writing method combining mind maps and Markdown immediately, making your creativity and ideas more organized',
      webVersion: 'Visit Web Version',
      compatibility: 'Compatible with PC and mobile, consistent experience across all platforms'
    },

    // 反馈建议
    feedback: {
      title: 'Feedback & Suggestions',
      subtitle: 'This product was independently developed by 1 product manager + ChatGPT + KIMI. For any questions or suggestions, feel free to contact me~',
      contactInfo: 'Product | UI | Development | Testing | Operations | Support',
      wechat: 'WeChat ID: TimiKays'
    },

    // 页脚
    footer: {
      copyright: '© 2025 MindWord. All rights reserved.',
      changelog: 'Changelog'
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
      description: 'MindWord provides powerful mind mapping, Markdown editing, and document generation capabilities, making your creation more efficient',
      tabs: {
        markdown: 'Markdown Editor',
        mindmap: 'Mind Map Canvas',
        word: 'Word Document Generation'
      },
      markdown: {
        title: 'Powerful Data Collection',
        description: 'Powerful data collection and initialization capabilities, supporting multiple import methods',
        dataSources: {
          title: 'Multiple Data Sources Support',
          item1: 'Paste Markdown plain text',
          item2: 'Paste rich text auto-convert to Markdown',
          item3: 'Paste images',
          item4: 'Upload md/zip (with images)'
        },
        importExport: {
          title: 'Import/Export Source Files',
          desc: 'Support import/export of standard syntax md/zip (with images), can be repeatedly modified and reused, no tool lock-in concerns.'
        },
        localStorage: {
          title: 'Local Offline Storage',
          desc: 'All data stored locally (no server), secure and controllable, protecting your privacy and intellectual property.'
        }
      },
      mindmap: {
        title: 'Visual Structure Editing',
        description: 'Visual synchronized editing of document structure, making your ideas clearer and more organized',
        treeDefinition: {
          title: 'Tree Node Definition',
          desc: 'All Markdown headings from level 1-6 and ordered/unordered list lines serve as node titles, other text serves as node note attributes.'
        },
        bidirectionalSync: {
          title: 'Bidirectional Synchronized Editing',
          desc: 'Edit on either Markdown text or visual mind map side, the other side updates instantly, solving synchronization issues.'
        },
        aiGeneration: {
          title: 'AI Generate Sub-nodes',
          desc: 'During brainstorming or topic refinement, let AI generate child nodes based on a node with one click, manually adopt or edit.'
        }
      },
      word: {
        title: 'Professional Document Output',
        description: 'Output daily office documents to form a closed loop, meeting formal document needs',
        presetTemplates: {
          title: 'Preset Templates',
          desc: 'No additional configuration needed, directly generate Word files based on preset template styles with one click, quickly meeting basic needs.'
        },
        customTemplates: {
          title: 'Custom Templates',
          desc: 'For users with Word style requirements, download templates and modify style sets, upload templates to generate documents in specific formats.'
        },
        structurePreservation: {
          title: 'Complete Structure Retention',
          desc: 'Generated Word documents completely retain the hierarchical structure from mind maps, with standardized formatting and professional appearance.'
        }
      }
    },

    // 应用界面
    app: {
      // 面板标题
      editor: 'Editor',
      preview: 'Preview',
      mindmap: 'MindMap',
      focus: 'Focus',

      // 标签页
      tabs: {
        mindmap: 'MindMap',
        editor: 'Editor',
        export: 'Export'
      },

      // 工具栏
      toolbar: {
        newDoc: 'New Document',
        save: 'Save',
        export: 'Export',
        copy: 'Copy',
        settings: 'Settings',
        language: 'Language',
        undo: 'Undo',
        redo: 'Redo',
        downloadImage: 'Download Image',
        viewJSON: 'View JSON',
        aiGenerateInitialTree: 'AI Generate Initial Tree',
        config: 'Config',
        drillDown: 'Drill Down to Selected Node',
        drillUp: 'Drill Up to Root Node',
        addSubtree: 'Add Subtree',
        aiGenerateChild: 'AI Generate Child Node',
        aiGenerateSibling: 'AI Generate Sibling Node',
        aiExpandNotes: 'AI Expand Notes',
        nodeDetails: 'Node Details',
        deleteNode: 'Delete Node',
        selectIcon: 'Select Icon',
        expandToLevel1: 'Expand to Level 1',
        expandToLevel2: 'Expand to Level 2',
        expandToLevel3: 'Expand to Level 3',
        expandToLevel4: 'Expand to Level 4',
        expandToLevel5: 'Expand to Level 5',
        expandAll: 'Expand All',
        quickAIGenerate: 'Quick AI Generate: When enabled, AI popup will be disabled and content will be generated directly',
        detailPanelPermanent: 'Detail Panel Permanent',
        help: 'Help'
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

      // 右键菜单
      contextMenu: {
        editNode: 'Edit Node',
        drillDown: 'Drill Down',
        aiGenerateChild: 'AI Generate Child Node',
        aiGenerateSibling: 'AI Generate Sibling Node',
        aiExpandNotes: 'AI Expand Notes',
        addSubtree: 'Add Subtree',
        addChildNode: 'Add Child Node',
        addSiblingNode: 'Add Sibling Node',
        deleteNode: 'Delete Node'
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
        loadingEditor: 'Loading editor...',
        loadingPreview: 'Loading preview...',
        loadingMindmap: 'Loading mind map...',
        noData: 'No data',
        address: 'Address',
        notConfigured: 'Not configured'
      }
    },

    // 错误信息
    errors: {
      networkError: 'Network error, please check your connection',
      fileTooLarge: 'File too large, please reduce file size',
      invalidFormat: 'Invalid format',
      operationFailed: 'Operation failed',
      pageNotConfigured: 'Page address not configured',
      setPageAddress: 'Please set page address in PAGE_CONFIG.${panelName}.url',
      pageLoadFailed: 'Page load failed',
      retry: 'Retry',
      reloading: 'Reloading',
      keepOnePanel: 'At least one view panel must be kept!'
    },

    // 认证相关
    auth: {
      logout: 'Logout'
    },

    // 云备份
    cloud: {
      backupTitle: 'Cloud Backup',
      capacityLimit: 'Capacity limit: 10MB per user (latest version only)',
      sync: 'Sync',
      clear: 'Clear',
      close: 'Close',
      latestBackup: 'Latest backup time',
      fileCount: 'Files backed up',
      totalSize: 'Total size',
      oneClickSync: 'One-click sync',
      files: 'Files',
      backupTime: 'Backup',
      justNow: 'Just now',
      minutesAgo: 'minutes ago',
      hoursAgo: 'hours ago',
      daysAgo: 'days ago',
      fileSizeCheckFailed: 'File size check failed',
      syncStatus: 'Sync status'
    },

    // 文档管理
    docs: {
      myDocuments: 'My Documents',
      newDoc: 'New Document',
      exportAllZip: 'Export All ZIP',
      importZip: 'Import ZIP',
      clearData: 'Clear Data',
      registerLogin: 'Register/Login',
      personalAccount: 'Personal Account',
      clearCloudData: 'Clear Cloud Data',
      deleteAllCloudBackups: 'Delete all cloud backups',
      bidirectionalSync: 'Bidirectional sync is up to date',
      oneClickSync: 'sync',
      batchMode: 'Batch Mode',
      selectAll: 'Select All',
      selectNone: 'Select None',
      batchDelete: 'Batch Delete',
      cancel: 'Cancel',
      confirm: 'Confirm',
      create: 'Create',
      aiGenerate: 'AI Generate',
      confirmBatchDelete: 'Are you sure you want to delete the selected documents?',
      noDocsSelected: 'Please select at least one document'
    },

  }
};

// 导出语言配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18nLocales;
} else if (typeof window !== 'undefined') {
  window.i18nLocales = i18nLocales;
}