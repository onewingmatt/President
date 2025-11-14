@echo off
setlocal enabledelayedexpansion

color 0A
cls

echo.
echo =====================================================
echo   🎮 PRESIDENT GAME - GIT TO FLY DEPLOY SCRIPT
echo =====================================================
echo.

REM Check if git is initialized
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Not a git repository!
    echo.
    pause
    exit /b 1
)

echo ✅ Git repository found
echo.

REM Get current branch
for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%i
echo 📍 Current branch: %BRANCH%
echo.

REM Get git user
for /f "tokens=*" %%i in ('git config user.email') do set EMAIL=%%i
echo 👤 Git user: %EMAIL%
echo.

REM Stage files
echo ⏳ Step 1/3: Staging files...
git add .
if errorlevel 1 (
    echo ❌ ERROR: Failed to stage files
    echo.
    pause
    exit /b 1
)
echo ✅ Files staged
echo.

REM Commit
echo ⏳ Step 2/3: Creating commit...
git commit -m "v1.6.16 - Updated deployment package"
if errorlevel 1 (
    echo ⚠️  No changes to commit (already up to date)
    goto :check_push
)
echo ✅ Commit created
echo.

:check_push
REM Push
echo ⏳ Step 3a/3: Pushing to GitHub...
git push origin %BRANCH%
if errorlevel 1 (
    echo ❌ ERROR: Push failed!
    echo.
    pause
    exit /b 1
)
echo ✅ Pushed to GitHub!
echo.

REM Deploy to Fly
echo ⏳ Step 3b/3: Deploying to Fly.io...
echo.
flyctl deploy
if errorlevel 1 (
    echo ❌ ERROR: Deployment failed!
    echo.
    pause
    exit /b 1
)

echo.
echo =====================================================
echo   ✅ DEPLOYMENT COMPLETE!
echo =====================================================
echo.
echo 📊 Summary:
echo   ✓ Files staged and committed
echo   ✓ Pushed to GitHub origin/%BRANCH%
echo   ✓ Deployed to Fly.io
echo.
echo 🎮 Play now: https://president.fly.dev
echo.
echo =====================================================
echo.
pause
