@echo off
setlocal enabledelayedexpansion

color 0A
cls

echo.
echo ============================================
echo   🎮 PRESIDENT GAME v1.6.15 DEPLOY SCRIPT
echo ============================================
echo.

REM Check if git is initialized
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Not a git repository!
    echo.
    echo Please run "git init" in this folder first.
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

REM Check git config
for /f "tokens=*" %%i in ('git config user.email') do set EMAIL=%%i
if "%EMAIL%"=="" (
    echo ⚠️  Git email not configured
    echo Run: git config --global user.email "your@email.com"
    echo.
    pause
    exit /b 1
)
echo ✅ Git user configured: %EMAIL%
echo.

REM Stage files
echo ⏳ Staging all files...
git add .
if errorlevel 1 (
    echo ❌ ERROR: Failed to stage files
    echo.
    pause
    exit /b 1
)
echo ✅ Files staged successfully
echo.

REM Check if there's anything to commit
git diff-index --quiet --cached HEAD
if errorlevel 0 (
    echo ℹ️  No changes to commit
    echo.
    pause
    exit /b 0
)

REM Commit
echo ⏳ Creating commit...
git commit -m "v1.6.15 - Swap bugfixes, game improvements, and Fly deployment ready"
if errorlevel 1 (
    echo ⚠️  Commit failed or nothing new to commit
    echo.
    pause
    exit /b 1
)
echo ✅ Commit created successfully
echo.

REM Check remote
echo ⏳ Checking remote repository...
git remote -v >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: No remote configured
    echo.
    pause
    exit /b 1
)
echo ✅ Remote repository found
echo.

REM Push
echo ⏳ Pushing to origin/%BRANCH%...
git push origin %BRANCH%
if errorlevel 1 (
    echo ❌ ERROR: Push failed!
    echo.
    echo Check your internet connection and GitHub credentials.
    echo.
    pause
    exit /b 1
)
echo ✅ Push successful!
echo.

echo ============================================
echo   ✅ ALL STEPS COMPLETED SUCCESSFULLY!
echo ============================================
echo.
echo 📊 Summary:
echo   ✓ Files staged
echo   ✓ Commit created
echo   ✓ Changes pushed to origin/%BRANCH%
echo.
echo 🎯 Next step:
echo   Run: flyctl deploy
echo.
echo ============================================
echo.
pause
