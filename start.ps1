# Start the backend server in one terminal
Write-Host "Starting Backend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\server'; npm start"

# Wait a moment for backend to start
Start-Sleep -Seconds 3

# Start the frontend in another terminal
Write-Host "Starting Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm start"

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Chitrakala Arts Started!" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Yellow
Write-Host "Admin:    http://localhost:3000/admin/login" -ForegroundColor Yellow
Write-Host "`nDefault Admin Credentials:" -ForegroundColor Green
Write-Host "Username: admin" -ForegroundColor White
Write-Host "Password: admin123" -ForegroundColor White
Write-Host "================================`n" -ForegroundColor Cyan
