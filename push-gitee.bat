@echo off
echo 📤 同步镜像到 Gitee...
git push gitee main
if %errorlevel% neq 0 (
    echo ⚠️  Gitee 同步失败，请检查网络和认证
    pause
    exit /b 1
)
echo ✅ Gitee 镜像同步成功！
pause