// load.js - 自动加载和管理数据的核心模块
// 负责页面加载时从缓存加载数据，并同步到各个组件

/*
DataManager 现在是唯一的类，包含以下功能：

### 数据管理功能
- loadMarkdownFromCache() - 从缓存加载Markdown数据
- saveCurrentMarkdown() - 保存当前Markdown内容
- clearCache() - 清除所有缓存数据
### 自动保存功能
- setupAutoSave() - 设置1秒延迟的防抖自动保存
### 下载功能
- downloadCurrentAst() - 下载当前AST为JSON文件
- downloadCurrentNodeTree() - 下载当前NodeTree为JSON文件
- downloadCurrentMarkdown() - 下载当前Markdown为.md文件
### 导入功能
- importMarkdown() - 触发Markdown文件选择
- handleMarkdownFile(event) - 处理文件导入
### 示例数据
- loadSample(type) - 加载预设的示例数据
### 初始化功能
- initializeApp() - 应用初始化
- init() - 页面加载完成后的初始化
*/
// 默认数据
const DEFAULT_DATA = {
    markdown: `# 欢迎使用思维导图转换器

这是一个示例文档，展示如何将Markdown转换为思维导图。

## 主要功能

- 实时同步：Markdown、AST、NodeTree之间的实时转换
- 思维导图：可视化编辑和查看
- 数据持久化：自动保存到浏览器缓存

## 使用方法

1. 在左侧编辑Markdown内容
2. 观察中间区域实时生成的AST结构
3. 右侧查看NodeTree格式
4. 点击"查看思维导图"按钮可视化编辑

## 示例结构

### 子标题1
- 列表项1
- 列表项2

### 子标题2
1. 有序列表1
2. 有序列表2`
};

// 缓存键名
const CACHE_KEYS = {
    MARKDOWN: 'mindword_markdown_data',
    AST: 'mindword_ast_data',
    NODETREE: 'mindword_nodetree_data'
};

// 数据管理类 - 唯一的核心类，负责所有数据管理功能
class DataManager {
    constructor() {
        this.isLoading = false;
        this.currentData = {
            markdown: '',
            ast: null,
            nodeTree: null
        };
        this.saveTimeout = null;
        this.samples = {
            simple: `# 简单测试项目

## 任务列表
- 需求分析
- 设计阶段
- 开发实现

## 完成标准
1. 功能完整
2. 测试通过
3. 文档齐全`,

            complex: `# 复杂Web应用项目

## 项目概述
这是一个基于React的现代化Web应用。

### 技术架构
- 前端：React + TypeScript + TailwindCSS
- 后端：Node.js + Express + PostgreSQL
- 部署：Docker + AWS

### 开发计划
1. **第一阶段：基础搭建**
   - 项目初始化
   - 路由配置
   - 状态管理

2. **第二阶段：功能开发**
   - 用户认证模块
   - 数据展示模块
   - 管理后台

3. **第三阶段：优化部署**
   - 性能优化
   - 测试覆盖
   - 生产部署

### 注意事项
- 代码规范检查
- 单元测试要求
- 文档及时更新`,

            heading: `# 一级标题

## 二级标题
### 三级标题
#### 四级标题

## 另一个二级标题
- 列表项1
- 列表项2
  - 子列表项
  - 子列表项

### 三级标题下的内容
1. 有序列表1
2. 有序列表2
   - 混合列表
   - 继续混合`
        };
    }

    /**
     * 从浏览器本地缓存中加载Markdown数据
     * @returns {string} 加载的Markdown数据字符串
     */
    loadMarkdownFromCache() {
        try {
            const cachedMarkdown = localStorage.getItem(CACHE_KEYS.MARKDOWN);
            if (cachedMarkdown) {
                console.log('从缓存加载markdown数据...');
                return cachedMarkdown;
            } else {
                console.log('无缓存数据，使用默认值...');
                return DEFAULT_DATA.markdown;
            }
        } catch (error) {
            console.error('从缓存加载数据失败:', error);
            return DEFAULT_DATA.markdown;
        }
    }

    /**
     * 从浏览器本地缓存中加载AST数据
     * @returns {string} 加载的AST数据字符串
     */
    loadAstFromCache() {
        try {
            const cachedAst = localStorage.getItem(CACHE_KEYS.AST);
            if (cachedAst) {
                console.log('从缓存加载AST数据...');
                return cachedAst;
            } else {
                console.log('无AST缓存数据，使用默认值...');
                return JSON.stringify(DEFAULT_DATA.ast, null, 2);
            }
        } catch (error) {
            console.error('从缓存加载AST数据失败:', error);
            return JSON.stringify(DEFAULT_DATA.ast, null, 2);
        }
    }

    /**
     * 从浏览器本地缓存中加载NodeTree数据
     * @returns {string} 加载的NodeTree数据字符串
     */
    loadNodeTreeFromCache() {
        try {
            const cachedNodeTree = localStorage.getItem(CACHE_KEYS.NODETREE);
            if (cachedNodeTree) {
                console.log('从缓存加载NodeTree数据...');
                return cachedNodeTree;
            } else {
                console.log('无NodeTree缓存数据，使用默认值...');
                return JSON.stringify(DEFAULT_DATA.nodeTree, null, 2);
            }
        } catch (error) {
            console.error('从缓存加载NodeTree数据失败:', error);
            return JSON.stringify(DEFAULT_DATA.nodeTree, null, 2);
        }
    }



