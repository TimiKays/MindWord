@echo off
echo 🚀 GitHub为主，Gitee镜像同步策略
echo.

:: GitHub 主力推送
echo 📤 正在推送到 GitHub（主力仓库）...
git push origin main
if %errorlevel% neq 0 (
    echo ❌ GitHub 推送失败！请检查网络和认证
    pause
    exit /b 1
)
echo ✅ GitHub 推送成功！
echo.

:: Gitee 镜像推送（失败不中断）
echo 📤 正在同步镜像到 Gitee...
git push gitee main
if %errorlevel% neq 0 (
    echo ⚠️  Gitee 同步失败（不影响GitHub），可稍后手动同步
    echo    失败原因可能是：网络问题、Gitee认证过期等
) else (
    echo ✅ Gitee 镜像同步成功！
)

echo.
echo 🎉 主力推送完成！GitHub 已是最新代码
echo    Gitee 镜像：成功则同步，失败不影响主流程
pause