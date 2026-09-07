@echo off
setlocal enabledelayedexpansion
title Stock Manager - Build Setup.exe
cd /d "%~dp0"

echo =======================================================
echo   Stock Manager - Build Windows Setup.exe Installer
echo =======================================================
echo.

REM 1. Activate venv or run setup
if not exist "venv\Scripts\activate.bat" (
    echo Setting up environment first...
    call "%~dp0install_windows.bat"
)
call venv\Scripts\activate.bat

REM 2. Install PyInstaller
echo.
echo [1/4] Ensuring PyInstaller is installed...
pip install pyinstaller --quiet

REM 3. Ensure frontend is built
echo.
echo [2/4] Verifying frontend production build...
if not exist "frontend\dist\index.html" (
    echo Building frontend React assets...
    pushd frontend
    call npm install
    call npm run build
    popd
) else (
    echo Frontend build found.
)

REM 4. Build Standalone Folder with PyInstaller
echo.
echo [3/4] Compiling Python & FastAPI into standalone executable...
pyinstaller --clean -y StockManager.spec
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller compilation failed!
    pause
    exit /b 1
)

REM 5. Locate Inno Setup Compiler (ISCC)
echo.
echo [4/4] Compiling Windows Setup Wizard with Inno Setup...
set ISCC_PATH=
where iscc >nul 2>nul
if %errorlevel% equ 0 (
    set ISCC_PATH=iscc
) else if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files (x86)\Inno Setup 5\ISCC.exe" (
    set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 5\ISCC.exe"
)

if "%ISCC_PATH%"=="" (
    echo Inno Setup not detected. Attempting to install via winget...
    winget install JRSoftware.InnoSetup -e --silent --accept-source-agreements --accept-package-agreements >nul 2>nul
    if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
        set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    )
)

if "%ISCC_PATH%"=="" (
    echo.
    echo [NOTE] Standalone application folder successfully created at:
    echo        --> dist\StockManager\
    echo.
    echo To create the single StockManager_Setup.exe installer:
    echo 1. Download and install Inno Setup (free) from: https://jrsoftware.org/isdl.php
    echo 2. Right-click 'installer.iss' and click 'Compile', or run this script again.
    echo.
    pause
    exit /b 0
)

"%ISCC_PATH%" installer.iss
if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo   INSTALLER CREATED SUCCESSFULLY!
    echo   --> Output\StockManager_Setup.exe
    echo.
    echo   This is the single file you give to clients.
    echo   They just double-click it to install!
    echo =======================================================
    echo.
    explorer.exe Output
) else (
    echo [ERROR] Inno Setup compilation failed.
)
pause
