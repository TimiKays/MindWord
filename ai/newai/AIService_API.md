# AI 弹窗组件（父页面托管）调用文档

概述  
父页面（demo-caller.html）为子 iframe 提供了两种调用 AI 服务的方式：modal（弹窗）与 headless（silent，无弹窗）。子页面通过 postMessage 向父页面发送请求，父页面负责转发到 aiModalFrame（AIServiceModal.html），并将结果回传给发起方。

请求与响应总览  
- 请求类型（子 -> 父）: AI_MODAL_OPEN_REQUEST  
- 父转发给 aiModalFrame（modal）: AI_MODAL_OPEN（payload 带 requestId）  
- 父 headless 转发（无弹窗）: AI_MODAL_OPEN（payload 带 requestId, mode:'silent'）  
- aiModalFrame 返回（modal）: AI_MODAL_RESULT（带 requestId, status, detail）  
- aiModalFrame 返回（headless）: AI_MODAL_RESULT（带 requestId, status, detail）  
- 父统一转发回子 iframe: AI_MODAL_RESULT

两种调用模式（区别与适用场景）
1. Modal（默认）
- 行为：父页面展示 aiModalFrame（弹窗），用户在弹窗内配置或确认后运行，由 aiModalFrame 发回结果。
- 适用：需要用户交互、选择模型/平台或查看执行过程的场景。
- 发起方式：子页面发送 AI_MODAL_OPEN_REQUEST，payload 不含 mode 或 mode !== 'silent'。

2. Headless / silent（无弹窗）
- 行为：父页面在后台将请求转发给 aiModalFrame 并不显示弹窗（modal 隐藏或不打开），直接等待结果并回传给子 iframe。
- 适用：子页面希望以编程方式直接获取结果、或在已知平台配置（apiKey 等）后快速调用。
- 发起方式：在请求中加入 payload.mode = 'silent'。

请求字段（子 -> 父）
字段说明（payload 位于 AI_MODAL_OPEN_REQUEST.payload）：
- requestId (string)  
  - 唯一请求标识（子端负责生成），格式示例：r_xxx
- mode (optional, string)  
  - 'silent' 表示 headless，无弹窗；缺省或其它表示 modal。
- platformConfig (object)  
  - 可选。指定调用平台（provider, apiKey, azureEndpoint, cloudflareAccountId 等）。若未提供，父页面会尝试从 aiModalFrame.localStorage 选择已保存的平台（同源可用）。
- modelConfig (object)  
  - 可选。模型相关参数（如 model 名称、温度等）。
- templateData (object) 或 template / params（兼容旧字段）  
  - templateData.templateText (string) — 模板文本（必需，若为空父页面会尝试用 placeholders.input.value 或 payload.template 补齐）  
  - templateData.placeholders (object) — 占位符集合；常见形式：
      - { input: { desc: '右侧输入', value: '用户内容' } }
      - 或 { input: '用户内容' }（兼容）
- options (object)  
  - 可选的额外选项（如超时、上下文设置等）

注意：为了避免 "未提供模板文本" 错误，确保 templateData.templateText 非空。父页面已实现补齐逻辑：当 templateText 为空时，会优先使用 templateData.placeholders.input.value 或 payload.template。

示例（Modal）
{
  "type": "AI_MODAL_OPEN_REQUEST",
  "requestId": "r_abc123",
  "payload": {
    "platformConfig": { "provider": "openrouter", "apiKey": "sk-..." },
    "modelConfig": {},
    "templateData": {
      "templateText": "{{input}}",
      "placeholders": { "input": { "desc": "右侧输入", "value": "测试内容" } }
    },
    "options": {}
  }
}

示例（Headless / silent）
{
  "type": "AI_MODAL_OPEN_REQUEST",
  "requestId": "r_silent_01",
  "payload": {
    "mode": "silent",
    "platformConfig": { "provider": "openrouter", "apiKey": "sk-..." },
    "modelConfig": {},
    "templateData": {
      "templateText": "",
      "placeholders": { "input": { "value": "直接作为模板的输入" } }
    },
    "options": {}
  }
}
（父页面会把模板文本补齐为 placeholders.input.value）

返回消息（父 -> 子，统一格式）
{
  "type": "AI_MODAL_RESULT",
  "requestId": "r_abc123",
  "status": "ok" | "error",
  "detail": { ... }  // 成功或失败的详细信息（由 aiModalFrame 提供）
}

常见错误与处理建议
- "未提供模板文本"：确保 templateData.templateText 非空；若只提供 placeholders，请将输入放入 templateText 或使用 "{{input}}" 模板并提供 placeholders。父页面已尽力补齐，但最好在调用端保证 templateText 有合理值。
- 无可用 platformConfig：如果 mode='silent' 且未提供 platformConfig，父页会尝试从 aiModalFrame.localStorage 读取已保存平台；若仍未找到，会打开配置视图并返回错误。建议在 headless 调用时传入完整 platformConfig（含 apiKey 或 azureEndpoint 等）。
- headless 超时：父页面默认 15s 超时回退（可在父脚本中调整）。若需要更长运行时间，请在 options 中注明并确保后端支持。

调试建议
- 在子页面发送前 console.log(payload) 并在浏览器网络或 devtools 的 postMessage 中观察实际传输的对象，确认 templateData.templateText 是否非空。
- 如果使用跨域 iframe，localStorage 访问可能失败；在 headless 模式下请明确提供 platformConfig。

扩展说明（实现细节）
- 父页面会保存 reqMap（requestId -> 发起者 window），用于在 aiModalFrame 返回后正确转发结果并清理映射。
- headless 调用会在父页面设置超时计时器（默认 15000ms），超时后回退错误并清理状态。
- 父页面在构建 headlessPayload 时，若 templateText 为空，会尝试按优先级填充：placeholders.input.value -> payload.template。

联系人与维护
- 若需变更超时、补齐优先级或新增字段，请在 ai/newai/demo-caller.html 中查找 headlessPayload 构建逻辑并同步修改。