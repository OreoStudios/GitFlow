@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is missing. & pause & exit /b 1)
where cargo >nul 2>nul || (echo Rust is missing. & pause & exit /b 1)
call npm install || (echo npm install failed. & pause & exit /b 1)
call npm run package:desktop || (echo Installer build failed. & pause & exit /b 1)
echo Check src-tauri\target\release\bundle for your installer.
pause
