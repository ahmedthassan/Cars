// ── Native / PWA platform adapter ────────────────────────────────────────────
//
// The game ships three ways — a browser tab, an installed PWA, and a Capacitor
// app on iOS and Android — and this is the only file that knows the difference.
//
// Capacitor plugins are reached through the RUNTIME BRIDGE (window.Capacitor
// .Plugins) rather than by importing '@capacitor/haptics' and friends. The game
// is plain ES modules with no bundler, so a bare specifier would not resolve in
// a browser; the bridge injects the same plugins on device. The npm packages
// are still real dependencies — `npx cap sync` reads them to install the native
// halves — they are just not imported from here.
//
// Every capability degrades quietly: on the web you get the web API if one
// exists, and silence if not. Nothing here may throw on a platform that lacks it.

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);
const plugin = (name) => cap()?.Plugins?.[name];

export const isNative = () => !!cap()?.isNativePlatform?.();
export const platform = () => cap()?.getPlatform?.() ?? 'web';

// ── Orientation ──────────────────────────────────────────────────────────────
/** This is a landscape hill. Ask the OS to keep it that way. */
export async function lockLandscape() {
  try {
    const so = plugin('ScreenOrientation');
    if (so) { await so.lock({ orientation: 'landscape' }); return true; }
    // Web: only works in fullscreen, and only on some browsers. Failing is fine
    // — the page has a "turn your phone sideways" overlay as the fallback.
    if (screen.orientation?.lock) { await screen.orientation.lock('landscape'); return true; }
  } catch { /* not supported here; the rotate overlay covers it */ }
  return false;
}

// ── Status bar ───────────────────────────────────────────────────────────────
export async function hideChrome() {
  try {
    const sb = plugin('StatusBar');
    if (sb) { await sb.hide(); await sb.setOverlaysWebView({ overlay: true }); }
  } catch { /* ignore */ }
}

// ── Haptics ──────────────────────────────────────────────────────────────────
// A physics comedy lives or dies on feel, and on a phone a lot of "feel" is the
// vibration motor. Impacts, a bot catching the edge, and a bot finally going
// are all different sensations on purpose.
const WEB_PATTERN = { light: 12, medium: 24, heavy: 42, drop: [38, 46, 70], win: [18, 60, 18] };

export function haptic(kind = 'light') {
  try {
    const h = plugin('Haptics');
    if (h) {
      if (kind === 'drop') { h.notification({ type: 'WARNING' }); return; }
      if (kind === 'win') { h.notification({ type: 'SUCCESS' }); return; }
      h.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      return;
    }
    navigator.vibrate?.(WEB_PATTERN[kind] ?? 12);
  } catch { /* no motor, no problem */ }
}

/** Impacts scale with how hard you actually hit, up to a point. */
export function impactHaptic(strength) {
  if (strength < 0.25) return;
  haptic(strength > 0.7 ? 'heavy' : strength > 0.45 ? 'medium' : 'light');
}

// ── App lifecycle ────────────────────────────────────────────────────────────
/**
 * Fires with true when the app comes back to the foreground. Audio contexts get
 * suspended when a phone locks or the user switches away, and without this the
 * game comes back silent.
 */
export function onAppActive(cb) {
  const app = plugin('App');
  if (app) app.addListener('appStateChange', ({ isActive }) => cb(isActive));
  document.addEventListener('visibilitychange', () => cb(!document.hidden));
  // focus resumes, but blur deliberately does NOT report inactive: window blur
  // fires for things that are not backgrounding — a notification shade, focus
  // moving to browser chrome, devtools — and pausing the game for those means
  // it stops mid-climb for no visible reason. Actual backgrounding arrives via
  // visibilitychange on the web and appStateChange on device.
  window.addEventListener('focus', () => cb(true));
}

/** Android's hardware back button. Without a handler it closes the app mid-run. */
export function onBackButton(cb) {
  const app = plugin('App');
  if (app) app.addListener('backButton', cb);
}

export function exitApp() {
  try { plugin('App')?.exitApp(); } catch { /* web: nothing to exit */ }
}

// ── Screen wake lock ─────────────────────────────────────────────────────────
// Climbing a mountain slowly involves long stretches without a touch, and the
// screen dimming mid-climb is its own kind of tragedy.
let wakeLock = null;

export async function keepAwake() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    }
  } catch { /* denied or unsupported */ }
}

export async function reacquireWakeLock() {
  if (!wakeLock && document.visibilityState === 'visible') await keepAwake();
}

// ── Safe areas ───────────────────────────────────────────────────────────────
// A notch or a home indicator will sit on top of the HUD in landscape. The HUD
// is drawn into a canvas, so the CSS env() values have to be measured and
// handed to the drawing code in device pixels.
let probe = null;

export function safeAreaInsets(dpr = 1) {
  try {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;'
        + 'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);'
        + 'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
      document.body.appendChild(probe);
    }
    const s = getComputedStyle(probe);
    const px = (v) => (parseFloat(v) || 0) * dpr;
    return { top: px(s.paddingTop), right: px(s.paddingRight),
             bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
/** Called from the first user gesture, where the OS lets us do these things. */
export async function initPlatform() {
  await hideChrome();
  await lockLandscape();
  await keepAwake();
}
