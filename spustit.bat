@echo off
cd /d "%~dp0"
python onepiece_ceny.py %*
if errorlevel 1 py onepiece_ceny.py %*
pause
