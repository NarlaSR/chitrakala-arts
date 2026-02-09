@echo off
cd /d C:\Development\workspace\chitrakala_arts
echo ====================================
echo   PUSHING TO GITHUB (with retry)
echo ====================================
echo.

:retry
echo Attempt: Pushing to GitHub...
git push origin main
if %errorlevel% == 0 (
    echo.
    echo ====================================
    echo   PUSH SUCCESSFUL!
    echo ====================================
    git status -sb
    echo.
    echo Railway and Vercel will deploy in 2-3 minutes.
    pause
    exit /b 0
)

echo.
echo Push failed. Waiting 10 seconds before retry...
timeout /t 10 /nobreak
echo.
goto retry
