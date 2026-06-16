@echo off
title FoundersPath Web Server
echo Starting FoundersPath Server...
echo Server running at: http://127.0.0.1:8000/
echo Press Ctrl+C in this window to stop the server.
echo.
.venv\Scripts\python.exe backend/main.py
pause
