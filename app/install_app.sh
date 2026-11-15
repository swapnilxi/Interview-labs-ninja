#!/usr/bin/env bash
#
# LabNinja Android app: check -> update -> build -> install, from a Mac to a USB-connected Android phone.
#
#   ./app/install_app.sh                 build (if anything changed) and install on the phone, app -> production site
#   ./app/install_app.sh --local         app loads your Mac's dev server instead (http://<mac-lan-ip>:4028)
#   ./app/install_app.sh --url https://x app loads a custom site
#   ./app/install_app.sh --check         only report what is installed / missing / out of date; changes nothing
#   ./app/install_app.sh --force         rebuild + reinstall even if nothing changed
#   ./app/install_app.sh --clean         uninstall the app first (wipes its data, you sign in again)
#   ./app/install_app.sh --yes           install missing tools with Homebrew without asking
#   ./app/install_app.sh --no-launch     do not open the app afterwards
#
# What it does, in order:
#   1. Checks the Mac: Homebrew, Node, a JDK (17+), adb, the Android SDK (platform + build-tools). Installs what is missing.
#   2. Finds the phone over adb (USB debugging must be on and the "Allow USB debugging?" prompt accepted).
#   3. Fingerprints everything the app is built from and compares it with the last install on that phone:
#      unchanged -> "up to date", nothing to do (unless --force); changed or not installed -> continues.
#   4. npm install (app/), cap sync, Gradle assembleDebug.
#   5. adb install -r (on user 0, so Samsung "Secure Folder" does not get in the way), grants the notification, microphone and
#      exact-alarm permissions, launches the app.
#
# The web side of the app (reminders, notification centre) lives in frontend/src and is served by the site, so a
# web-only change needs a deploy (or --local), not a reinstall. See app/README.md.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"
STATE_FILE="$APP_DIR/.install-state"
PROD_URL="https://labs-ninja.vercel.app"
DEV_PORT=4028

MODE_CHECK=0; FORCE=0; CLEAN=0; YES=0; LAUNCH=1; URL=""; LOCAL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE_CHECK=1 ;;
    --force) FORCE=1 ;;
    --clean) CLEAN=1 ;;
    --yes|-y) YES=1 ;;
    --no-launch) LAUNCH=0 ;;
    --local) LOCAL=1 ;;
    --url) shift; URL="${1:-}" ;;
    --url=*) URL="${1#--url=}" ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

