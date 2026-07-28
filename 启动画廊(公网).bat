@echo off
chcp 65001 >nul
cd /d %~dp0
title 梦幻画廊服务器(公网模式)
REM ============================================================
REM  公网分享模式：API 鉴权已开启
REM  第 1 步：把下面这行的密码改成你自己的（别太简单）
REM  第 2 步：用内网穿透工具(如 cpolar)暴露 3000 端口
REM  第 3 步：朋友访问画廊不需要密码；你要用白板保存/删除作品时，
REM          打开 http://域名/whiteboard.html?token=你的密码
REM ============================================================
set TOKEN=请改成你的密码
echo ========================================
echo   梦幻画廊服务器 [公网模式 - API 已鉴权]
echo   TOKEN: %TOKEN%
echo   白板管理入口: whiteboard.html?token=%TOKEN%
echo ========================================
"C:\Program Files\nodejs\node.exe" server.js
pause
