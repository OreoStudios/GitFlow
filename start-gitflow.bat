@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is missing. Install Node.js 22+ from https://nodejs.org/ & pause & exit /b 1)
where cargo >nul 2>nul || (echo Rust is missing. Install Rust from https://rustup.rs/ & pause & exit /b 1)
if not exist "node_modules" (
  echo Installing GitFlow dependencies...
  call npm install || (echo Failed to install dependencies. & pause & exit /b 1)
)
echo Starting GitFlow desktop application...
call npm run desktop
if errorlevel 1 pause
