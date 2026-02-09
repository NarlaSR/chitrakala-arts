@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo Pushing to GitHub...
git push origin main
echo.
echo Done! Check status:
git status -sb
echo.
pause
