@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo Creating empty commit to trigger Railway redeploy...
git commit --allow-empty -m "Trigger Railway redeploy"
echo.
echo Pushing to GitHub...
git push origin main
echo.
if %errorlevel% == 0 (
    echo SUCCESS! Railway will redeploy in 1-2 minutes.
) else (
    echo Push failed. Try again in a few minutes.
)
echo.
pause
