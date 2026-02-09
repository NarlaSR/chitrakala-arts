@echo off
echo Checking if Railway deployment completed...
echo.
cd /d C:\Development\workspace\chitrakala_arts\server
railway status
echo.
echo Recent logs:
railway logs
echo.
pause
