#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm install
if [ ! -d android ]; then
  npx cap add android
fi
node scripts/configure-android.mjs
npx cap sync android
chmod +x android/gradlew
cd android
./gradlew assembleDebug --no-daemon
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
