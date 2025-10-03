/**
 * AI扩写功能
 * 提供AI扩写界面和功能实现
 */

import { AIConfigManager } from '../ai/ai-config.js';

export class AIExpander {
  constructor() {
    this.configManager = new AIConfigManager();
    this.jsMind = null;
    this.isModalOpen = false;
    this.isConfigOpen = false;
    this.isExpanding = false;

    // 检查jQuery是否可用
    if (typeof $ === 'undefined') {
      console.error('jQuery未定义，某些功能可能无法正常工作');
    }
  }

  /**
   * 初始化方法
   * @param {Object} jsMind - jsMind实例
   */
  init(jsMind) {
    if (!jsMind) {
      console.error('初始化AI扩写功能失败：jsMind实例为空');
      return;
    }

    this.jsMind = jsMind;

    // 初始化DOM元素
    this.initDOM();

    // 绑定事件
    this.bindEvents();

    console.log('AI扩写功能已初始化');
  }

  /**
   * 初始化DOM元素
   */
  initDOM() {
    // 创建AI扩写按钮
    this.createExpandButton();

    // 创建模态框
    this.createModal();

    // 创建配置面板
    this.createConfigPanel();
  }

  /**
   * 创建AI扩写按钮
   */
  createExpandButton() {
    // 按钮已在 HTML 中固定添加，无需动态创建
    // 仅查找并绑定事件
    const expandButton = document.getElementById('aiExpandButton');
    if (expandButton) {
      this.expandButton = expandButton;
    }

    const configTrigger = document.getElementById('aiExpandConfigButton');
    if (configTrigger) {
      this.configTrigger = configTrigger;
    }
  }

  /**
   * 创建浮动AI扩写按钮（当找不到节点详情区域时使用）
   */
  createFloatingExpandButton() {
    const floatingButton = document.createElement('button');
    floatingButton.id = 'aiExpandButtonFloating';
    floatingButton.className = 'btn btn-primary position-fixed';
    floatingButton.style.bottom = '20px';
    floatingButton.style.right = '20px';
    floatingButton.style.zIndex = '1000';
    floatingButton.innerHTML = '<i class="fas fa-robot mr-1"></i> AI扩写';
    floatingButton.title = '使用AI扩展当前节点';

    document.body.appendChild(floatingButton);

    this.expandButton = floatingButton;
  }

  /**
   * 创建模态框
   */
  createModal() {
    // 创建模态框容器
    const modal = document.createElement('div');
    modal.id = 'aiExpandModal';
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'aiExpandModalLabel');
    modal.setAttribute('aria-hidden', 'true');

    // 模态框内容
    modal.innerHTML = `
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="aiExpandModalLabel">AI扩写</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="aiPromptPreview">提示词预览：</label>
              <textarea class="form-control" id="aiPromptPreview" rows="8" readonly></textarea>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-3">
              <button id="aiConfigButton" class="btn btn-outline-secondary btn-sm">
                <i class="fas fa-cog mr-1"></i> 配置
              </button>
              <div>
                <span id="selectedModelDisplay" class="mr-2 text-muted">未选择模型</span>
                <button id="startExpandButton" class="btn btn-primary">
                  <i class="fas fa-magic mr-1"></i> 开始扩写
                </button>
              </div>
            </div>
            <div id="aiResponseContainer" class="mt-3 d-none">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6>AI响应：</h6>
                <div>
                  <button id="regenerateButton" class="btn btn-outline-primary btn-sm mr-2">
                    <i class="fas fa-redo-alt mr-1"></i> 重新生成
                  </button>
                  <button id="applyResponseButton" class="btn btn-success btn-sm">
                    <i class="fas fa-check mr-1"></i> 应用到思维导图
                  </button>
                </div>
              </div>
              <div id="aiResponseContent" class="border rounded p-3 bg-light">
                <div id="aiResponseLoading" class="text-center py-3 d-none">
                  <div class="spinner-border text-primary" role="status">
                    <span class="sr-only">加载中...</span>
                  </div>
                  <p class="mt-2">正在生成内容，请稍候...</p>
                </div>
                <pre id="aiResponseText" class="mb-0"></pre>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
          </div>
        </div>
      </div>
    `;

