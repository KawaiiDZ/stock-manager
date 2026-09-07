@echo off
REM Windows 1-click launcher for Stock Manager
title Stock Manager
cd /d "%~dp0"

REM If Windows venv does not exist or was copied from Mac, run setup first
if not exist "venv\Scripts\activate.bat" (
    echo First-time setup detected. Initializing installation...
    call "%~dp0install_windows.bat"
    if %errorlevel% neq 0 (
        echo [ERROR] Setup did not complete successfully.
        pause
        exit /b %errorlevel%
    )
)

call venv\Scripts\activate.bat

echo Starting Stock Manager Desktop Application...
python run_app.py
if %errorlevel% neq 0 (
    echo.
    echo Application exited with error code: %errorlevel%
    pause
)
