# LabNinja Android app

A Capacitor shell: a WebView around the deployed Next.js site, plus what a browser can't do with the app closed (exact
OS alarms for task reminders, FCM push). Everything native lives here; the web half is `frontend/src/lib/reminders/`.

```bash
./app/install_app.sh            # check tools + phone, rebuild only if something changed, install, launch
./app/install_app.sh --local    # app loads this Mac's dev server (cd frontend && npm run dev; same Wi-Fi)
./app/install_app.sh --check    # report only, change nothing
./app/install_app.sh --help     # --url, --force, --clean, --yes, --no-launch
```

Phone: Settings -> Developer options -> USB debugging on, USB mode "File transfer", accept "Allow USB debugging?".

- **Web changes** (reminder logic, UI) reach the app when the site is deployed (or immediately with `--local`); no reinstall.
- **Native changes** (anything in `app/`) need `./app/install_app.sh`; it notices them through a fingerprint.
- **Scheduler with the app closed** (To-Do → Scheduler): the native `LabNinjaScheduler` plugin (`android/app/src/main/java/com/labsninja/app/scheduler/`) sets an exact alarm per run the web side syncs; AI jobs call the API from the phone and show the answer. Its JS side is `frontend/src/lib/schedules/nativeScheduler.ts`.
- **Push with the app closed** needs `app/android/app/google-services.json` (Firebase console, Android app id
  `com.labsninja.app`) and the server env `FIREBASE_SERVICE_ACCOUNT`. Without the file the app still works; FCM stays off.
- Machine-specific, never committed: `android/local.properties`, `.install-state`, `node_modules/`, `android/**/build/`.

Full notes: "Android app" in the repo `README.md`.