# ---------- output helpers ----------
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; D=$'\033[2m'; N=$'\033[0m'; else B=""; G=""; R=""; Y=""; D=""; N=""; fi
step() { printf '\n%s== %s%s\n' "$B" "$*" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$R" "$N" "$*"; }
info() { printf '    %s%s%s\n' "$D" "$*" "$N"; }
die()  { printf '\n%s%s%s\n' "$R" "$*" "$N" >&2; exit 1; }

MISSING=0   # tools still missing after the install pass

confirm() {  # confirm "question"
  [ "$YES" = 1 ] && return 0
  [ -t 0 ] || return 1
  local a; read -r -p "    $1 [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ]
}

[ "$(uname -s)" = "Darwin" ] || warn "This script is written for macOS; other systems may need tweaks."

# ---------- 1. Mac toolchain ----------
step "1/5  Checking this Mac"

HAVE_BREW=0
if command -v brew >/dev/null 2>&1; then HAVE_BREW=1; ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"; else bad "Homebrew missing (https://brew.sh) — needed to install the other tools"; fi

brew_install() {  # brew_install <kind: formula|cask> <name> <what>
  if [ "$MODE_CHECK" = 1 ]; then return 1; fi
  [ "$HAVE_BREW" = 1 ] || return 1
  if confirm "Install $3 with Homebrew ($2)?"; then
    if [ "$1" = cask ]; then brew install --cask "$2"; else brew install "$2"; fi
    return $?
  fi
  return 1
}

# Node
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then ok "Node $(node -v)"
else
  bad "Node/npm missing"
  brew_install formula node "Node.js" && ok "Node installed" || MISSING=1
fi

# JDK (Gradle for Android Gradle Plugin 8 needs 17+)
find_java_home() {
  local c
  for c in /opt/homebrew/opt/openjdk@21 /opt/homebrew/opt/openjdk@17 /opt/homebrew/opt/openjdk /usr/local/opt/openjdk@21 /usr/local/opt/openjdk@17 /usr/local/opt/openjdk; do
    [ -x "$c/bin/java" ] && { echo "$c"; return; }
  done
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then echo "$JAVA_HOME"; return; fi
  if /usr/libexec/java_home -v 17+ >/dev/null 2>&1; then /usr/libexec/java_home -v 17+; return; fi
  return 1
}
JAVA_HOME_FOUND="$(find_java_home || true)"
if [ -z "$JAVA_HOME_FOUND" ]; then
  bad "JDK 17+ missing"
  brew_install formula openjdk@21 "JDK 21" && JAVA_HOME_FOUND="$(find_java_home || true)"
fi
if [ -n "$JAVA_HOME_FOUND" ]; then export JAVA_HOME="$JAVA_HOME_FOUND"; export PATH="$JAVA_HOME/bin:$PATH"; ok "JDK $("$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed -E 's/.*"([^"]+)".*/\1/') ($JAVA_HOME)"; else MISSING=1; fi

# adb
find_adb() {
  command -v adb 2>/dev/null && return
  local c; for c in "${ANDROID_HOME:-/nonexistent}/platform-tools/adb" /opt/homebrew/share/android-commandlinetools/platform-tools/adb "$HOME/Library/Android/sdk/platform-tools/adb"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done; return 1
}
ADB="$(find_adb || true)"
if [ -z "$ADB" ]; then
  bad "adb missing"
  brew_install cask android-platform-tools "Android platform-tools (adb)" && ADB="$(find_adb || true)"
fi
if [ -n "$ADB" ]; then ok "adb $("$ADB" version | head -1 | awk '{print $5}')"; else MISSING=1; fi

# Android SDK
find_sdk() {
  local c
  for c in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" /opt/homebrew/share/android-commandlinetools "$HOME/Library/Android/sdk"; do
    [ -n "$c" ] && [ -d "$c" ] && { echo "$c"; return; }
  done; return 1
}
COMPILE_SDK="$(grep -E 'compileSdkVersion' "$APP_DIR/android/variables.gradle" | grep -oE '[0-9]+' | head -1 || true)"; COMPILE_SDK="${COMPILE_SDK:-36}"
SDK_DIR="$(find_sdk || true)"
sdk_ready() { [ -n "$SDK_DIR" ] && [ -d "$SDK_DIR/platforms/android-$COMPILE_SDK" ] && [ -d "$SDK_DIR/build-tools" ] && [ -n "$(ls "$SDK_DIR/build-tools" 2>/dev/null)" ]; }
if ! sdk_ready; then
  bad "Android SDK (platform android-$COMPILE_SDK + build-tools) incomplete${SDK_DIR:+ at $SDK_DIR}"
  if [ -z "$SDK_DIR" ]; then
    brew_install cask android-commandlinetools "Android command-line tools" && SDK_DIR="$(find_sdk || true)"
  fi
  SDKMANAGER=""
  if [ -n "$SDK_DIR" ]; then
    for c in "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" "$(command -v sdkmanager 2>/dev/null || true)"; do [ -n "$c" ] && [ -x "$c" ] && { SDKMANAGER="$c"; break; }; done
  fi
  if [ -n "$SDKMANAGER" ] && [ "$MODE_CHECK" = 0 ] && confirm "Download the Android SDK pieces with sdkmanager (platform-tools, android-$COMPILE_SDK, build-tools)?"; then
    yes | "$SDKMANAGER" --sdk_root="$SDK_DIR" --licenses >/dev/null 2>&1 || true
    "$SDKMANAGER" --sdk_root="$SDK_DIR" "platform-tools" "platforms;android-$COMPILE_SDK" "build-tools;$COMPILE_SDK.0.0" 2>&1 | tail -3 || true
  fi
fi
if sdk_ready; then export ANDROID_HOME="$SDK_DIR"; export ANDROID_SDK_ROOT="$SDK_DIR"; ok "Android SDK $SDK_DIR (android-$COMPILE_SDK)"; else bad "Android SDK not ready"; MISSING=1; fi

# Gradle's local.properties (machine specific, gitignored)
if sdk_ready; then
  if ! grep -qs "^sdk.dir=$SDK_DIR\$" "$APP_DIR/android/local.properties" 2>/dev/null && [ "$MODE_CHECK" = 0 ]; then
    echo "sdk.dir=$SDK_DIR" > "$APP_DIR/android/local.properties"; info "wrote android/local.properties"
  fi
fi

if [ "$MISSING" = 1 ] && [ "$MODE_CHECK" = 0 ]; then
  die "Some tools are still missing (marked ✗ above). Install them (re-run with --yes to let this script do it with Homebrew) and run again."
fi

# ---------- 2. Phone ----------
step "2/5  Looking for the phone"

PKG="$(grep -oE "appId: *'[^']+'" "$APP_DIR/capacitor.config.ts" | sed -E "s/.*'([^']+)'/\1/" || true)"; PKG="${PKG:-com.labsninja.app}"
SERIAL=""; PHONE_OK=0
if [ -n "$ADB" ]; then
  "$ADB" start-server >/dev/null 2>&1 || true
  DEV_LIST="$("$ADB" devices | tail -n +2 | sed '/^$/d')"
  READY="$(printf '%s\n' "$DEV_LIST" | awk '$2=="device"{print $1}')"
  if [ -n "${ANDROID_SERIAL:-}" ] && printf '%s\n' "$READY" | grep -qx "$ANDROID_SERIAL"; then SERIAL="$ANDROID_SERIAL"
  else SERIAL="$(printf '%s\n' "$READY" | head -1)"; fi
  if [ -n "$SERIAL" ]; then
    PHONE_OK=1
    MODEL="$("$ADB" -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')"; ANDROID_VER="$("$ADB" -s "$SERIAL" shell getprop ro.build.version.release | tr -d '\r')"
    ok "$MODEL (Android $ANDROID_VER), serial $SERIAL"
    [ "$(printf '%s\n' "$READY" | wc -l | tr -d ' ')" -gt 1 ] && warn "More than one device is connected; using $SERIAL (set ANDROID_SERIAL to choose)."
  else
    if printf '%s\n' "$DEV_LIST" | grep -q unauthorized; then bad "Phone is connected but not authorised: unlock it and tap “Allow USB debugging?”"
    elif printf '%s\n' "$DEV_LIST" | grep -q offline; then bad "Phone shows as offline: unplug, replug, and run: adb kill-server"
    else
      bad "No phone found over adb."
      info "Enable Settings -> Developer options -> USB debugging, set USB mode to “File transfer”, accept the prompt on the phone."
      info "Wireless instead: adb pair <ip:port> then adb connect <ip:port>."
    fi
  fi
fi
adbp() { "$ADB" -s "$SERIAL" "$@"; }

# What is on the phone right now
INSTALLED_VER=""; INSTALLED_AT=""
if [ "$PHONE_OK" = 1 ]; then
  if adbp shell pm list packages --user 0 "$PKG" 2>/dev/null | tr -d '\r' | grep -qx "package:$PKG"; then
    PKG_DUMP="$(adbp shell dumpsys package "$PKG" 2>/dev/null | tr -d '\r' || true)"
    INSTALLED_VER="$(printf '%s\n' "$PKG_DUMP" | grep -m1 versionName= | sed -E 's/.*versionName=//')"
    INSTALLED_AT="$(printf '%s\n' "$PKG_DUMP" | grep -m1 lastUpdateTime= | sed -E 's/.*lastUpdateTime=//')"
    ok "$PKG installed on the phone (version ${INSTALLED_VER:-?}, updated ${INSTALLED_AT:-?})"
  else
    warn "$PKG is not installed on the phone"
  fi
fi

# ---------- 3. What should the app load, and is the phone up to date? ----------
step "3/5  Checking for updates"

if [ "$LOCAL" = 1 ]; then
  LAN_IP=""; for i in en0 en1 en2 en3 en4 en5; do LAN_IP="$(ipconfig getifaddr "$i" 2>/dev/null || true)"; [ -n "$LAN_IP" ] && break; done
  [ -n "$LAN_IP" ] || die "--local: could not find this Mac's Wi-Fi/LAN address."
  URL="http://$LAN_IP:$DEV_PORT"
fi
URL="${URL:-$PROD_URL}"
case "$URL" in http://*|https://*) ;; *) die "The site URL must start with http:// or https:// (got: $URL)";; esac
ok "App will load: $URL"
if [ "$LOCAL" = 1 ] || [ "${URL#http://}" != "$URL" ]; then
  if curl -s -o /dev/null --max-time 4 "$URL/"; then ok "That server answers"; else warn "Nothing answers at $URL yet. Start it: cd frontend && npm run dev   (phone and Mac must share Wi-Fi)"; fi
fi

# Fingerprint of everything the APK is built from (generated Capacitor assets are excluded; the site URL is included).
fingerprint() {
  {
    echo "url=$URL"
    ( cd "$APP_DIR" && find android native-shell capacitor.config.ts package.json package-lock.json -type f \
        -not -path '*/build/*' -not -path '*/.gradle/*' -not -path '*/src/main/assets/*' -not -path '*/capacitor-cordova-android-plugins/*' \
        -not -name local.properties -not -name '.DS_Store' 2>/dev/null | LC_ALL=C sort | xargs shasum 2>/dev/null )
  } | shasum | awk '{print $1}'
}
FP="$(fingerprint)"
LAST_FP=""; [ -f "$STATE_FILE" ] && LAST_FP="$(grep -E "^$SERIAL " "$STATE_FILE" 2>/dev/null | awk '{print $2}' | tail -1 || true)"

if [ "$FORCE" = 1 ] || [ "$CLEAN" = 1 ]; then REASON="forced"
elif [ "$PHONE_OK" = 0 ]; then REASON="no phone"
elif [ -z "$INSTALLED_VER" ]; then REASON="not installed"
elif [ "$FP" != "$LAST_FP" ]; then REASON="app files or site URL changed since the last install"
else REASON="current"; fi

if [ "$REASON" = "current" ]; then
  ok "The phone already has this exact build. Nothing to do (use --force to reinstall)."
else
  if [ "$REASON" = "no phone" ]; then bad "Cannot install without a phone."; else warn "Update needed: $REASON"; fi
fi

if [ ! -f "$APP_DIR/android/app/google-services.json" ]; then
  warn "android/app/google-services.json is missing: Firebase push (app closed) is OFF. Task reminders still work (phone alarms)."
  info "Add it from the Firebase console (Android app id: $PKG), then run this script again. See app/README.md."
else ok "google-services.json present: Firebase push enabled"; fi

if [ "$MODE_CHECK" = 1 ]; then
  step "Check only"; echo "  Nothing was changed."; [ "$REASON" = "current" ] && exit 0 || exit 0
fi
[ "$PHONE_OK" = 1 ] || die "Connect the phone and run again."
if [ "$REASON" = "current" ]; then exit 0; fi

# ---------- 4. Build ----------
step "4/5  Building the app"

cd "$APP_DIR"
if [ ! -d node_modules/@capacitor/cli ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  info "npm install (app/)"; npm install --no-audit --no-fund --loglevel=error
fi
ok "Capacitor packages ready"

info "cap sync (site URL: $URL)"
SYNC_LOG="$(mktemp)"
if CAP_SERVER_URL="$URL" npx --no-install cap sync android >"$SYNC_LOG" 2>&1; then
  grep -E "plugins for android|@capacitor/|Sync finished" "$SYNC_LOG" | sed -e 's/^/    /' || true
  ok "Synced the Android project"
else
  sed -e 's/^/    /' "$SYNC_LOG"; rm -f "$SYNC_LOG"; die "cap sync failed (output above)."
fi
rm -f "$SYNC_LOG"

info "Gradle assembleDebug (the first run downloads Gradle and takes a few minutes)"
# Gradle's own exit status decides success: a quiet, up-to-date build prints nothing, and a filter like
# `grep -v` exits 1 on empty output, which under pipefail would look like a failure.
GRADLE_LOG="$(mktemp)"
if ( cd android && ./gradlew assembleDebug -q ) >"$GRADLE_LOG" 2>&1; then
  grep -vE "SDK XML|^Note: " "$GRADLE_LOG" | sed -e 's/^/    /' || true
  rm -f "$GRADLE_LOG"
else
  grep -v "SDK XML" "$GRADLE_LOG" | sed -e 's/^/    /' || true
  rm -f "$GRADLE_LOG"; die "The Gradle build failed (output above)."
fi
APK="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || die "Build finished but $APK is missing."
ok "Built $(du -h "$APK" | awk '{print $1}') APK"

# ---------- 5. Install ----------
step "5/5  Installing on $MODEL"

if [ "$CLEAN" = 1 ]; then adbp uninstall --user 0 "$PKG" >/dev/null 2>&1 && ok "Removed the old app (its data is gone)" || true; fi
INSTALL_OUT="$(adbp install -r --user 0 "$APK" 2>&1 | tr -d '\r' || true)"
if ! printf '%s' "$INSTALL_OUT" | grep -q "Success"; then
  if printf '%s' "$INSTALL_OUT" | grep -qE "UPDATE_INCOMPATIBLE|SIGNATURE|VERSION_DOWNGRADE"; then
    warn "Installed copy is signed differently: removing it and installing fresh (you will sign in again)."
    adbp uninstall --user 0 "$PKG" >/dev/null 2>&1 || true
    INSTALL_OUT="$(adbp install --user 0 "$APK" 2>&1 | tr -d '\r' || true)"
  fi
fi
printf '%s' "$INSTALL_OUT" | grep -q "Success" || die "adb install failed: $INSTALL_OUT"
ok "Installed"

adbp shell pm grant --user 0 "$PKG" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 && ok "Notification permission granted" || warn "Could not pre-grant notifications (the app will ask)."
adbp shell pm grant --user 0 "$PKG" android.permission.RECORD_AUDIO >/dev/null 2>&1 && ok "Microphone permission granted (voice input)" || warn "Could not pre-grant the microphone (the app asks on first use; or Settings -> Apps -> LabNinja -> Permissions)."
adbp shell appops set --user 0 "$PKG" SCHEDULE_EXACT_ALARM allow >/dev/null 2>&1 && ok "Exact-alarm permission allowed (reminders fire on time)" || warn "Could not allow exact alarms (Settings -> Apps -> LabNinja -> Alarms & reminders)."

mkdir -p "$(dirname "$STATE_FILE")"
{ grep -vE "^$SERIAL " "$STATE_FILE" 2>/dev/null || true; echo "$SERIAL $FP $(date +%Y-%m-%dT%H:%M:%S) $URL"; } > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

if [ "$LAUNCH" = 1 ]; then
  adbp shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adbp shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1 && ok "Launched LabNinja" || warn "Could not launch it; open it from the phone."
fi

printf '\n%sDone.%s LabNinja is on %s, loading %s\n' "$B" "$N" "$MODEL" "$URL"
[ "$LOCAL" = 1 ] && info "Dev mode: keep \`npm run dev\` running in frontend/ and the phone on the same Wi-Fi."
[ "$URL" = "$PROD_URL" ] && info "Production mode: web changes show up after you deploy the site."
exit 0
