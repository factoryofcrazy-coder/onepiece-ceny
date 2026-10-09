@echo off
cd /d "%~dp0"
python -c "import playwright" 2>nul || (
  echo Instalujem Playwright ^(len prvy raz^)...
  python -m pip install playwright
  python -m playwright install chromium
)
python smarty_browser_import.py
if errorlevel 1 goto koniec
python onepiece_ceny.py --only smarty --once --no-browser
:koniec
pause
