@echo off
chcp 65001 >nul
cd /d %~dp0
title B612 ship latest
"C:\Program Files\Git\bin\bash.exe" scripts/ship-branch.sh %*
echo.
echo Done. You can close this window.
pause