    // 添加到body
    document.body.appendChild(modal);

    this.modal = modal;
    this.promptPreview = document.getElementById('aiPromptPreview');
    this.responseContainer = document.getElementById('aiResponseContainer');
    this.responseText = document.getElementById('aiResponseText');
    this.responseLoading = document.getElementById('aiResponseLoading');
    this.selectedModelDisplay = document.getElementById('selectedModelDisplay');
  }

  /**
   * 创建配置面板
   */
  createConfigPanel() {
    // 创建配置面板容器
    const configPanel = document.createElement('div');
    configPanel.id = 'aiConfigPanel';
    configPanel.className = 'modal fade';
    configPanel.setAttribute('tabindex', '-1');
    configPanel.setAttribute('role', 'dialog');
    configPanel.setAttribute('aria-labelledby', 'aiConfigPanelLabel');
    configPanel.setAttribute('aria-hidden', 'true');

    // 获取当前配置
    const config = this.configManager.getConfig();
    const models = this.configManager.getModels();
    const selectedModel = this.configManager.getSelectedModel();

    // 生成模型选项
    let modelOptions = '';
    models.forEach(model => {
      const selected = model.id === config.selectedModel ? 'selected' : '';
      modelOptions += `<option value="${model.id}" ${selected}>${model.name} - ${model.description}</option>`;
    });

    // 配置面板内容
    configPanel.innerHTML = `
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="aiConfigPanelLabel">AI配置</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <form id="aiConfigForm">
              <div class="form-group">
                <label for="apiKeyInput">API密钥：</label>
                <div class="input-group">
                  <input type="password" class="form-control" id="apiKeyInput" value="${config.apiKey || ''}" placeholder="输入OpenRouter API密钥">
                  <div class="input-group-append">
                    <button class="btn btn-outline-secondary" type="button" id="toggleApiKeyButton">
                      <i class="fas fa-eye"></i>
                    </button>
                  </div>
                </div>
                <small class="form-text text-muted">需要OpenRouter API密钥，可在 <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a> 获取</small>
              </div>
              <div class="form-group">
                <label for="modelSelect">选择模型：</label>
                <select class="form-control" id="modelSelect">
                  ${modelOptions}
                </select>
              </div>
              <div class="form-group">
                <label for="temperatureInput">温度 (Temperature)：</label>
                <input type="range" class="form-control-range" id="temperatureInput" min="0" max="1" step="0.1" value="${config.temperature || 0.7}">
                <div class="d-flex justify-content-between">
                  <small>更确定 (0)</small>
                  <small id="temperatureValue">${config.temperature || 0.7}</small>
                  <small>更随机 (1)</small>
                </div>
              </div>
              <div class="form-group">
                <label for="maxTokensInput">最大生成长度：</label>
                <input type="number" class="form-control" id="maxTokensInput" value="${config.maxTokens || 2000}" min="100" max="4000">
                <small class="form-text text-muted">控制AI生成内容的最大长度</small>
              </div>
              <div class="form-group">
                <label for="promptTemplateInput">提示词模板：</label>
                <textarea class="form-control" id="promptTemplateInput" rows="10">${config.customPrompt || ''}</textarea>
                <small class="form-text text-muted">可使用 {{context}}、{{fullPath}}、{{siblingNodes}} 作为占位符</small>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
            <button type="button" class="btn btn-primary" id="saveConfigButton">保存配置</button>
          </div>
        </div>
      </div>
    `;

    // 添加到body
    document.body.appendChild(configPanel);

    this.configPanel = configPanel;
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // AI扩写按钮点击事件
    if (this.expandButton) {
      this.expandButton.addEventListener('click', () => this.openModal());
    }

    // 配置按钮点击事件
    const configButton = document.getElementById('aiConfigButton');
    if (configButton) {
      configButton.addEventListener('click', () => this.openConfigPanel());
    }

    // 开始扩写按钮点击事件
    const startExpandButton = document.getElementById('startExpandButton');
    if (startExpandButton) {
      startExpandButton.addEventListener('click', () => this.startExpand());
    }

    // 重新生成按钮点击事件
    const regenerateButton = document.getElementById('regenerateButton');
    if (regenerateButton) {
      regenerateButton.addEventListener('click', () => this.startExpand());
    }

    // 应用响应按钮点击事件
    const applyResponseButton = document.getElementById('applyResponseButton');
    if (applyResponseButton) {
      applyResponseButton.addEventListener('click', () => this.applyResponse());
    }

    // 保存配置按钮点击事件
    const saveConfigButton = document.getElementById('saveConfigButton');
    if (saveConfigButton) {
      saveConfigButton.addEventListener('click', () => this.saveConfig());
    }

    // 切换API密钥可见性
    const toggleApiKeyButton = document.getElementById('toggleApiKeyButton');
    const apiKeyInput = document.getElementById('apiKeyInput');
    if (toggleApiKeyButton && apiKeyInput) {
      toggleApiKeyButton.addEventListener('click', () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
        toggleApiKeyButton.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
      });
    }

    // 温度滑块值显示
    const temperatureInput = document.getElementById('temperatureInput');
    const temperatureValue = document.getElementById('temperatureValue');
    if (temperatureInput && temperatureValue) {
      temperatureInput.addEventListener('input', () => {
        temperatureValue.textContent = temperatureInput.value;
      });
    }

    // 检查jQuery是否可用
    if (typeof $ !== 'undefined') {
      // 模态框关闭事件
      $(this.modal).on('hidden.bs.modal', () => {
        this.isModalOpen = false;
      });

      // 配置面板关闭事件
      $(this.configPanel).on('hidden.bs.modal', () => {
        this.isConfigOpen = false;
      });
    } else {
      console.warn('jQuery未定义，无法绑定模态框事件');
      // 使用原生事件监听（如果有必要）
      if (this.modal && this.modal.addEventListener) {
        this.modal.addEventListener('hidden.bs.modal', () => {
          this.isModalOpen = false;
        });
      }

      if (this.configPanel && this.configPanel.addEventListener) {
        this.configPanel.addEventListener('hidden.bs.modal', () => {
          this.isConfigOpen = false;
        });
      }
    }
  }

  /**
   * 打开模态框
   */
  openModal() {
    if (!this.jsMind) {
      this.showError('思维导图未初始化');
      return;
    }

    const selectedNode = this.jsMind.get_selected_node();
    if (!selectedNode) {
      this.showWarning('请先选择一个节点');
      return;
    }

    // 更新选中的模型显示
    const selectedModel = this.configManager.getSelectedModel();
    if (selectedModel) {
      this.selectedModelDisplay.textContent = `当前模型: ${selectedModel.name}`;
    } else {
      this.selectedModelDisplay.textContent = '未选择模型';
    }

    // 生成提示词预览
    this.updatePromptPreview();

    // 隐藏响应区域
    this.responseContainer.classList.add('d-none');

    // 打开模态框
    $(this.modal).modal('show');
    this.isModalOpen = true;
  }

  /**
   * 打开配置面板
   */
  openConfigPanel() {
    // 关闭当前模态框
    $(this.modal).modal('hide');

    // 打开配置面板
    $(this.configPanel).modal('show');
    this.isConfigOpen = true;
  }

  /**
   * 保存配置
   */
  saveConfig() {
    const apiKey = document.getElementById('apiKeyInput').value;
    const selectedModel = document.getElementById('modelSelect').value;
    const temperature = parseFloat(document.getElementById('temperatureInput').value);
    const maxTokens = parseInt(document.getElementById('maxTokensInput').value);
    const customPrompt = document.getElementById('promptTemplateInput').value;

    const newConfig = {
      apiKey,
      selectedModel,
      temperature,
      maxTokens,
      customPrompt
    };

    const success = this.configManager.updateConfig(newConfig);
    if (success) {
      this.showSuccess('配置已保存');

      // 关闭配置面板
      $(this.configPanel).modal('hide');

      // 重新打开模态框
      setTimeout(() => {
        $(this.modal).modal('show');

        // 更新选中的模型显示
        const selectedModel = this.configManager.getSelectedModel();
        if (selectedModel) {
          this.selectedModelDisplay.textContent = `当前模型: ${selectedModel.name}`;
        }

        // 更新提示词预览
        this.updatePromptPreview();
      }, 500);
    } else {
      this.showError('配置保存失败');
    }
  }

  /**
   * 更新提示词预览
   */
  updatePromptPreview() {
    if (!this.jsMind) return;

    const selectedNode = this.jsMind.get_selected_node();
    if (!selectedNode) return;

    // 构建上下文
    const context = this.buildNodeContext(selectedNode);

    // 获取全路径
    const fullPath = selectedNode.data?.data?.fullPath || '';

    // 获取兄弟节点
    const siblingNodes = selectedNode.data?.data?.siblingNodes || [];

    // 生成提示词
    const prompt = this.configManager.generatePrompt(context, fullPath, siblingNodes);

    // 更新预览
    this.promptPreview.value = prompt;
  }

  /**
   * 构建节点上下文
   */
  buildNodeContext(node) {
    if (!node) return '';

    // 获取父节点路径（不包含当前节点）
    const parentPath = this.getParentPath(node);

    // 构建上下文，只包含父路径信息，不包含当前节点内容
    const context = {
      "父路径": parentPath,
      "当前节点": node.topic || '',
      "备注": node.data.notes || '',
      "层级": node.data.data?.level || 0
    };
    return JSON.stringify(context, null, 2);
  }

  /**
   * 获取节点的父路径（不包含当前节点）
   */
  getParentPath(node) {
    if (!node || !node.parent) return '';

    const path = [];
    let current = node.parent;

    // 向上遍历，构建父节点路径
    while (current && current.topic) {
      path.unshift(current.topic);
      current = current.parent;
    }

    return path.join(' > ');
  }

  /**
   * 开始扩写
   */
  async startExpand() {
    if (this.isExpanding) return;

    const config = this.configManager.getConfig();
    if (!config.apiKey) {
      this.showWarning('请先设置API密钥');
      this.openConfigPanel();
      return;
    }

    const selectedNode = this.jsMind.get_selected_node();
    if (!selectedNode) {
      this.showWarning('请先选择一个节点');
      return;
    }

    // 显示响应区域和加载状态
    this.responseContainer.classList.remove('d-none');
    this.responseLoading.classList.remove('d-none');
    this.responseText.classList.add('d-none');
    this.responseText.textContent = '';

    this.isExpanding = true;

    try {
      // 获取提示词
      const prompt = this.promptPreview.value;

      // 调用AI
      const response = await this.configManager.callAI(prompt);

      // 显示AI响应内容，但不直接应用
      this.responseText.textContent = response;
      this.responseText.classList.remove('d-none');
      this.responseLoading.classList.add('d-none');

      // 保存响应以供后续使用
      this.lastResponse = response;
      this.lastSelectedNodeId = selectedNode.id;
    } catch (error) {
      this.showError(`AI扩写失败: ${error.message}`);
      this.responseText.textContent = `错误: ${error.message}`;
      this.responseText.classList.remove('d-none');
      this.responseLoading.classList.add('d-none');
    } finally {
      this.isExpanding = false;
    }
  }

  /**
   * 显示通知消息（使用通知桥接器）
   */
  showNotification(message, type = 'info', duration = 3000) {
    if (window.NotificationBridge && window.NotificationBridge.show) {
      window.NotificationBridge.show(message, type, duration);
    } else if (typeof $ !== 'undefined') {
      // 降级：使用 jQuery 实现
      const notificationId = 'ai-notification-' + Date.now();
      const notificationHtml = `
        <div id="${notificationId}" class="alert alert-${type} alert-dismissible fade show position-fixed" 
             style="top: 20px; right: 20px; z-index: 9999; min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          ${message}
          <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      `;
      $('body').append(notificationHtml);
      setTimeout(() => $(`#${notificationId}`).alert('close'), duration);
      $(`#${notificationId} .close`).click(() => $(`#${notificationId}`).alert('close'));
    } else {
      alert(message);
    }
  }

  /**
   * 显示成功通知
   */
  showSuccess(message, duration = 3000) {
    this.showNotification(message, 'success', duration);
  }

  /**
   * 显示错误通知
   */
  showError(message, duration = 5000) {
    this.showNotification(message, 'danger', duration);
  }

  /**
   * 显示警告通知
   */
  showWarning(message, duration = 4000) {
    this.showNotification(message, 'warning', duration);
  }

  /**
   * 显示信息通知
   */
  showInfo(message, duration = 3000) {
    this.showNotification(message, 'info', duration);
  }

  /**
   * 应用AI响应到思维导图
   */
  async applyResponse() {
    console.log('=== applyResponse 方法被调用 ===');

    if (!this.lastResponse || !this.lastSelectedNodeId) {
      console.log('没有可应用的AI响应');
      console.log('lastResponse:', this.lastResponse);
      console.log('lastSelectedNodeId:', this.lastSelectedNodeId);
      this.showWarning('没有可应用的AI响应');
      return;
    }

    console.log('开始应用AI响应到思维导图...');
    console.log('AI响应内容:', this.lastResponse);
    console.log('选中节点ID:', this.lastSelectedNodeId);
    console.log('configManager 实例:', this.configManager);

    try {
      // 检查 configManager 和 insertAINodes 方法是否存在
      if (!this.configManager) {
        throw new Error('configManager 未初始化');
      }

      if (typeof this.configManager.insertAINodes !== 'function') {
        console.error('configManager.insertAINodes 不是一个函数');
        console.error('configManager 的方法:', Object.getOwnPropertyNames(this.configManager));
        throw new Error('insertAINodes 方法不存在');
      }

      console.log('调用 insertAINodes 方法...');
      // 使用insertAINodes的逻辑来处理AI响应
      await this.configManager.insertAINodes(this.lastResponse, this.lastSelectedNodeId);

      console.log('AI响应应用成功');

      // 关闭模态框
      $(this.modal).modal('hide');

      this.showSuccess('AI响应已成功应用到思维导图');
    } catch (error) {
      console.error('应用AI响应失败:', error);
      console.error('错误堆栈:', error.stack);
      this.showError(`应用AI响应失败: ${error.message}`);
    }
  }

  // 新增内部方法，供实例调用
  expandNodeInternal(nodeId, jmInstance) {
    if (jmInstance) {
      this.jsMind = jmInstance;
    }
    if (this.jsMind && nodeId) {
      const node = this.jsMind.get_node(nodeId);
      if (node) {
        this.jsMind.select_node(nodeId);
      }
    }
    this.openModal();
  }

}
// 默认导出
export default AIExpander;

// 向旧代码暴露静态方法以保持兼容
AIExpander.expandNode = function (nodeId, jmInstance) {
  if (window.aiExpander && typeof window.aiExpander.expandNodeInternal === 'function') {
    window.aiExpander.expandNodeInternal(nodeId, jmInstance);
  } else {
    console.error('aiExpander instance not ready');
  }
};

// 静态方法：直接打开配置面板
AIExpander.showConfig = function () {
  const instance = window.aiExpander;
  if (instance) {
    instance.openConfigPanel();
  } else {
    console.error('aiExpander instance not ready');
  }
};

// 初始化
if (typeof window !== 'undefined') {
  window.AIExpander = AIExpander;
  document.addEventListener('DOMContentLoaded', () => {
    window.aiExpander = new AIExpander();
  });
}