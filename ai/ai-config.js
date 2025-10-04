/**
 * AI配置管理器
 * 用于配置和选择AI模型，支持OpenRouter等服务
 */

export class AIConfigManager {
    constructor() {
        this.configKey = 'mindword_ai_config';
        this.defaultConfig = {
            provider: 'openrouter',
            models: [
                { id: 'deepseek/deepseek-chat-v3.1:free', name: 'deepseek/deepseek-chat-v3.1:free', description: 'deepseek v3.1' },
                { id: 'openai/gpt-oss-120b:free', name: 'gpt-oss-120b', description: '' },
                { id: 'openai/gpt-oss-20b:free', name: 'gpt-oss-20b', description: '' },
                { id: 'google/gemini-2.0-flash-exp:free', name: 'gemini-2.0-flash', description: '' },
                { id: 'google/gemini-2.5-pro-exp-03-25', name: 'gemini-2.5-pro', description: '' },

            ],
            selectedModel: 'deepseek/deepseek-chat-v3.1:free',
            apiKey: '',
            temperature: 0.7,
            maxTokens: 2000,
            customPrompt: `你是一个思维导图扩展助手。  
我会提供一个上下文，格式是 Markdown 风格的标题层级：  
- \`#\` 表示一级节点  
- \`##\` 表示二级节点  
- \`###\` 表示三级节点  
……以此类推。  
此外：  
- 如果某行不是标题（没有 #），它就是紧挨着的最近标题的"补充说明"。  
- 在生成时，请保持这个结构不变。  
你的任务： 
1. 阅读我提供的 [CONTEXT] 中的所有内容。  
2. 找到当前节点（上下文中的"当前节点"）。  
3. 只为该节点生成若干子节点，子节点的层级是比当前节点多一个 \`#\`。  
4. 每个子节点可以带一个可选的补充说明（单独一行文字，写在标题下方）。  
5. 不要生成无关的文字、对话或解释，只输出干净的结构。  
6. 输出时，用 \`[OUTPUT] ... [/OUTPUT]\` 包裹，方便解析。注意只在 [OUTPUT] 标签内生成内容，标签外不要输出任何东西。

重要规则：
- 只生成子节点，不要重复父节点或当前节点
- 不要返回任何父路径或当前节点的内容
- 只输出新子节点的内容
- 使用清晰的标题层级结构
- 每个子节点都要有合适的标题层级（当前节点层级 + 1）
- 补充说明要简洁明了
- 严格按照要求的层级格式输出
- 保持原有的顺序和层级关系

当前节点的全路径是：{{fullPath}}
当前节点的兄弟节点有：{{siblingNodes}}

---
[CONTEXT]  
{{context}}  
[/CONTEXT]`
        };
        // 确保jQuery可用
        this.jQueryAvailable = typeof $ !== 'undefined';
        if (!this.jQueryAvailable) {
            console.warn('jQuery未定义，某些UI功能可能受限');
        }
        this.loadConfig();

        // 加载内置提示词模板（从 ai/prompt-templates.json）
        this.promptTemplates = [];
        try {
            // 使用相对路径 fetch JSON 文件（在Electron/本地环境中若无法 fetch，可改为同步导入）
            fetch('./prompt-templates.json', { cache: 'no-cache' })
                .then(res => {
                    if (!res.ok) throw new Error('加载提示词模板失败: ' + res.status);
                    return res.json();
                })
                .then(list => {
                    if (Array.isArray(list)) {
                        this.promptTemplates = list;
                        console.log('提示词模板已加载:', this.promptTemplates);
                    }
                })
                .catch(err => {
                    console.warn('读取提示词模板失败:', err);
                });
        } catch (e) {
            console.warn('加载提示词模板遇到异常:', e);
        }
    }


    /**
     * 加载配置
     */
    loadConfig() {
        try {
            const savedConfig = localStorage.getItem(this.configKey);
            if (savedConfig) {
                this.config = JSON.parse(savedConfig);
                console.log('AI配置已加载:', this.config);
            } else {
                this.config = { ...this.defaultConfig };
                console.log('使用默认AI配置');
            }
        } catch (error) {
            console.error('加载AI配置失败:', error);
            this.config = { ...this.defaultConfig };
        }
        return this.config;
    }

    /**
     * 保存配置
     */
    saveConfig() {
        try {
            localStorage.setItem(this.configKey, JSON.stringify(this.config));
            console.log('AI配置已保存');
            return true;
        } catch (error) {
            console.error('保存AI配置失败:', error);
            return false;
        }
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        return this.saveConfig();
    }

    /**
     * 获取当前配置
     */
    getConfig() {
        return this.config;
    }

    /**
     * 获取所有可用模型
     */
    getModels() {
        return this.config.models || this.defaultConfig.models;
    }

    /**
     * 获取当前选择的模型
     */
    getSelectedModel() {
        const modelId = this.config.selectedModel || this.defaultConfig.selectedModel;
        return this.getModels().find(model => model.id === modelId) || this.getModels()[0];
    }

