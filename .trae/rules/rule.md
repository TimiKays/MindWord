每次发布前，需要运行一条命令：

```
node update-version.js
```
这个脚本会自动：

1. 生成新的版本号（格式：年.月.日.时分）
2. 更新 version.json 文件
3. 更新 sw.js 中的 SW_VERSION
4. 给所有HTML中的业务代码引用添加版本号