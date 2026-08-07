@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo [ERROR] Please install Node.js 22 or later first.
  pause
  exit /b 1
)

call npm install || exit /b 1
if not exist android (
  call npx cap add android || exit /b 1
)
node scripts\configure-android.mjs || exit /b 1
call npx cap sync android || exit /b 1
cd android
call gradlew.bat assembleDebug || exit /b 1

echo.
echo APK: android\app\build\outputs\apk\debug\app-debug.apk
pause
