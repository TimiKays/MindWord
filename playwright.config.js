import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',  // 测试文件存放目录
  fullyParallel: true,        // 启用完全并行执行测试
  forbidOnly: !!process.env.CI,    // CI环境下禁止只运行单个测试
  retries: process.env.CI ? 2 : 0, // CI环境失败重试2次，本地不重试
  workers: process.env.CI ? 1 : undefined, // CI环境用1个工作进程，本地自动
  reporter: 'html',      // 生成HTML测试报告

  use: {
    baseURL: 'http://127.0.0.1:5505/',
    trace: 'on-first-retry',  // 第一次重试时记录操作轨迹
  },

  projects: [
    {
      name: 'chromium',      // 项目名称
      use: { ...devices['Desktop Chrome'] }, // 使用Chrome浏览器配置
    },
  ],
});