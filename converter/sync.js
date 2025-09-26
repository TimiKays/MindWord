/**
 * 数据同步核心模块
 * 提供统一的同步入口，根据来源自动同步所有数据格式
 */

// 全局变量
window.currentAst = null;
window.currentNodeTree = null;

/**
 * 统一的同步入口
 * 根据指定来源，同步三套数据，然后调用saveAll保存到localstorage
 * @param {string} source - 同步来源: 'markdown'(默认) | 'ast' | 'nodeTree' | 'mindmap'
 * @param {boolean} refreshViews - 是否刷新视图（默认为true）
 * @param {boolean} saveToCache - 是否保存到缓存（默认为true）
 */
async function syncAll(source = 'markdown', refreshViews = true, saveToCache = true) {
    if (!window.converter) {
        console.log('转换器未加载，等待转换器...');

        // 最多等待5秒
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('转换器加载超时')), 5000)
        );

        // 等待转换器加载
        try {
            await Promise.race([
                new Promise(resolve => {
                    if (window.converter) {
                        resolve();
                    } else {
                        window.addEventListener('converterReady', resolve, { once: true });
                    }
                }),
                timeout
            ]);
        } catch (error) {
            console.error('等待转换器加载失败:', error);
            return;
        }
    }

    try {
        // 定义localStorage键名映射
        const storageKeys = {
            'markdown': 'mindword_markdown_data',
            'ast': 'mindword_ast_data',
            'nodeTree': 'mindword_nodetree_data',
            'mindmap': 'mindword_nodetree_data'
        };

        let ast, nodeTree, markdown;
        let dataFromStorage = true;

        // 根据来源获取数据
        switch (source) {
            case 'markdown':
                // 优先从localStorage获取markdown
                markdown = localStorage.getItem(storageKeys[source]);
                if (!markdown) {
                    // 如果localStorage没有，从输入框获取
                    const markdownInput = document.getElementById('markdownInput');
                    markdown = markdownInput ? markdownInput.value : '';
                    dataFromStorage = false;
                }
                ast = window.converter.mdToAst(markdown);
                nodeTree = window.converter.astToNodeTree(ast);
                break;

            case 'ast':
                // 优先从localStorage获取AST
                const astData = localStorage.getItem(storageKeys[source]);
                if (astData) {
                    ast = JSON.parse(astData);
                } else {
                    // 如果localStorage没有，从输入框获取
                    const astOutput = document.getElementById('astOutput');
                    ast = astOutput ? JSON.parse(astOutput.value) : {};
                    dataFromStorage = false;
                }
                markdown = window.converter.astToMd(ast);
                nodeTree = window.converter.astToNodeTree(ast);
                break;

            case 'nodeTree':
                // 优先从localStorage获取nodeTree
                const nodeTreeData = localStorage.getItem(storageKeys[source]);
                if (nodeTreeData) {
                    nodeTree = JSON.parse(nodeTreeData);
                } else {
                    // 如果localStorage没有，从输入框获取
                    const nodeTreeOutput = document.getElementById('nodeTreeOutput');
                    nodeTree = nodeTreeOutput ? JSON.parse(nodeTreeOutput.value) : {};
                    dataFromStorage = false;
                }
                ast = window.converter.nodeTreeToAst(nodeTree);
                markdown = window.converter.astToMd(ast);
                break;

            case 'mindmap':
                // 思维导图来源，nodeTree参数由调用者提供
                if (arguments.length > 3 && arguments[3]) {
                    nodeTree = arguments[3];
                } else {
                    // 优先从localStorage获取nodeTree
                    const nodeTreeData = localStorage.getItem(storageKeys[source]);
                    nodeTree = nodeTreeData ? JSON.parse(nodeTreeData) : {};
                }
                ast = window.converter.nodeTreeToAst(nodeTree);
                markdown = window.converter.astToMd(ast);
                break;

            default:
                console.warn('未知的同步来源:', source);
                return;
        }

        console.log(`数据来源: ${dataFromStorage ? 'localStorage' : '输入框'}, 来源类型: ${source}`);

        // 更新全局变量
        window.currentAst = ast;
        window.currentNodeTree = nodeTree;

        // 刷新视图
        if (refreshViews) {
            // if (source !== 'markdown') {
            //     markdownInput.value = markdown;
            // }
            // if (source !== 'ast') {
            //     astOutput.value = JSON.stringify(ast, null, 2);
            // }
            // if (source !== 'nodeTree' && source !== 'mindmap') {
            //     nodeTreeOutput.value = JSON.stringify(nodeTree, null, 2);
            // }

            // // 更新思维导图
            // if (window.currentMindmap && source !== 'mindmap') {
            //     window.currentMindmap.show(nodeTree);
            // }
        }

        // 保存到缓存
        if (saveToCache && window.saveAll) {
            await window.saveAll(markdown, ast, nodeTree);
        }

        console.log(`✅ 从${source}同步完成`);

    } catch (error) {
        console.error(`从${source}同步失败:`, error);
    }
}

// 防抖同步（用于输入事件）
let syncTimer = null;
function debounceSync(source) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncAll(source);
    }, 500);
}

// 初始化同步系统
function initSyncSystem() {
    // 监听输入变化
    const elements = {
        markdown: document.getElementById('markdownInput'),
        ast: document.getElementById('astOutput'),
        nodeTree: document.getElementById('nodeTreeOutput')
    };

    Object.entries(elements).forEach(([source, element]) => {
        if (element) {
            element.addEventListener('input', () => debounceSync(source));
        }
    });

    console.log('✅ 同步系统初始化完成');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncSystem);
} else {
    initSyncSystem();
}

// 暴露到全局
window.syncAll = syncAll;

// 向后兼容的函数
window.syncFromMarkdown = () => syncAll('markdown');
window.syncFromAst = () => syncAll('ast');
window.syncFromNodeTree = () => syncAll('nodeTree');
window.syncFromMindmap = (nodeTree) => syncAll('mindmap', true, true, nodeTree);

