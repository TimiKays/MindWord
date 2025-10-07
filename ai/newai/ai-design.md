# AI 弹窗壳组件与三面板设计规范

目标
- 去耦合：壳组件负责通用 UI/交互；业务逻辑下沉到三面板（AI 应用 / AI 配置 / 模板管理）。
- 统一调用协议：清晰的 props/事件/数据结构，支持可视化（visual）与无界面直连（headless）两种模式。
- 模板强校验与替换：占位符可视化编辑/预览，或在 headless 下直接替换并发送。

组件分层
- ModalShell（壳）
  - 只包含：标题、右上角关闭按钮、遮罩与层级、滚动/焦点管理（可访问性）、内容插槽。
  - 不包含：底部操作按钮（各面板自带）。
  - 提供：props、事件、插槽；统一处理关闭、提交、错误转发。
- 三面板
  - AIAppsPanel：应用管理（启用/禁用/详情）。
  - AIConfigPanel：平台与模型配置（密钥、模型、采样参数等）。
  - TemplateManagerPanel：模板增删改查、占位符与预览。

调用模式（mode）
- visual：渲染完整 UI；允许用户编辑占位符、查看预览、确认后发送。
- headless：不渲染 UI；按外部传参直接执行“校验 → 替换 → 发送/或 dryRun”。

对外接口（props）
- title?: string = "AI 服务"
- initialView?: 'apps' | 'config' | 'templates' = 'templates'
- mode?: 'visual' | 'headless' = 'visual'
- platformConfig?: {
  provider?: 'openai' | 'azure' | 'qwen' | 'glm' | string
  endpoint?: string
  apiKey?: string
  extra?: Record<string, any>
}
  - 为空或未传：启用组件内默认（注意安全兜底：无密钥不可发送）。
- modelConfig?: {
  model?: string
  temperature?: number
  top_p?: number
  max_tokens?: number
  stop?: string[] 
  extra?: Record<string, any>
}
  - 为空或未传：使用组件内默认。
- templateData: {
  templateId?: string
  templateText?: string  // 与 templateId 二选一；推荐 templateId 做版本管理
  placeholders: Record<string, any>
  placeholderFormat?: '{{name}}' | '${name}' | '%name%' | string
}
  - 必传：用于替换和预览。若仅传 templateText，会提示调用方版本不可追踪。
- options?: {
  allowEditTemplates?: boolean = true
  allowPreview?: boolean = true
  autoSendOnConfirm?: boolean = true
  validateStrict?: boolean = true  // 严格校验占位符完整性
  missingPolicy?: 'error' | 'keep' | 'default' = 'error'
  defaultPlaceholderValue?: string = ''  // 当 missingPolicy=default 时使用
  lazyLoadPanels?: boolean = true
  dryRun?: boolean = false  // headless 下可只返回 resolvedText，不发请求
}
- context?: any  // 额外上下文（如业务元数据、用户选中内容等）

事件回调（壳对外）
- onClose: (reason: 'user' | 'programmatic' | 'error') => void
- onSubmit: (payload: {
    platformConfig
    modelConfig
    resolvedText: string
    usedPlaceholders: string[]
    missingPlaceholders: string[]
    templateMeta?: { templateId?: string; version?: string }
    context?: any
  }) => void
- onError: (error: { code: string; message: string; detail?: any }) => void
- onDirtyChange: (dirty: boolean) => void

面板与壳的通信（子组件向壳派发）
- 'save'：{ scope: 'apps' | 'config' | 'templates', data: any }
- 'cancel'
- 'preview'：{ resolvedText, usedPlaceholders, missingPlaceholders }
- 'validateFailed'：{ errors: Array<{ field: string; message: string }> }

模板与占位符处理
- 默认格式：'{{name}}'；可通过 placeholderFormat 自定义（例如 '${name}'）。
- 替换策略（受 options 控制）：
  - validateStrict=true：模板中出现的每个占位符必须提供值，否则 error。
  - missingPolicy:
    - error：报错并中断
    - keep：保留原占位符文本
    - default：用 defaultPlaceholderValue 替换
