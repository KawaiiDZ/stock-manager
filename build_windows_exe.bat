@echo off
setlocal enabledelayedexpansion
title Stock Manager - Windows Standalone EXE Builder
cd /d "%~dp0"

echo =======================================================
echo   Stock Manager - Standalone Windows EXE Packager
echo =======================================================
echo.

if not exist "venv\Scripts\activate.bat" (
    echo [INFO] Running installer setup first...
    call "%~dp0install_windows.bat"
)

call venv\Scripts\activate.bat

echo [1/3] Installing PyInstaller...
pip install pyinstaller --quiet

echo [2/3] Checking frontend distribution...
if not exist "frontend\dist\index.html" (
    echo Building frontend...
    pushd frontend
    call npm install
    call npm run build
    popd
)

echo [3/3] Building standalone executable with PyInstaller...
pyinstaller --clean StockManager.spec

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo   BUILD SUCCESSFUL!
    echo   Standalone app folder created at:
    echo   --> dist\StockManager\StockManager.exe
    echo.
    echo   You can zip the dist\StockManager folder or package
    echo   it with Inno Setup to create a single Setup.exe.
    echo =======================================================
) else (
    echo.
    echo [ERROR] PyInstaller build failed. Check the error log above.
)
pause
