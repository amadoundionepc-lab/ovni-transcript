@echo off
title Installation - Transcripteur Video

echo ================================
echo   Installation des dependances
echo ================================
echo.

:: Verifier Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Python n'est pas installe ou pas dans le PATH.
    echo Telechargez Python sur https://python.org
    pause
    exit /b 1
)

:: Verifier Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Node.js n'est pas installe.
    echo Telechargez Node.js sur https://nodejs.org
    pause
    exit /b 1
)

:: Verifier ffmpeg
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ATTENTION: ffmpeg n'est pas detecte dans le PATH.
    echo Whisper a besoin de ffmpeg pour fonctionner.
    echo Installez ffmpeg : https://ffmpeg.org/download.html
    echo Ou via winget : winget install Gyan.FFmpeg
    echo.
)

echo [1/2] Installation des dependances Python...
cd /d "%~dp0backend"
python -m pip install -r requirements.txt

echo.
echo [2/2] Installation des dependances Node.js...
cd /d "%~dp0frontend"
npm install

echo.
echo ================================
echo   Installation terminee !
echo   Lancez start.bat pour demarrer
echo ================================
pause