    /**
     * 设置API密钥
     */
    setApiKey(apiKey) {
        this.config.apiKey = apiKey;
        return this.saveConfig();
    }

    /**
     * 选择模型
     */
    selectModel(modelId) {
        this.config.selectedModel = modelId;
        return this.saveConfig();
    }

    /**
     * 更新提示词模板
     */
    updatePromptTemplate(template) {
        this.config.customPrompt = template;
        return this.saveConfig();
    }

    /**
     * 生成完整提示词
     */
    generatePrompt(context, fullPath, siblingNodes) {
        let prompt = this.config.customPrompt || this.defaultConfig.customPrompt;

        // 替换上下文
        prompt = prompt.replace('{{context}}', context);

        // 替换全路径
        prompt = prompt.replace('{{fullPath}}', fullPath || '');

        // 替换兄弟节点
        let siblingNodesText = '';
        if (Array.isArray(siblingNodes) && siblingNodes.length > 0) {
            siblingNodesText = siblingNodes.join(', ');
        }
        prompt = prompt.replace('{{siblingNodes}}', siblingNodesText);

        return prompt;
    }

    /**
     * 调用AI接口
     */
    async callAI(prompt) {
        if (!this.config.apiKey) {
            throw new Error('请先设置API密钥');
        }

        const model = this.getSelectedModel();
        if (!model) {
            throw new Error('请先选择AI模型');
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'MindWord Mind Map'
                },
                body: JSON.stringify({
                    model: model.id,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    temperature: this.config.temperature || 0.7,
                    max_tokens: this.config.maxTokens || 2000
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('AI调用失败:', error);
            throw error;
        }
    }

    /**
     * 解析AI返回的内容
     * 提取[OUTPUT]...[/OUTPUT]之间的内容，或者解析其他格式
     */
    parseAIResponse(response) {
        console.log('原始AI响应:', response);

        // 尝试提取[OUTPUT]...[/OUTPUT]内容
        const outputRegex = /\[OUTPUT\]([\s\S]*?)\[\/OUTPUT\]/;
        const match = response.match(outputRegex);

        if (match && match[1]) {
            console.log('提取到OUTPUT内容:', match[1]);
            return match[1].trim();
        }

        // 尝试提取markdown代码块
        const codeBlockRegex = /```(?:markdown)?\n([\s\S]*?)\n```/;
        const codeMatch = response.match(codeBlockRegex);
        if (codeMatch && codeMatch[1]) {
            console.log('提取到代码块内容:', codeMatch[1]);
            return codeMatch[1].trim();
        }

        // 如果没有找到特殊格式，返回原始响应（去除前后空白）
        const cleanResponse = response.trim();
        console.log('使用原始响应内容:', cleanResponse);
        return cleanResponse;
    }

    /**
     * 将AI返回的节点插入到思维导图中
     */
    async insertAINodes(response, selectedNodeId) {
        try {
            console.log('开始插入AI节点...');
            console.log('AI响应内容:', response);
            console.log('选中节点ID:', selectedNodeId);

            // 1. 解析AI响应内容
            const aiContent = this.parseAIResponse(response);
            console.log('解析后的AI内容:', aiContent);

            // 2. 获取jsMind实例 - 使用全局变量jm
            const jm = window.jm;
            if (!jm) {
                throw new Error('思维导图实例未找到');
            }
            console.log('成功获取jsMind实例');

            // 3. 获取选中的节点
            const selectedNode = jm.get_node(selectedNodeId);
            if (!selectedNode) {
                throw new Error('选中的节点不存在');
            }
            console.log('成功获取选中节点:', selectedNode);

            // 4. 解析AI内容为节点结构
            const nodes = this.parseAIContentToNodes(aiContent);
            console.log('解析出的节点结构:', nodes);

            if (nodes.length === 0) {
                console.warn('未解析出任何节点');
                return;
            }

            // 5. 批量添加节点到思维导图
            this.addNodesToMindMap(nodes, selectedNode, jm);

            // 6. 保存更改
            if (typeof debouncedSave === 'function') {
                debouncedSave();
            }

            console.log('AI节点插入完成');

        } catch (error) {
            console.error('插入AI节点失败:', error);
            throw error;
        }
    }

    /**
     * 解析AI内容为节点结构
     */
    parseAIContentToNodes(content) {
        console.log('开始解析AI内容为节点结构...');
        console.log('输入内容:', content);

        const nodes = [];

        // 移除首尾空白
        content = content.trim();

        // 如果内容为空，返回空数组
        if (!content) {
            console.log('内容为空');
            return nodes;
        }

        // 按行分割内容
        const lines = content.split('\n').filter(line => line.trim());
        console.log('分割后的行数:', lines.length);

        // 解析每一行为节点
        let lastNodeLevel = -1;
        let currentNode = null;

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                console.log(`处理第${index + 1}行: "${trimmedLine}"`);

                let level = 0;
                let topic = trimmedLine;
                let isHeader = false;

                // 检测标题层级
                const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.*)/);
                if (headerMatch) {
                    level = headerMatch[1].length;
                    topic = headerMatch[2];
                    isHeader = true;
                    console.log(`检测到标题层级${level}: "${topic}"`);
                } else {
                    // 检测markdown列表格式
                    const listMatch = trimmedLine.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
                    if (listMatch) {
                        level = Math.floor(listMatch[1].length / 2) + 1; // 每2个空格一级
                        topic = listMatch[3];
                        isHeader = true;
                        console.log(`检测到列表层级${level}: "${topic}"`);
                    } else {
                        // 检测数字开头的层级
                        const numberMatch = trimmedLine.match(/^(\d+)[\.、]\s*(.*)/);
                        if (numberMatch) {
                            topic = numberMatch[2];
                            level = 1;
                            isHeader = true;
                            console.log(`检测到数字层级1: "${topic}"`);
                        }
                    }
                }

