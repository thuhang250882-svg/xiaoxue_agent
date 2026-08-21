@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0install-xiaoxue-internal-certificate.ps1""'; exit $process.ExitCode"
if errorlevel 1 (
  echo.
  echo Certificate installation failed. Please contact the software publisher.
  pause
  exit /b 1
)
echo.
echo Certificate installation completed.
pause
