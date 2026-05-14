@echo off
title Transcripteur Video

echo ================================
echo   Transcripteur Video - Demarrage
echo ================================
echo.

:: Backend
echo [1/2] Demarrage du backend FastAPI...
start "Backend API" cmd /k "cd /d "%~dp0backend" && python main.py"

:: Attendre 3 secondes
timeout /t 3 /nobreak >nul

:: Frontend
echo [2/2] Demarrage du frontend Next.js...
start "Frontend Next.js" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ================================
echo  Backend  : http://localhost:8000
echo  Frontend : http://localhost:3000
echo ================================
echo.
pause