    /**
     * 清除缓存
     */
    clearCache() {
        try {
            localStorage.removeItem(CACHE_KEYS.MARKDOWN);
            localStorage.removeItem(CACHE_KEYS.AST);
            localStorage.removeItem(CACHE_KEYS.NODETREE);
            console.log('缓存已清除');
        } catch (error) {
            console.error('清除缓存失败:', error);
        }
    }

    /**
     * 保存当前markdown到缓存
     */
    saveCurrentMarkdown() {
        const markdown = document.getElementById('markdownInput').value;
        // 保存markdown
        try {
            localStorage.setItem(CACHE_KEYS.MARKDOWN, markdown);
            console.log('markdown已保存到缓存');
            syncAll('markdown');
        } catch (error) {
            console.error('保存md数据到缓存失败:', error);
        }
    }

    /**
     * 保存所有数据到缓存（兼容sync.js的调用）
     * @param {string} markdown - Markdown内容
     * @param {object} ast - AST对象
     * @param {object} nodeTree - NodeTree对象
     */
    async saveAll(markdown, ast, nodeTree) {
        try {
            // 保存Markdown
            localStorage.setItem(CACHE_KEYS.MARKDOWN, markdown);

            // 保存AST
            localStorage.setItem(CACHE_KEYS.AST, JSON.stringify(ast));

            // 保存NodeTree
            localStorage.setItem(CACHE_KEYS.NODETREE, JSON.stringify(nodeTree));

            console.log('所有数据已保存到缓存');
        } catch (error) {
            console.error('保存所有数据到缓存失败:', error);
            throw error;
        }
    }

    /**
     * 设置自动保存
     */
    setupAutoSave() {
        const autoSave = () => {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(() => {
                this.saveCurrentMarkdown();
            }, 1000);
        };

        const markdownInput = document.getElementById('markdownInput');
        if (markdownInput) {
            markdownInput.addEventListener('input', autoSave);
            markdownInput.addEventListener('change', autoSave);
        }
    }

