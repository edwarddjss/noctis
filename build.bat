@echo off
echo Building Night Vision (Modular)...
pyinstaller --noconsole --onefile --collect-all customtkinter --name="NightVision" main.py
echo Build Complete.
pause
