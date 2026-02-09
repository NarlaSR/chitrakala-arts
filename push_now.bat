@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo.
echo ====================================
echo   PUSHING CONTACT CMS TO GITHUB
echo ====================================
echo.
echo [1/4] Adding all files...
git add .
echo.
echo [2/4] Committing changes...
git commit -m "Add Contact page CMS with email integration and spam prevention"
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
echo IMPORTANT: After deployment completes, you need to:
echo 1. Set up Gmail App Password (see EMAIL_SETUP.md)
echo 2. Add EMAIL_USER and EMAIL_PASSWORD to Railway environment variables
echo.
pause
