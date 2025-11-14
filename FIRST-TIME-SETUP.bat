@echo off
setlocal enabledelayedexpansion

color 0A
cls

echo.
echo =============================================
echo   INITIAL GIT SETUP - FIRST TIME ONLY
echo =============================================
echo.

echo Step 1: Create initial commit...
git commit -m "Initial commit - President Game v1.6.15"
if errorlevel 1 (
    echo ❌ Commit failed
    pause
    exit /b 1
)
echo ✅ Commit created
echo.

echo Step 2: Rename branch to main...
git branch -M main
if errorlevel 1 (
    echo ❌ Branch rename failed
    pause
    exit /b 1
)
echo ✅ Branch renamed to main
echo.

echo Step 3: Add remote origin...
git remote add origin https://github.com/onewingmatt/President.git
if errorlevel 1 (
    echo ⚠️  Remote might already exist, that's OK
)
echo.

echo Step 4: Push to GitHub...
git push -u origin main
if errorlevel 1 (
    echo ❌ Push failed
    echo Check: https://github.com/onewingmatt/President
    pause
    exit /b 1
)
echo ✅ Pushed to GitHub!
echo.

echo =============================================
echo   ✅ INITIAL SETUP COMPLETE!
echo =============================================
echo.
echo Next: flyctl deploy
echo.
pause