- 预览：
  - visual 模式：支持“原始模板/替换后内容”对照或切换展示，可选差异高亮。
  - 结构化返回：resolvedText、usedPlaceholders、missingPlaceholders。

发送与安全兜底
- 无密钥或 endpoint 不合法：onError 提示并中止发送。
- 长度/合规校验：可在提交前统一处理（如超长、敏感词、配额提示）。
- headless + dryRun：仅返回 resolvedText，不实际发起请求。

状态与导航
- 父层维护 currentView：'apps' | 'config' | 'templates'
- visual 模式：支持在壳内切换面板；或外部以三个独立弹窗分别启动。
- 性能：lazyLoadPanels=true 时按需加载面板资源。

扩展性
- provider 抽象：通过 provider 字段选择不同厂商；extra 传递特定配置。
- 模板来源：templateId 由内部存储/服务端管理；可扩展多版本与锁定策略。
- 统一 API 适配层：将不同平台/模型的调用序列化为统一 payload。

错误码建议
- MISSING_TEMPLATE: 未提供 templateId/templateText
- MISSING_PLACEHOLDER: 缺少占位符值（严格模式）
- INVALID_CONFIG: 平台或模型配置不完整
- SEND_FAILED: 调用三方接口失败
- PREVIEW_FAILED: 模板替换失败

最小调用示例（文档伪代码）
- visual 模式
  - 目标：让用户编辑占位符并预览后发送
  - 形参：
    - title: "创作助手"
    - initialView: "templates"
    - platformConfig: 可不传（使用默认）；但发送前需设置密钥
    - modelConfig: 可不传（使用默认模型）
    - templateData: 
      - templateId: "blog_intro_v2"
      - placeholders: { topic: "AI 助手", audience: "产品经理" }
    - options: { allowPreview: true, validateStrict: true }
    - onSubmit: (payload) => { console.log('发送载荷', payload) }
    - onError: (err) => { console.error(err) }

- headless 模式（直连）
  - 目标：不弹 UI，直接替换并发送
  - 形参：
    - mode: "headless"
    - platformConfig: { provider: "qwen", endpoint: "...", apiKey: "..." }
    - modelConfig: { model: "qwen-turbo", temperature: 0.7 }
    - templateData:
      - templateText: "请为{{audience}}写一段关于{{topic}}的简介"
      - placeholders: { topic: "知识管理", audience: "初学者" }
    - options: { validateStrict: true, dryRun: false }
    - onSubmit: (payload) => { /* 成功回调 */ }
    - onError: (err) => { /* 失败回调 */ }

Demo 约定（文档说明）
- 文件建议：ai/newai/demo-caller.html（演示 visual 与 headless 两种用法）
  - visual：点击按钮打开壳，传入上述参数；在页面内展示 onSubmit/onError 的结果。
  - headless：点击“直接生成”按钮，模拟后端流程（可加 dryRun 按钮只看替换结果）。
- 注：当前仅提供设计与参数约定。如需，我可以在后续提交中创建 demo-caller.html 并内置简单交互。

变更迁移建议
- 第一阶段：抽出 ModalShell，保留现有功能，三面板迁移但不改交互。
- 第二阶段：引入 mode 支持与模板严格校验，打通 headless 流程。
- 第三阶段：完善 provider 适配层与模板版本管理，扩展高级选项（差异高亮、历史记录等）。

FAQ
- 不传 platformConfig/modelConfig 会怎样？
  - 使用组件默认；但若无有效 apiKey，将阻止发送并 onError。
- templateData 为何必传？
  - 模板是核心产物；无模板无法生成内容。建议优先传 templateId 以支持版本管理。
- 三个面板是否必须集成在同一壳？
  - 否。可选单壳多面板切换，或三个独立弹窗。推荐按业务流程选择。