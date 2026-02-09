@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo.
echo ====================================
echo   PUSHING PROXY FIX TO GITHUB
echo ====================================
echo.
echo [1/4] Adding all files...
git add .
echo.
echo [2/4] Committing changes...
git commit -m "Fix rate limiter proxy configuration for Railway"
echo.
echo [3/4] Pushing to GitHub...
git push origin main
echo.
echo [4/4] Verifying push...
git log -1 --oneline
echo.
echo ====================================
echo   PUSH COMPLETE!
echo ====================================
echo Railway will deploy automatically in 2-3 minutes.
echo.
pause
