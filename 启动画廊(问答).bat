@echo off
chcp 65001 >nul
cd /d %~dp0
title 梦幻画廊服务器(问答门模式)
REM ============================================================
REM  问答门模式：访客需答对问题才能进入
REM  问题 / 提示 / 答案在下面三行，可随时修改
REM  答案「彤彤彤彤08」是一个整体，需完整输入
REM ============================================================
set GATE_QUESTION=你是谁？
set GATE_HINT=风听从我的召唤
set GATE_ANSWER=彤彤彤彤08
echo ========================================
echo   梦幻画廊服务器 [问答门模式]
echo   问题: %GATE_QUESTION%  (提示: %GATE_HINT%)
echo   访客答对后才能看到画廊
echo   注意: 重启服务器后所有人需要重新答题
echo ========================================
"C:\Program Files\nodejs\node.exe" server.js
pause
