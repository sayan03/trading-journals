@echo off
echo Starting TradeJournal AI...

REM Navigate to the script's directory
cd /d "%~dp0"

REM Open the browser
start "" "http://localhost:3000"

REM Start the server
echo Starting local server...
call npm run dev

pause
