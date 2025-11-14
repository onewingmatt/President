@echo off
setlocal enabledelayedexpansion

color 0A
cls

echo.
echo =============================================
echo   GIT PUSH RECOVERY
echo =============================================
echo.

echo ⏳ Pulling changes from GitHub...
git pull origin main --allow-unrelated-histories
if errorlevel 1 (
    echo ⚠️  Pull had issues, trying with --force-rebase...
    git pull origin main --rebase --allow-unrelated-histories
)
echo ✅ Changes pulled
echo.

echo ⏳ Pushing your local changes...
git push origin main
if errorlevel 1 (
    echo ❌ Push still failing, trying force push...
    git push -u origin main --force
    if errorlevel 1 (
        echo ❌ Force push failed
        pause
        exit /b 1
    )
)
echo ✅ Push successful!
echo.

echo =============================================
echo   ✅ PUSH COMPLETE!
echo =============================================
echo.
echo Next: flyctl deploy
echo.
pause
