@echo off
setlocal enabledelayedexpansion
title Stock Manager - Windows Setup & Dependency Installer
cd /d "%~dp0"

echo =======================================================
echo   Stock Manager (Offline Edition) - Windows Setup
echo =======================================================
echo.

REM 1. Check for Python
echo [1/5] Checking Python installation...
set PYTHON_CMD=
where python >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=python
) else (
    where py >nul 2>nul
    if %errorlevel% equ 0 (
        set PYTHON_CMD=py -3
    )
)

if "%PYTHON_CMD%"=="" (
    echo.
    echo [ERROR] Python is not installed or not added to your PATH.
    echo.
    echo To use Stock Manager on Windows:
    echo 1. Download Python 3.10+ from: https://www.python.org/downloads/
    echo 2. During installation, CHECK the box: "Add Python to PATH"
    echo 3. Once installed, run this installer again.
    echo.
    pause
    exit /b 1
)

echo Python command: %PYTHON_CMD%
%PYTHON_CMD% --version

REM 2. Handle existing / incompatible venv (e.g., copied from Mac/Linux)
echo.
echo [2/5] Preparing Windows Virtual Environment (venv)...
if exist "venv\bin" (
    echo Detected a macOS/Linux virtual environment. Removing incompatible venv...
    rmdir /s /q venv
)

if not exist "venv\Scripts\activate.bat" (
    echo Creating fresh Windows virtual environment in .\venv ...
    %PYTHON_CMD% -m venv venv
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to create virtual environment.
        echo Please ensure the Python venv module is installed.
        pause
        exit /b 1
    )
)
echo Virtual environment ready.

REM 3. Install Backend Dependencies
echo.
echo [3/5] Installing backend dependencies from backend\requirements.txt...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet
pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to install required Python packages.
    echo Please verify your internet connection and try again.
    pause
    exit /b 1
)
echo All backend packages installed successfully.

REM 4. Check Frontend Static Assets
echo.
echo [4/5] Checking frontend user interface...
if not exist "frontend\dist\index.html" (
    echo frontend\dist not found. Checking Node.js to build frontend...
    where npm >nul 2>nul
    if %errorlevel% equ 0 (
        echo Building frontend assets with npm...
        pushd frontend
        call npm install
        call npm run build
        popd
    ) else (
        echo [WARNING] Node.js/npm not detected and frontend\dist is missing.
        echo If you cloned from Git, please run 'npm install && npm run build' inside frontend\.
        echo If you received a pre-built release package, ensure the frontend\dist folder is present.
    )
) else (
    echo Frontend build verified (frontend\dist\index.html is present).
)

REM 5. Create Desktop Shortcut
echo.
echo [5/5] Creating Desktop Shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desk = [System.Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $desk 'Stock Manager.lnk')); $s.TargetPath = (Join-Path '%~dp0' 'start_app.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'Offline Stock Manager POS & Inventory'; $s.Save()" >nul 2>nul
if %errorlevel% equ 0 (
    echo Desktop shortcut 'Stock Manager' created successfully.
) else (
    echo (Note: Desktop shortcut could not be created automatically. You can launch using start_app.bat)
)

echo.
echo =======================================================
echo   Setup Completed Successfully!
echo   You can now launch Stock Manager from your Desktop
echo   shortcut or by double-clicking start_app.bat.
echo =======================================================
echo.
pause
