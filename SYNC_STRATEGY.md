# 🔄 GitHub为主，Gitee镜像同步策略

## 📋 策略说明
- **GitHub**: 主力仓库，所有开发推送到这里
- **Gitee**: 镜像仓库，国内访问优化，偶尔同步即可
- **本地**: 一套代码，两套远程，互不干扰

## 🚀 日常使用

### 方案1：一键双推（推荐）
```bash
# 提交代码
git add .
git commit -m "你的提交信息"

# 一键推送到两个平台
双击 push-all.bat
```

### 方案2：GitHub优先
```bash
# 提交代码
git add .
git commit -m "你的提交信息"

# 只推送到GitHub（主力）
双击 push-github.bat

# 偶尔想同步Gitee时
双击 push-gitee.bat
```

## 📊 推送策略对比

| 脚本 | 作用 | 失败影响 | 使用场景 |
|-----|-----|---------|----------|
| `push-all.bat` | GitHub+Gitee同时推送 | Gitee失败不影响GitHub | 网络良好时，一次搞定 |
| `push-github.bat` | 仅推送GitHub | 必须成功 | 日常开发，最常用 |
| `push-gitee.bat` | 仅同步Gitee | 可重试 | 偶尔同步，国内分享 |

## ⚙️ 配置检查

```bash
# 查看远程仓库配置
git remote -v

# 应该显示：
# origin  https://github.com/你的用户名/MindWord.git (fetch)
# origin  https://github.com/你的用户名/MindWord.git (push)
# gitee   https://gitee.com/你的用户名/MindWord.git (fetch)
# gitee   https://gitee.com/你的用户名/MindWord.git (push)
```

## 🎯 最佳实践

1. **日常开发**: 用 `push-github.bat`，简单快速
2. **重要更新**: 用 `push-all.bat`，双保险
3. **国内分享**: 偶尔用 `push-gitee.bat`，保持同步
4. **网络不佳**: 只用 `push-github.bat`，Gitee稍后同步

## 💡 优势

- ✅ **一套代码**: 不用维护多个副本
- ✅ **GitHub主力**: 国际通用，协作开发
- ✅ **Gitee镜像**: 国内访问速度快
- ✅ **灵活推送**: 根据网络情况选择
- ✅ **失败容错**: Gitee失败不影响主力开发

## 🔄 自动同步（可选）

如果你希望Gitee自动同步，可以在Gitee仓库设置中：
1. 开启「自动同步」功能
2. 设置定时从GitHub拉取更新
3. 这样就不需要手动推送Gitee了