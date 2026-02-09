@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo ====================================
echo   GIT STATUS CHECK
echo ====================================
echo.
echo Recent commits:
git log --oneline -3
echo.
echo ====================================
echo Current status:
git status -sb
echo.
echo ====================================
pause
