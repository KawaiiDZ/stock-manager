@echo off
REM Windows 1-click startup script for Stock Manager
cd /d "%~dp0"

if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

python run_app.py
pause
