@echo off
cd /d "%~dp0"
python onepiece_ceny.py --setup
if errorlevel 9009 py onepiece_ceny.py --setup
pause
