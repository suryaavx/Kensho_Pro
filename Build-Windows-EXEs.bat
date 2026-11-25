@echo off
title Kensho Pro 1.2.3.2 - Build Portable & Setup EXEs
echo ============================================================
echo   Kensho Pro 1.2.3.2 - Automated Portable ^& Setup EXE Builder
echo   Kensho Studio - textportdocx.in
echo ============================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js 20+ is not installed or not in PATH.
  echo Download Node.js LTS from https://nodejs.org/ and run this script again.
  pause
  exit /b 1
)

echo [1/5] Installing dependencies...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
  if exist package-lock.json (
    echo [WARN] npm install failed with existing lockfile; removing stale package-lock.json and retrying...
    del /f /q package-lock.json
    call npm install --no-audit --no-fund
  )
)
if %errorlevel% neq 0 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/5] Running Package Auditor ^& Auto-Fixer...
call node package_audit.js --fix
if %errorlevel% neq 0 (
  echo [ERROR] Pre-build package audit failed.
  pause
  exit /b 1
)

echo.
echo [3/5] Building unpacked Windows app (dist\win-unpacked)...
call npx electron-builder --win dir --x64
if %errorlevel% neq 0 (
  echo [ERROR] Unpacked build failed.
  pause
  exit /b 1
)
call node package_audit.js --verify-dist dist/win-unpacked --fix
if %errorlevel% neq 0 (
  echo [ERROR] Post-pack verification detected missing files in dist\win-unpacked.
  pause
  exit /b 1
)

echo.
echo [4/5] Patching icon ^& metadata and packaging KenshoPro-Portable-1.2.3.2.exe...
call node patch_exe.js "dist\win-unpacked\Kensho Pro.exe" build\icon.ico
if %errorlevel% neq 0 (
  echo [ERROR] patch_exe.js failed.
  pause
  exit /b 1
)
call npx electron-builder --win portable --prepackaged dist/win-unpacked --x64
if %errorlevel% neq 0 (
  echo [ERROR] Portable EXE build failed.
  pause
  exit /b 1
)

echo.
echo [5/5] Building KenshoPro-Setup-1.2.3.2.exe installer via NSIS...
call node build_setup.js
if %errorlevel% neq 0 (
  echo [ERROR] NSIS setup build failed.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   BUILD COMPLETE!
echo   Your EXE files are ready in the "dist" folder:
echo     1. dist\KenshoPro-Portable-1.2.3.2.exe
echo     2. dist\KenshoPro-Setup-1.2.3.2.exe
echo ============================================================
explorer dist
pause
