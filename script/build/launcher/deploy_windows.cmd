@rem Licensed under the DataVisool License. See the LICENSE file distributed with this software.
@echo off
setlocal DisableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%deploy_windows.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if "%~1"=="" (
    echo.
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%deploy_windows.ps1" --wrapper-pause-message %EXIT_CODE%
    pause >nul
)

exit /b %EXIT_CODE%
