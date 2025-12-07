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
 * AI Modal 模块
 * 处理 AI 相关的模态框功能
 */

// AI Modal 管理器
const AIModalManager = {
    // 模态框状态
    isModalOpen: false,

    /**
     * 初始化 AI 模态框
     */
    init: function () {
        console.log('AI Modal 模块已加载');
        this.setupEventListeners();
    },

    /**
     * 设置事件监听器
     */
    setupEventListeners: function () {
        // 监听来自其他组件的消息
        window.addEventListener('message', this.handleMessage.bind(this));
    },

    /**
     * 处理消息事件
     */
    handleMessage: function (event) {
        try {
            const data = event.data;

            // 处理 AI 相关消息
            if (data && data.type === 'ai-modal') {
                switch (data.action) {
                    case 'open':
                        this.openModal(data.content);
                        break;
                    case 'close':
                        this.closeModal();
                        break;
                    case 'update':
                        this.updateModal(data.content);
                        break;
                }
            }
        } catch (error) {
            console.error('AI Modal 消息处理错误:', error);
        }
    },

    /**
     * 打开 AI 模态框
     */
    openModal: function (content) {
        if (this.isModalOpen) {
            return;
        }

        this.isModalOpen = true;

        // 创建模态框 HTML
        const modalHTML = `
            <div id="ai-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
                <div id="ai-modal-content" style="background: white; padding: 20px; border-radius: 8px; max-width: 600px; max-height: 80%; overflow-y: auto; position: relative;">
                    <button id="ai-modal-close" style="position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                    <div id="ai-modal-body">
                        ${content || '<p>AI 功能加载中...</p>'}
                    </div>
                </div>
            </div>
        `;

        // 添加到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 绑定关闭事件
        document.getElementById('ai-modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('ai-modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'ai-modal-overlay') {
                this.closeModal();
            }
        });

        console.log('AI 模态框已打开');
    },

    /**
     * 关闭 AI 模态框
     */
    closeModal: function () {
        if (!this.isModalOpen) {
            return;
        }

        const overlay = document.getElementById('ai-modal-overlay');
        if (overlay) {
            overlay.remove();
        }

        this.isModalOpen = false;
        console.log('AI 模态框已关闭');
    },

    /**
     * 更新模态框内容
     */
    updateModal: function (content) {
        if (!this.isModalOpen) {
            return;
        }

        const body = document.getElementById('ai-modal-body');
        if (body && content) {
            body.innerHTML = content;
        }
    },

    /**
     * 显示 AI 服务调用界面
     */
    showAIService: function (serviceType, params) {
        const content = `
            <h3>AI 服务: ${serviceType}</h3>
            <div style="margin: 20px 0;">
                <p>正在处理您的请求...</p>
                <div style="text-align: center; margin: 20px 0;">
                    <i class="fa fa-spinner fa-spin" style="font-size: 24px;"></i>
                </div>
            </div>
        `;

        this.openModal(content);

        // 发送消息给父窗口或其他组件
        window.postMessage({
            type: 'ai-service-request',
            service: serviceType,
            params: params,
            requestId: this.generateRequestId()
        }, '*');
    },

    /**
     * 生成请求 ID
     */
    generateRequestId: function () {
        return 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
};

// 初始化 AI Modal 管理器
document.addEventListener('DOMContentLoaded', function () {
    AIModalManager.init();
});

// 全局函数，供其他组件调用
window.showAIModal = function (content) {
    AIModalManager.openModal(content);
};

window.hideAIModal = function () {
    AIModalManager.closeModal();
};

window.showAIService = function (serviceType, params) {
    AIModalManager.showAIService(serviceType, params);
};

console.log('ai-modal.js 加载完成');