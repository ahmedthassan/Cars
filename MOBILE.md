# Shipping Robot Haul to phones

Three ways to play, from the same source, with no bundler:

| | What it is | Needs |
|---|---|---|
| **Web / PWA** | `www/` on any static host. Installable, works offline. | Nothing |
| **Android** | Capacitor shell around `www/` | Android Studio, or the CLI below |
| **iOS** | Capacitor shell around `www/` | **A Mac with Xcode** |

```bash
npm install
npm run build        # assembles www/
npm test             # 30 dialogue-engine tests
```

## What was actually verified, and what wasn't

Being precise about this, because "it builds" and "it runs on a phone" are
different claims.

**Verified here:**
- `www/` boots and plays in a mobile-emulated Chromium at 844×390, landscape.
- Pause and resume: card shows, physics freeze, resume moves again.
- The service worker registers and reaches `active`; the manifest serves 200.
- **The Android APK compiles.** `BUILD SUCCESSFUL`, 4.8 MB, package
  `com.robothaul.game`, label "Robot Haul", minSdk 22 / targetSdk 34,
  `screenOrientation=6` (sensorLandscape) present in the built manifest, all
  31 web assets and 26 icon densities inside, debug-signed.

**Not verified here, and it would be dishonest to imply otherwise:**
- The APK has never been **run** — there is no emulator or device in this
  environment. It compiles and contains the right files; that is all I can say.
- **Nothing on the iOS side has been compiled at all.** Xcode does not exist on
  Linux. The `ios/` project is correctly generated and configured, but its first
  real build will be on your Mac, and first builds do sometimes surface signing
  or CocoaPods issues that only appear there.
- Haptics, the orientation lock, and the wake lock all no-op in a desktop
  browser. Their code paths run; the physical behaviour needs a real handset.

## Android

```bash
npm run apk          # debug APK, no Android Studio needed
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Requires `ANDROID_HOME` and `android/local.properties` pointing at an SDK with
platform 34 and build-tools 34. `local.properties` is gitignored because it
holds a machine-specific path.

Sideload it:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

For Play, you need a signed release bundle:

```bash
keytool -genkey -v -keystore robot-haul.keystore \
  -alias robothaul -keyalg RSA -keysize 2048 -validity 10000
```

Put the credentials in `android/key.properties` (gitignored — **never commit a
keystore or its password**), reference it from `android/app/build.gradle`, then:

```bash
cd android && ./gradlew bundleRelease   # -> app/build/outputs/bundle/release/
```

Play requires targetSdk 34+ (already set), a privacy policy URL, and content
rating answers. The game collects nothing and has no network calls at runtime,
which makes the data-safety form short and honest.

## iOS — this part needs a Mac

Everything below must run on macOS. There is no workaround; Xcode is the only
toolchain that produces an iOS build.

```bash
npm install
npm run build
npx cap sync ios
cd ios/App && pod install     # CocoaPods, first time only
npx cap open ios              # opens Xcode
```

In Xcode: select your team under **Signing & Capabilities**, set a bundle
identifier you own (the placeholder is `com.robothaul.game`), then Product →
Archive → Distribute App.

Already configured in `ios/App/App/Info.plist`:
- Landscape left/right only, on iPhone and iPad. Portrait entries removed.
- `UIStatusBarHidden` and `UIRequiresFullScreen`.

App Store review notes that matter for this game:
- It is a game with no accounts, no ads, no purchases and no data collection —
  a short review in practice.
- The bots' dialogue is comic peril. Rate it accordingly; "Infrequent/Mild
  Cartoon or Fantasy Violence" is the honest answer.
- Have a privacy policy URL ready even though the answer is "collects nothing".

## How the platform layer works

`src/platform/native.js` is the only file that knows which of the three targets
it is running on. Everything degrades quietly — a capability that does not
exist on a platform is silence, never a crash.

Capacitor plugins are reached through the **runtime bridge**
(`window.Capacitor.Plugins`) rather than by importing `@capacitor/haptics` and
friends. The game is plain ES modules with no bundler, so a bare specifier
would not resolve in a browser. The npm packages are still real dependencies —
`npx cap sync` reads them to install the native halves — they are just never
imported from application code.

What the layer provides:

- **Orientation lock** — Capacitor's ScreenOrientation on device, the Screen
  Orientation API on the web, and a "turn your phone sideways" overlay as the
  fallback when neither is permitted. The Android manifest and the iOS plist
  *also* declare landscape, because the runtime lock happens too late to stop a
  portrait flash on cold start.
- **Haptics** — different sensations for an impact, a bot catching the edge,
  and a bot finally going. Falls back to `navigator.vibrate`.
- **Lifecycle** — audio contexts are suspended when a phone locks, so the game
  resumes audio and re-acquires the wake lock on return, and pauses when
  genuinely backgrounded. Window `blur` deliberately does *not* pause: it fires
  for notification shades and focus changes, and pausing on those stops the
  game mid-climb for no visible reason.
- **Android back button** — pauses; again from the pause card exits. Without a
  handler it closes the app mid-run.
- **Wake lock** — a slow climb involves long stretches without a touch.
- **Safe areas** — the HUD is drawn into a canvas, so CSS `env()` insets are
  measured and passed through in device pixels. Otherwise a notch sits on top
  of the panic meter in landscape.

## Updating the web layer

Native projects embed a copy of `www/`. After changing any game code:

```bash
npm run sync         # build + npx cap sync
```

Skipping this is the classic Capacitor mistake: the native app keeps running
the previous build and the change appears to have done nothing.
