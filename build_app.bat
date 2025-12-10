@echo off
echo Building Noctis...

REM Ensure PyInstaller is installed
pip install pyinstaller

REM Build the executable
REM --noconfirm: overwrite existing build folders
REM --onefile: create a single .exe
REM --windowed: no command prompt window
REM --name: output filename
REM --clean: clean cache
REM --version-file: add metadata
pyinstaller --noconfirm --onefile --windowed --name "Noctis" --clean --version-file "file_version_info.txt" main.py

echo Build Complete. Check the 'dist' folder.
pause
