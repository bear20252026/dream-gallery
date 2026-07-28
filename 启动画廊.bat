@echo off
chcp 65001 >nul
cd /d %~dp0
title 梦幻画廊服务器
echo ========================================
echo   梦幻画廊服务器
echo   本机访问: http://localhost:3000/
echo   手机访问: http://192.168.3.66:3000/ (同一WiFi)
echo   关闭本窗口 = 停止服务器
echo ========================================
"C:\Program Files\nodejs\node.exe" server.js
pause
