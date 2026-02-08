@echo off
echo ============================================ > push_diagnostic.log
echo Git Diagnostic Report >> push_diagnostic.log
echo Generated: %date% %time% >> push_diagnostic.log
echo ============================================ >> push_diagnostic.log
echo. >> push_diagnostic.log

cd /d C:\Development\workspace\chitrakala_arts

echo === Current Git Status === >> push_diagnostic.log
git status >> push_diagnostic.log 2>&1
echo. >> push_diagnostic.log

echo === Last 5 Commits === >> push_diagnostic.log
git log --oneline -5 >> push_diagnostic.log 2>&1
echo. >> push_diagnostic.log

echo === Last Commit Details === >> push_diagnostic.log
git log -1 --stat >> push_diagnostic.log 2>&1
echo. >> push_diagnostic.log

echo === Check if local is ahead of remote === >> push_diagnostic.log
git status -sb >> push_diagnostic.log 2>&1
echo. >> push_diagnostic.log

echo === Remote URL === >> push_diagnostic.log
git remote -v >> push_diagnostic.log 2>&1
echo. >> push_diagnostic.log

echo DIAGNOSTIC COMPLETE! Check push_diagnostic.log file.
echo.
pause
