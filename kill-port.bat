@echo off
REM Kill processes using specific ports on Windows

if "%1"=="" (
    echo Usage: kill-port.bat ^<port^> [port2] [port3] ...
    echo Example: kill-port.bat 3000 8002
    exit /b 1
)

echo Checking and killing processes on ports: %*
echo.

:loop
if "%1"=="" goto end

set PORT=%1
echo Checking port %PORT%...

REM Find and kill process using the port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
    echo Found process %%a on port %PORT%
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo Failed to kill process %%a
    ) else (
        echo Successfully killed process %%a
    )
)

shift
goto loop

:end
echo.
echo Port cleanup completed!
timeout /t 2 >nul
pause