                // 如果不是标题格式，可能是前一个节点的补充说明
                if (!isHeader && currentNode) {
                    console.log(`作为补充说明添加到前一个节点: "${trimmedLine}"`);
                    // 作为前一个节点的补充说明
                    if (currentNode.data.notes) {
                        currentNode.data.notes += '\n' + trimmedLine;
                    } else {
                        currentNode.data.notes = trimmedLine;
                    }
                    return; // 跳过当前行，继续处理下一行
                }

                // 创建新节点
                currentNode = {
                    topic: topic.trim(),
                    level: level,
                    data: {
                        level: level,
                        raw: trimmedLine,
                        notes: ''
                    }
                };

                nodes.push(currentNode);
                lastNodeLevel = level;
                console.log(`创建新节点: "${topic}" (层级: ${level})`);
            }
        });

        // 清理空白的notes字段
        nodes.forEach(node => {
            if (!node.data.notes) {
                delete node.data.notes;
            }
        });

        console.log(`解析完成，共创建${nodes.length}个节点`);
        return nodes;
    }

    /**
     * 将节点添加到思维导图
     */
    addNodesToMindMap(nodes, parentNode, jmInstance) {
        if (!nodes || nodes.length === 0) {
            console.warn('没有节点需要添加');
            return;
        }

        console.log('开始按顺序添加节点到思维导图...');
        console.log('原始节点顺序:', nodes.map(n => ({ topic: n.topic, level: n.level })));

        // 不再按层级排序，保持原始顺序
        // const sortedNodes = nodes.sort((a, b) => a.level - b.level);

        // 记录已添加的节点，用于层级关系 - 按层级分组存储
        const addedNodesByLevel = {};
        const addedNodes = []; // 按添加顺序记录

        nodes.forEach((node, index) => {
            try {
                // 生成节点ID
                const nodeId = 'ai_node_' + Date.now() + '_' + index;

                // 确定父节点
                let targetParent = parentNode;

                // 根据层级找到合适的父节点
                if (node.level > 1) {
                    // 找到上一级的节点作为父节点
                    const parentLevel = node.level - 1;
                    if (addedNodesByLevel[parentLevel] && addedNodesByLevel[parentLevel].length > 0) {
                        // 使用最近添加的父层级节点
                        targetParent = addedNodesByLevel[parentLevel][addedNodesByLevel[parentLevel].length - 1];
                    }
                }

                // 准备节点数据
                const nodeData = { ...node.data };
                if (node.data.notes) {
                    nodeData.notes = node.data.notes;
                }

                // 添加节点到思维导图
                const newNode = jmInstance.add_node(targetParent.id, nodeId, node.topic, nodeData);

                // 记录已添加的节点
                const addedNode = {
                    id: nodeId,
                    topic: node.topic,
                    level: node.level,
                    data: nodeData,
                    node: newNode // 保存实际节点引用
                };

                // 按层级分组记录
                if (!addedNodesByLevel[node.level]) {
                    addedNodesByLevel[node.level] = [];
                }
                addedNodesByLevel[node.level].push(addedNode);

                // 按顺序记录
                addedNodes.push(addedNode);

                console.log(`成功添加节点: "${node.topic}" (层级: ${node.level}, 父节点: "${targetParent.topic}")`);

            } catch (error) {
                console.error('添加节点失败:', error);
                console.error('节点信息:', node);
            }
        });

        console.log(`总共添加了 ${addedNodes.length} 个节点`);
        console.log('添加的节点层级分布:', Object.keys(addedNodesByLevel).map(level => ({
            level: parseInt(level),
            count: addedNodesByLevel[level].length
        })));

        // 如果有节点被添加，展开父节点并选中第一个新节点
        if (addedNodes.length > 0) {
            // 展开父节点以显示新添加的子节点
            jmInstance.expand_node(parentNode.id);

            // 选中第一个添加的节点
            const firstNode = addedNodes[0];
            if (firstNode.node) {
                jmInstance.select_node(firstNode.node);
            }
        }
    }
}

// 默认导出
export default AIConfigManager;