# MindWord E2E 测试文档

## 安装依赖
```bash
npm install
npx playwright install
```

## 运行测试
```bash
# 运行所有测试
npm run test:e2e

# 打开UI界面
npm run test:e2e:ui
```
只运行文件名匹配的文件
npx playwright test 1_pagevisit

带可视化界面运行
npx playwright test tests/e2e/1_pagevisit.js --project=chromium --headed

## 测试用例说明

### mindword-basic.spec.js
- **打开应用并创建节点**: 验证应用正常加载，根节点存在，可以创建新节点
- **导入Markdown并验证转换**: 测试Markdown导入功能，验证转换后的节点数量

## 注意事项
测试前确保应用可以通过 http://localhost:8000 访问，可以临时用Python启个服务：
```bash
python -m http.server 8000
```