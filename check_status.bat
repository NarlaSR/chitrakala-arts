@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo.
echo === Git Status ===
git status
echo.
echo === Last 3 Commits ===
git log --oneline -3
echo.
echo === Checking if up to date with origin ===
git fetch origin
git status
echo.
pause
