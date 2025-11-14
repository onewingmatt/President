@echo off
REM President Card Game - AGGRESSIVE Setup
REM Forces complete file replacement

echo ==========================================
echo President Card Game - AGGRESSIVE Setup
echo v1.4.0
echo ==========================================
echo.

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not installed!
    pause
    exit /b 1
)

REM Check for ZIP in parent directory
if not exist "..\president-game.zip" (
    echo ERROR: president-game.zip not found in parent directory!
    pause
    exit /b 1
)

echo Step 1: DELETING old files...
if exist "server" (
    rmdir /s /q "server" >nul 2>&1
    echo - Deleted server/ folder
)
if exist "test-client.html" (
    del /f /q "test-client.html" >nul 2>&1
    echo - Deleted test-client.html
)
if exist "package.json" (
    del /f /q "package.json" >nul 2>&1
    echo - Deleted package.json
)
if exist "README.md" (
    del /f /q "README.md" >nul 2>&1
    echo - Deleted README.md
)

echo.
echo Step 2: Extracting fresh files...
PowerShell -NoProfile -Command "Expand-Archive -Path '..\president-game.zip' -DestinationPath '.' -Force" >nul 2>&1

if %errorlevel% neq 0 (
    echo ERROR: Failed to extract!
    pause
    exit /b 1
)

echo Step 3: Moving files from president-game\ to current directory...
REM Use robocopy for reliable file copying
robocopy "president-game" "." /E /MOVE /NFL /NDL /NJH /NJS >nul 2>&1

REM Remove empty president-game folder
if exist "president-game" (
    rmdir /q "president-game" >nul 2>&1
)

echo.
echo Files extracted successfully!
echo.
echo Step 4: Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo ==========================================
echo SUCCESS! Setup complete.
echo ==========================================
echo.
echo Starting server...
echo Open test-client.html in your browser
echo.

call npm start

pause
