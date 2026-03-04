@echo off
title StratAds Audit - Launcher
color 0b

echo ===================================================
echo      STRATADS AUDIT - LAUNCHER
echo ===================================================
echo.

:: 1. Vérification Node.js
echo [1/4] Verification de Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo [ERREUR] Node.js n'est pas installe ou pas dans le PATH.
    echo Installez la version LTS sur nodejs.org
    pause
    exit
)

:: 2. Installation des dépendances (Uniquement si nécessaire)
if exist "node_modules" (
    echo [2/4] Dependances detectees. Lancement rapide...
) else (
    echo [2/4] Installation initiale des dependances...
    call npm install
    if %errorlevel% neq 0 (
        color 0c
        echo [ERREUR] Echec de l'installation 'npm install'.
        pause
        exit
    )
)

:: 3. Installation Playwright (Browsers)
if not exist "node_modules\playwright\.local-browsers" (
    echo [3/4] Verification des navigateurs Playwright...
    call npx playwright install chromium
) else (
    echo [3/4] Navigateurs Playwright prets.
)

:: 4. Lancement de l'app
echo [4/4] Demarrage de l'application Electron...
echo ---------------------------------------------------
echo Les logs s'afficheront ci-dessous.
echo Si l'application se ferme immediatement, une erreur est survenue.
echo ---------------------------------------------------

call npm start

if %errorlevel% neq 0 (
    color 0e
    echo.
    echo ===================================================
    echo ERREUR : L'application s'est fermee anormalement.
    echo Verifiez les messages ci-dessus.
    echo ===================================================
    pause
)