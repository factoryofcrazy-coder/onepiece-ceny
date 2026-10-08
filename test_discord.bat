@echo off
cd /d "%~dp0"
python onepiece_ceny.py --test-discord
if errorlevel 9009 py onepiece_ceny.py --test-discord
pause
