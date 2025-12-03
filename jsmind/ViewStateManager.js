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
 * ViewStateManager - 视图状态管理器
 * 负责管理思维导图的下钻状态和历史栈
 * 采用虚拟视图层方案，不影响底层数据结构
 */
class ViewStateManager {
    constructor() {
        this.drillDownHistoryStack = []; // 下钻历史栈
        this.currentViewMode = 'full'; // 当前视图模式: 'full' | 'drilldown'
        this.currentRootId = null; // 当前根节点ID
        this.originalData = null; // 原始完整数据缓存

        // 绑定事件处理函数
        this.handleDrillDown = this.handleDrillDown.bind(this);
        this.handleReturn = this.handleReturn.bind(this);
        this.handleBreadcrumbClick = this.handleBreadcrumbClick.bind(this);
        this.handleDataChange = this.handleDataChange.bind(this); // 数据变化处理函数

        // 初始化URL状态监听
        this.initializeUrlState();
    }

    /**
     * 初始化URL状态监听
     * 支持通过URL参数控制视图状态
     */
    initializeUrlState() {
        // 监听URL变化
        window.addEventListener('popstate', () => {
            this.restoreStateFromUrl();
        });

        // 初始化时检查URL状态
        this.restoreStateFromUrl();
    }

    /**
     * 从URL恢复状态
     */
    restoreStateFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const drilldownRoot = urlParams.get('drilldown');

