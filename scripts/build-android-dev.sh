#!/usr/bin/env bash
# Builds the Android dev client for the emulator from a short real path, then
# installs it. Ninja fails on long paths on Windows, and a `subst` drive doesn't
# help, because some tools resolve it back to C: and the build sees two roots.
# Only needed when native code changes; JS always comes from Metro.
#
#   bash scripts/build-android-dev.sh [git-ref, default: staging]
set -euo pipefail

REF="${1:-staging}"
MAIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${TONO_ANDROID_BUILD_DIR:-C:/dev/tb}"
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb"

if [ ! -e "$BUILD_DIR/.git" ]; then
  git worktree add --detach "$BUILD_DIR" "$REF"
fi
cd "$BUILD_DIR"
git checkout --detach "$REF"

LOCK_HASH="$(git hash-object package-lock.json)"
if [ "$(cat node_modules/.tono-lock-hash 2>/dev/null || true)" != "$LOCK_HASH" ]; then
  npm ci --no-audit --no-fund
  echo "$LOCK_HASH" > node_modules/.tono-lock-hash
fi

# react-native-audio-api downloads prebuilt binaries during the build, but under
# Git Bash on Windows its curl can't write to the path it's given. Reuse the copy
# in the main checkout.
AUDIO=node_modules/react-native-audio-api
for dir in common/cpp/audioapi/external/android android/src/main/jniLibs; do
  if [ ! -d "$AUDIO/$dir" ] && [ -d "$MAIN_DIR/$AUDIO/$dir" ]; then
    cp -r "$MAIN_DIR/$AUDIO/$dir" "$AUDIO/$dir"
  fi
done

npx expo prebuild --platform android --clean --no-install

cd android
./gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64 \
  "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m" --console=plain

"$ADB" install -r app/build/outputs/apk/debug/app-debug.apk
