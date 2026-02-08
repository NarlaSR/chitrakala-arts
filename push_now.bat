@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo.
echo ====================================
echo   PUSHING ABOUT PAGE CMS TO GITHUB
echo ====================================
echo.
echo [1/4] Adding all files...
git add .
echo.
echo [2/4] Committing changes...
git commit -m "Add About page CMS with admin editor and image upload"
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
echo Railway and Vercel will deploy automatically in 2-3 minutes.
echo.
pause
