@echo off
echo 📤 推送到 GitHub（主力仓库）...
git push origin main
if %errorlevel% neq 0 (
    echo ❌ GitHub 推送失败！
    pause
    exit /b 1
)
echo ✅ GitHub 推送成功！
echo.
echo 💡 提示：Gitee 镜像可运行 push-gitee.bat 手动同步
pause