        if (drilldownRoot) {
            // 如果URL中有下钻参数，执行下钻
            this.drillDownToNode(drilldownRoot, false); // 不更新URL
        } else {
            // 否则回到完整视图
            this.returnToFullView(false); // 不更新URL
        }
    }

    /**
     * 更新URL状态
     */
    updateUrlState() {
        const url = new URL(window.location);

        if (this.currentViewMode === 'drilldown' && this.currentRootId) {
            url.searchParams.set('drilldown', this.currentRootId);
        } else {
            url.searchParams.delete('drilldown');
        }

        // 使用replaceState避免创建新的历史记录
        window.history.replaceState({}, '', url);
    }

    /**
     * 下钻到指定节点
     * @param {string} nodeId - 目标节点ID
     * @param {boolean} updateUrl - 是否更新URL
     * @param {boolean} addToHistory - 是否添加到历史栈（面包屑点击时不添加）
     */
    drillDownToNode(nodeId, updateUrl = true, addToHistory = true) {
        try {
            if (!window.jm) {
                console.error('[ViewStateManager] JSMind实例未初始化');
                return false;
            }

            // 检查节点是否存在于当前JSMind实例中
            let targetNode = window.jm.get_node(nodeId);

            // 如果节点不存在且我们有原始数据，尝试先恢复完整视图再下钻
            if (!targetNode && this.originalData && this.currentViewMode === 'drilldown') {
                console.log(`[ViewStateManager] 节点 ${nodeId} 在当前实例中不存在，尝试从原始数据中查找`);

                // 临时保存当前状态
                const currentRootId = this.currentRootId;
                const currentMode = this.currentViewMode;

                // 先恢复到完整视图以获取所有节点数据
                this.returnToFullView(false); // 不更新URL

                // 再次尝试获取节点
                targetNode = window.jm.get_node(nodeId);
                if (!targetNode) {
                    console.error(`[ViewStateManager] 节点 ${nodeId} 在原始数据中也不存在`);
                    return false;
                }

                // 如果之前是在下钻模式且需要添加到历史栈，恢复之前的状态
                if (addToHistory && currentMode === 'drilldown') {
                    this.drillDownHistoryStack.push({
                        rootId: currentRootId,
                        timestamp: Date.now()
                    });
                }
            } else if (!targetNode) {
                console.error(`[ViewStateManager] 节点 ${nodeId} 不存在`);
                return false;
            }

            // 保存当前状态到历史栈（只有在需要时且当前在下钻模式下）
            if (addToHistory && this.currentViewMode === 'drilldown') {
                this.drillDownHistoryStack.push({
                    rootId: this.currentRootId,
                    timestamp: Date.now()
                });
            }

            // 更新当前状态
            this.currentViewMode = 'drilldown';
            this.currentRootId = nodeId;

            // // 缓存原始数据（如果还没有缓存）
            // if (!this.originalData) {
            //     this.originalData = window.jm.get_data();
            // }

            // 总是获取最新的完整数据（解决恢复后数据又被覆盖的问题）
            this.originalData = window.jm.get_data();

            // 应用过滤视图
            this.applyFilteredView();

            // 注册数据变化监听器（在下钻模式下实时同步）
            this.registerDataChangeListener();

            // 更新UI
            this.updateBreadcrumb();
            this.updateToolbarButtons();

            // 更新URL状态
            if (updateUrl) {
                this.updateUrlState();
            }

            console.log(`[ViewStateManager] 下钻到节点: ${nodeId}`);
            return true;

        } catch (error) {
            console.error('[ViewStateManager] 下钻失败:', error);
            return false;
        }
    }

    /**
     * 返回到上一级视图
     * @param {boolean} updateUrl - 是否更新URL
     */
    returnToParent(updateUrl = true) {
        try {
            if (this.drillDownHistoryStack.length === 0) {
                // 如果没有历史记录，返回到完整视图
                this.returnToFullView(updateUrl);
                return;
            }

            // 从历史栈恢复上一级状态
            const previousState = this.drillDownHistoryStack.pop();
            this.currentRootId = previousState.rootId;
            this.currentViewMode = 'drilldown'; // 仍然是下钻模式

            // 应用过滤视图
            this.applyFilteredView();

            // 更新UI
            this.updateBreadcrumb();
            this.updateToolbarButtons();

            // 更新URL状态
            if (updateUrl) {
                this.updateUrlState();
            }

            console.log(`[ViewStateManager] 返回到上一级: ${this.currentRootId}`);

        } catch (error) {
            console.error('[ViewStateManager] 返回上一级失败:', error);
            this.returnToFullView(updateUrl);
        }
    }

    /**
     * 返回到完整视图
     * @param {boolean} updateUrl - 是否更新URL
     */
    returnToFullView(updateUrl = true) {
        try {
            this.currentViewMode = 'full';
            this.currentRootId = null;
            this.drillDownHistoryStack = [];

            // 恢复完整数据视图
            if (this.originalData && window.jm) {
                window.jm.show(this.originalData);
            }

            // 移除数据变化监听器
            this.removeDataChangeListener();

            // 更新UI
            this.updateBreadcrumb();
            this.updateToolbarButtons();

            // 更新URL状态
            if (updateUrl) {
                this.updateUrlState();
            }

            console.log('[ViewStateManager] 返回到完整视图');

        } catch (error) {
            console.error('[ViewStateManager] 返回完整视图失败:', error);
        }
    }

    /**
     * 处理数据变化事件
     * 在下钻模式下实时同步数据到原始数据
     */
    handleDataChange(type, data) {
        // 只在下钻模式下进行实时同步
        if (this.currentViewMode !== 'drilldown' || !this.currentRootId) {
            console.log(`[ViewStateManager] 跳过同步 - 模式: ${this.currentViewMode}, 根节点: ${this.currentRootId}`);
            return;
        }

        try {
            console.log(`[ViewStateManager] 检测到数据变化: ${type}`, data);
            console.log(`[ViewStateManager] 当前根节点ID: ${this.currentRootId}`);

            // 获取当前下钻视图的完整数据
            const currentData = window.jm.get_data();
            console.log(`[ViewStateManager] 获取到的当前数据:`, currentData);

            if (!currentData || !currentData.data) {
                console.error('[ViewStateManager] 无法获取当前视图数据');
                return;
            }

            // 使用replaceSubtree将当前子树替换到原始数据中
            if (typeof replaceSubtree === 'function') {
                console.log(`[ViewStateManager] 准备调用replaceSubtree，目标节点: ${this.currentRootId}`);
                const success = replaceSubtree(this.currentRootId, currentData.data);
                if (success) {
                    console.log(`[ViewStateManager] 实时同步成功: ${type}`);
                } else {
                    console.error('[ViewStateManager] 实时同步失败 - replaceSubtree返回false');
                }
            } else {
                console.error('[ViewStateManager] replaceSubtree函数不可用');
                console.log(`[ViewStateManager] replaceSubtree类型: ${typeof replaceSubtree}`);
            }

        } catch (error) {
            console.error('[ViewStateManager] 实时同步数据失败:', error);
            console.error('[ViewStateManager] 错误堆栈:', error.stack);
        }
    }

    /**
     * 注册数据变化监听器
     */
    registerDataChangeListener() {
        if (!window.jm) {
            console.error('[ViewStateManager] JSMind实例未初始化，无法注册监听器');
            return;
        }

        // 如果已有监听器，先移除
        this.removeDataChangeListener();

        // 创建新的监听器函数并保存引用
        this.dataChangeListener = (type, data) => {
            // 只在下钻模式下处理特定事件
            const syncEvents = [
                jsMind.event_type.edit,
                jsMind.event_type.add_node,
                jsMind.event_type.remove_node,
                jsMind.event_type.move_node,
                jsMind.event_type.move
            ];

            if (syncEvents.includes(type)) {
                this.handleDataChange(type, data);
            }
        };

        // 监听jsMind的各种变化事件
        window.jm.add_event_listener(this.dataChangeListener);

        console.log('[ViewStateManager] 数据变化监听器已注册');
    }

    /**
     * 移除数据变化监听器
     */
    removeDataChangeListener() {
        if (window.jm && this.dataChangeListener) {
            try {
                window.jm.remove_event_listener(this.dataChangeListener);
                this.dataChangeListener = null;
                console.log('[ViewStateManager] 数据变化监听器已移除');
            } catch (error) {
                console.error('[ViewStateManager] 移除监听器失败:', error);
            }
        }
    }

    /**
     * 应用过滤视图
     * 根据当前根节点过滤显示数据
     */
    applyFilteredView() {
        try {
            if (!window.jm || !this.originalData) {
                return;
            }

            if (this.currentViewMode === 'full') {
                // 完整视图，直接显示原始数据
                window.jm.show(this.originalData);
                return;
            }

            // 下钻视图，构建过滤数据
            const filteredData = this.buildFilteredData();
            if (filteredData) {
                window.jm.show(filteredData);
            }

        } catch (error) {
            console.error('[ViewStateManager] 应用过滤视图失败:', error);
        }
    }

    /**
     * 构建过滤后的数据
     * @returns {Object|null} 过滤后的数据对象
     */
    buildFilteredData() {
        try {
            if (!this.originalData || !this.currentRootId) {
                return null;
            }

            // 深度克隆原始数据
            const filteredData = JSON.parse(JSON.stringify(this.originalData));

            // 找到目标节点作为新的根节点
            const targetNode = this.findNodeInTree(filteredData.data, this.currentRootId);
            if (!targetNode) {
                console.error(`[ViewStateManager] 在数据树中找不到节点: ${this.currentRootId}`);
                return null;
            }

            // 将目标节点设为新的根节点
            filteredData.data = targetNode;

            return filteredData;

        } catch (error) {
            console.error('[ViewStateManager] 构建过滤数据失败:', error);
            return null;
        }
    }

    /**
     * 在树中查找节点
     * @param {Object} node - 当前节点
     * @param {string} targetId - 目标节点ID
     * @returns {Object|null} 找到的节点或null
     */
    findNodeInTree(node, targetId) {
        if (!node) return null;

        // 检查当前节点
        if (node.id === targetId) {
            return node;
        }

        // 递归检查子节点
        if (node.children && node.children.length > 0) {
            for (let child of node.children) {
                const found = this.findNodeInTree(child, targetId);
                if (found) {
                    return found;
                }
            }
        }

        return null;
    }

    /**
     * 截断节点名称，超过最大长度显示省略号
     * @param {string} name - 节点名称
     * @param {number} maxLength - 最大长度（默认12个字符）
     * @returns {string} 截断后的名称
     */
    truncateNodeName(name, maxLength = 12) {
        if (!name || name.length <= maxLength) {
            return name || '未命名节点';
        }
        return name.substring(0, maxLength) + '...';
    }

    /**
     * 更新面包屑导航
     */
    updateBreadcrumb() {
        try {
            const breadcrumbContainer = document.getElementById('drilldown-breadcrumb');
            if (!breadcrumbContainer) {
                return;
            }

            if (this.currentViewMode === 'full') {
                breadcrumbContainer.innerHTML = '';
                breadcrumbContainer.style.display = 'none';
                return;
            }

            // 构建面包屑路径
            const breadcrumbPath = this.buildBreadcrumbPath();

            // 生成HTML - 使用蓝色链接样式
            let html = '<nav aria-label="下钻路径"><ol class="breadcrumb">';

            // 只在有路径时显示面包屑
            if (breadcrumbPath.length > 0) {
                // 第一个节点作为根节点显示，但不显示"根节点"文字
                const rootItem = breadcrumbPath[0];
                const truncatedRootName = this.truncateNodeName(rootItem.name);
                if (breadcrumbPath.length === 1) {
                    // 只有一层时，显示当前节点为活动状态
                    html += `<li class="breadcrumb-item active" aria-current="page" style="color: #333;" title="${rootItem.name}">${truncatedRootName}</li>`;
                } else {
                    // 多层时，第一个节点作为可点击的根节点
                    html += `<li class="breadcrumb-item"><a href="#" onclick="viewStateManager.returnToFullView(); return false;" style="color: #0066cc; text-decoration: none;" title="${rootItem.name}">${truncatedRootName}</a></li>`;
                }

                // 添加剩余路径（跳过第一个已处理的节点）
                for (let i = 1; i < breadcrumbPath.length; i++) {
                    const item = breadcrumbPath[i];
                    const isLast = i === breadcrumbPath.length - 1;
                    const className = isLast ? 'breadcrumb-item active' : 'breadcrumb-item';
                    const ariaCurrent = isLast ? ' aria-current="page"' : '';
                    const truncatedName = this.truncateNodeName(item.name);

                    if (isLast) {
                        html += `<li class="${className}"${ariaCurrent} style="color: #333;" title="${item.name}">${truncatedName}</li>`;
                    } else {
                        html += `<li class="${className}"><a href="#" onclick="viewStateManager.drillDownToNode('${item.id}', true, false); return false;" style="color: #0066cc; text-decoration: none;" title="${item.name}">${truncatedName}</a></li>`;
                    }
                }
            }

            html += '</ol></nav>';

            breadcrumbContainer.innerHTML = html;
            breadcrumbContainer.style.display = 'block';

        } catch (error) {
            console.error('[ViewStateManager] 更新面包屑失败:', error);
        }
    }

    /**
     * 构建面包屑路径
     * @returns {Array} 面包屑路径数组
     */
    buildBreadcrumbPath() {
        const path = [];

        if (!this.originalData || !this.currentRootId) {
            return path;
        }

        // 从原始数据中找到当前根节点的完整路径
        this.findNodePath(this.originalData.data, this.currentRootId, path);

        return path;
    }

    /**
     * 在树中查找节点路径
     * @param {Object} node - 当前节点
     * @param {string} targetId - 目标节点ID
     * @param {Array} path - 路径数组
     * @returns {boolean} 是否找到
     */
    findNodePath(node, targetId, path) {
        if (!node) return false;

        // 检查当前节点
        if (node.id === targetId) {
            path.push({
                id: node.id,
                name: node.topic || '未命名节点'
            });
            return true;
        }

        // 递归检查子节点
        if (node.children && node.children.length > 0) {
            for (let child of node.children) {
                if (this.findNodePath(child, targetId, path)) {
                    // 在路径中添加当前节点（子节点先添加）
                    path.unshift({
                        id: node.id,
                        name: node.topic || '未命名节点'
                    });
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 更新工具栏按钮状态
     */
    updateToolbarButtons() {
        try {
            const drillDownBtn = document.getElementById('drilldown-btn');
            const returnBtn = document.getElementById('return-btn');

            if (drillDownBtn) {
                // 只有在选中单个节点时才启用下钻按钮
                const selectedNodes = this.getSelectedNodes();
                if (selectedNodes.length === 1) {
                    drillDownBtn.classList.remove('disabled');
                    drillDownBtn.style.opacity = '1';
                    drillDownBtn.style.pointerEvents = 'auto';
                } else {
                    drillDownBtn.classList.add('disabled');
                    drillDownBtn.style.opacity = '0.5';
                    drillDownBtn.style.pointerEvents = 'none';
                }
                drillDownBtn.title = selectedNodes.length === 1 ? '下钻到选中节点' : '请选择一个节点进行下钻';
            }

            if (returnBtn) {
                // 只有在下钻模式下才启用返回按钮
                if (this.currentViewMode === 'drilldown') {
                    returnBtn.classList.remove('disabled');
                    returnBtn.style.opacity = '1';
                    returnBtn.style.pointerEvents = 'auto';
                } else {
                    returnBtn.classList.add('disabled');
                    returnBtn.style.opacity = '0.5';
                    returnBtn.style.pointerEvents = 'none';
                }
                returnBtn.title = this.currentViewMode === 'drilldown' ?
                    (this.drillDownHistoryStack.length > 0 ? '返回到上一级' : '返回到完整视图') :
                    '当前在完整视图中';
            }

        } catch (error) {
            console.error('[ViewStateManager] 更新工具栏按钮失败:', error);
        }
    }

    /**
     * 获取当前选中的节点
     * @returns {Array} 选中的节点ID数组
     */
    getSelectedNodes() {
        try {
            if (!window.jm) return [];

            const selectedNode = window.jm.get_selected_node();
            return selectedNode ? [selectedNode.id] : [];

        } catch (error) {
            console.error('[ViewStateManager] 获取选中节点失败:', error);
            return [];
        }
    }

    /**
     * 事件处理函数 - 处理下钻请求
     */
    handleDrillDown() {
        const selectedNodes = this.getSelectedNodes();
        if (selectedNodes.length === 1) {
            // 如果当前已经在下钻模式，需要先返回到完整视图，然后再下钻到目标节点
            if (this.currentViewMode === 'drilldown') {
                console.log('[ViewStateManager] 当前在下钻模式，准备先返回完整视图再下钻');
                
                // 保存目标节点ID
                const targetNodeId = selectedNodes[0];
                
                // 先返回到完整视图（不更新URL）
                this.returnToFullView(false);
                
                // 延迟一下确保视图完全恢复，然后执行下钻
                setTimeout(() => {
                    this.drillDownToNode(targetNodeId, true, true);
                }, 100);
            } else {
                // 当前在完整视图，直接下钻
                this.drillDownToNode(selectedNodes[0]);
            }
        }
    }

    /**
     * 事件处理函数 - 处理返回请求
     */
    handleReturn() {
        if (this.currentViewMode === 'drilldown') {
            this.returnToParent();
        }
    }

    /**
     * 事件处理函数 - 处理面包屑点击
     * @param {string} nodeId - 点击的节点ID
     */
    handleBreadcrumbClick(nodeId) {
        this.drillDownToNode(nodeId, true, false); // 面包屑点击不添加到历史栈
    }

    /**
     * 获取当前视图状态
     * @returns {Object} 当前视图状态
     */
    getCurrentState() {
        return {
            mode: this.currentViewMode,
            rootId: this.currentRootId,
            historyStack: [...this.drillDownHistoryStack],
            hasOriginalData: !!this.originalData
        };
    }

    /**
     * 检查是否在下钻模式下
     * @returns {boolean}
     */
    isInDrillDownMode() {
        return this.currentViewMode === 'drilldown';
    }

    /**
     * 获取当前根节点ID
     * @returns {string|null}
     */
    getCurrentRootId() {
        return this.currentRootId;
    }
}

// 创建全局实例
window.viewStateManager = new ViewStateManager();