@echo off
echo Clearing Next.js cache...
cd /d "%~dp0"
if exist .next rmdir /s /q .next
if exist node_modules\.cache rmdir /s /q node_modules\.cache
echo Cache cleared!
echo You can now run: npm run dev
pause