    /**
     * 下载当前AST
     */
    downloadCurrentAst() {
        try {
            const astText = document.getElementById('astOutput').value;
            if (!astText.trim()) {
                if (typeof NotificationBridge !== 'undefined') {
                    NotificationBridge.showWarning('没有AST数据可下载');
                } else {
                    alert('没有AST数据可下载');
                }
                return;
            }

            const ast = JSON.parse(astText);
            const blob = new Blob([JSON.stringify(ast, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `ast-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            localStorage.setItem(CACHE_KEYS.AST, astText);
            console.log('AST已下载并缓存');
        } catch (error) {
            if (typeof NotificationBridge !== 'undefined') {
                NotificationBridge.showError('下载AST失败: ' + error.message);
            } else {
                alert('下载AST失败: ' + error.message);
            }
        }
    }

    /**
     * 下载当前NodeTree
     */
    downloadCurrentNodeTree() {
        try {
            const nodeTreeText = document.getElementById('nodeTreeOutput').value;
            if (!nodeTreeText.trim()) {
                if (typeof NotificationBridge !== 'undefined') {
                    NotificationBridge.showWarning('没有NodeTree数据可下载');
                } else {
                    alert('没有NodeTree数据可下载');
                }
                return;
            }

            const nodeTree = JSON.parse(nodeTreeText);
            const blob = new Blob([JSON.stringify(nodeTree, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `nodetree-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            localStorage.setItem(CACHE_KEYS.NODETREE, nodeTreeText);
            localStorage.setItem(CACHE_KEYS.MARKDOWN, document.getElementById('markdownInput').value);
            console.log('NodeTree已下载并缓存');
        } catch (error) {
            if (typeof NotificationBridge !== 'undefined') {
                NotificationBridge.showError('下载NodeTree失败: ' + error.message);
            } else {
                alert('下载NodeTree失败: ' + error.message);
            }
        }
    }

    /**
     * 下载当前Markdown
     */
    downloadCurrentMarkdown() {
        try {
            const markdown = document.getElementById('markdownInput').value;
            if (!markdown.trim()) {
                if (typeof NotificationBridge !== 'undefined') {
                    NotificationBridge.showWarning('没有内容可下载');
                } else {
                    alert('没有内容可下载');
                }
                return;
            }

            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mindword-content.md';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Markdown已下载');
        } catch (error) {
            console.error('下载Markdown失败:', error);
            if (typeof NotificationBridge !== 'undefined') {
                NotificationBridge.showError('下载失败：' + error.message);
            } else {
                alert('下载失败：' + error.message);
            }
        }
    }

    /**
     * 导入Markdown
     */
    importMarkdown() {
        document.getElementById('markdownFileInput').click();
    }

    /**
     * 处理Markdown文件导入
     * @param {Event} event - 文件选择事件
     */
    handleMarkdownFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                document.getElementById('markdownInput').value = content;

                if (window.syncAll) {
                    window.syncAll(source = 'nodeTree', refreshViews = true, saveToCache = true);
                }

                console.log('Markdown文件导入完成:', file.name);
                if (typeof NotificationBridge !== 'undefined') {
                    NotificationBridge.showSuccess(`文件 "${file.name}" 导入成功`);
                } else {
                    alert(`文件 "${file.name}" 导入成功`);
                }
                event.target.value = '';
            } catch (error) {
                console.error('导入Markdown失败:', error);
                if (typeof NotificationBridge !== 'undefined') {
                    NotificationBridge.showError('导入失败：' + error.message);
                } else {
                    alert('导入失败：' + error.message);
                }
            }
        };
        reader.readAsText(file, 'utf-8');
    }

    /**
     * 加载示例数据
     * @param {string} type - 示例类型
     */
    loadSample(type) {
        document.getElementById('markdownInput').value = this.samples[type] || '';
        if (window.clearStats) {
            window.clearStats();
        }
    }

    /**
     * 初始化应用
     */
    initializeApp() {
        console.log('初始化应用...');

        const loadData = () => {
            try {
                console.log('开始从缓存加载所有数据...');

                // 加载markdown数据
                const markdown = this.loadMarkdownFromCache();
                const markdownInput = document.getElementById('markdownInput');
                if (markdownInput) {
                    markdownInput.value = markdown;
                }

                // 加载AST数据并格式化
                const astData = this.loadAstFromCache();
                const astOutput = document.getElementById('astOutput');
                if (astOutput) {
                    try {
                        // 尝试解析并格式化JSON
                        const parsedAst = JSON.parse(astData);
                        astOutput.value = JSON.stringify(parsedAst, null, 2);
                    } catch (e) {
                        // 如果不是有效的JSON，直接显示原始数据
                        astOutput.value = astData;
                    }
                }

                // 加载NodeTree数据并格式化
                const nodeTreeData = this.loadNodeTreeFromCache();
                const nodeTreeOutput = document.getElementById('nodeTreeOutput');
                if (nodeTreeOutput) {
                    try {
                        // 尝试解析并格式化JSON
                        const parsedNodeTree = JSON.parse(nodeTreeData);
                        nodeTreeOutput.value = JSON.stringify(parsedNodeTree, null, 2);
                    } catch (e) {
                        // 如果不是有效的JSON，直接显示原始数据
                        nodeTreeOutput.value = nodeTreeData;
                    }
                }

                if (window.syncAll) {
                    window.syncAll();
                }

                console.log('所有缓存数据加载完成');
                console.log('- markdown长度:', markdown.length);
                console.log('- AST数据长度:', astData.length);
                console.log('- NodeTree数据长度:', nodeTreeData.length);

                // 如果有数据，更新统计信息
                if (window.updateStats) {
                    window.updateStats();
                }

            } catch (error) {
                console.error('加载和显示数据失败:', error);
                const markdownInput = document.getElementById('markdownInput');
                if (markdownInput) {
                    markdownInput.value = DEFAULT_DATA.markdown;
                }
                const astOutput = document.getElementById('astOutput');
                if (astOutput) {
                    astOutput.value = JSON.stringify(DEFAULT_DATA.ast, null, 2);
                }
                const nodeTreeOutput = document.getElementById('nodeTreeOutput');
                if (nodeTreeOutput) {
                    nodeTreeOutput.value = JSON.stringify(DEFAULT_DATA.nodeTree, null, 2);
                }
            }
        };

        if (window.converter) {
            loadData();
        } else {
            window.addEventListener('converterReady', loadData);
        }
    }

    /**
     * 页面加载完成后的初始化
     */
    init() {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('页面加载完成，开始初始化...');
            this.initializeApp();
            this.setupAutoSave();

            // 设置文件导入监听
            const fileInput = document.getElementById('markdownFileInput');
            if (fileInput) {
                fileInput.addEventListener('change', this.handleMarkdownFile.bind(this));
            }
        });
    }
}

// 创建全局数据管理器实例
const dataManager = new DataManager();

// 暴露全局变量和API - 只暴露dataManager
window.dataManager = dataManager;

// 兼容旧API - 将dataManager的方法暴露为全局函数
window.saveCurrentMarkdown = () => dataManager.saveCurrentMarkdown();
window.saveAll = (markdown, ast, nodeTree) => dataManager.saveAll(markdown, ast, nodeTree);
window.loadSample = (type) => dataManager.loadSample(type);
window.importMarkdown = () => dataManager.importMarkdown();
window.downloadCurrentMarkdown = () => dataManager.downloadCurrentMarkdown();
window.downloadCurrentAst = () => dataManager.downloadCurrentAst();
window.downloadCurrentNodeTree = () => dataManager.downloadCurrentNodeTree();
window.handleMarkdownFile = (event) => dataManager.handleMarkdownFile(event);

// 初始化应用
dataManager.init();