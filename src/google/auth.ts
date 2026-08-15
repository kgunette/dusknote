// Google OAuth — implicit flow, full-page redirect, no popup/iframe library.
//
// This approach was proven on an iOS home-screen (standalone) install:
// response_type=token, full-page redirect to Google and back,
// prompt=none for silent renewal. Iframes and the Google popup library are the
// known iOS-standalone breakage points and are deliberately not used here.
// Don't swap approaches without re-testing on the actual phone.

import { GOOGLE_CLIENT_ID } from '../config';

// Only files this app creates. The Sheets API works fully against app-created spreadsheets under
// drive.file alone, so this keeps a stolen or injected token confined to the app sheet —
// it can't read or overwrite the user's other spreadsheets. Narrowed from the broader `spreadsheets`
// scope 2026-07-08. This changes what Google grants, so it MUST be re-verified on the actual phone
// (create / read / write / new-device pull); if anything breaks, revert to include `spreadsheets`.
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

const TOKEN_KEY = 'dn_token'; // { token, exp } — the ~1h access token
const CONNECTED_KEY = 'dn_connected'; // '1' once the user has ever completed sign-in on this device
const RECONNECT_KEY = 'dn_needs_reconnect'; // '1' when silent renewal failed and a real sign-in is needed
const SILENT_TRIED_KEY = 'dn_silent_tried'; // sessionStorage guard: at most one auto-renewal per app launch
// localStorage (NOT sessionStorage — the iOS standalone redirect wipes that): the in-flight sign-in's
// single-use secret + its silent flag, so the secret survives the round trip to Google and back to be
// checked on return. { nonce, silent, ts }. The timestamp bounds it: an abandoned sign-in used to
// leave a nonce sitting there forever, and a stale one can be consumed by a crafted ?state= link,
// which would make the user's next legitimate sign-in fail and drop them to Reconnect. No token is
// ever exposed either way; this just stops the annoyance.
const AUTH_STATE_KEY = 'dn_auth_state';
/** How long an in-flight sign-in stays valid. Generous: a real round trip to Google (including
 *  typing a password and a 2FA code) is well inside this, and anything older is abandoned. */
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface StoredToken {
  token: string;
  exp: number; // ms epoch
}

/** The redirect target — matches the origins authorized in Google Cloud (trailing slash). */
function redirectUri(): string {
  return location.origin + location.pathname;
}

/** A single-use random secret for the OAuth `state` check (login-CSRF / token-injection defense). */
function randomNonce(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const a = new Uint8Array(16);
  c.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A currently-valid access token, or null if expired/absent. */
export function getToken(): StoredToken | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (t && typeof t.token === 'string' && typeof t.exp === 'number' && t.exp > Date.now()) {
      return t;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function hasValidToken(): boolean {
  return getToken() != null;
}

/** True once the user has completed a Google sign-in on this device at least once. */
export function isConnected(): boolean {
  return localStorage.getItem(CONNECTED_KEY) === '1';
}

/** Restore the local "connected here" marker. Used at launch to rehydrate it from the durable
 *  IndexedDB mirror after iOS has evicted localStorage, so we show Reconnect (and can renew
 *  silently) instead of Connect. */
export function markConnectedLocal(): void {
  localStorage.setItem(CONNECTED_KEY, '1');
}

/** Ask the browser/iOS not to evict this app's storage, so the connection marker and token
 *  survive a storage sweep. Installed home-screen apps are usually granted it. Fire-and-forget. */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.();
}

/** True when a silent renewal failed (password change, revoked access) and a tap is needed. */
export function needsReconnect(): boolean {
  return localStorage.getItem(RECONNECT_KEY) === '1';
}

function setNeedsReconnect(v: boolean): void {
  if (v) localStorage.setItem(RECONNECT_KEY, '1');
  else localStorage.removeItem(RECONNECT_KEY);
}

/**
 * Parse the OAuth result from the URL fragment on app boot, store the token, and clean the URL.
 * Call once, as early as possible, before rendering. Its whole job is these side effects (store
 * token, mark connected, set/clear reconnect, tidy the URL); it returns nothing — the UI reacts to
 * the resulting state (the Settings card shows connected), so there is no status to hand back.
 *
 * A returned token is trusted ONLY if its `state` matches the single-use secret we generated for
 * this sign-in (see startAuth). That blocks a login-CSRF / token-injection link: a crafted URL
 * carrying someone else's token can't know our secret, so its token is rejected and never stored.
 */
export function handleAuthReturn(): void {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(location.search);
  const token = hash.get('access_token');
  const err = hash.get('error') || search.get('error');
  const returnedState = hash.get('state') || search.get('state') || '';

  // Only act on an actual OAuth return; a normal boot leaves any in-flight sign-in state untouched.
  if (!token && !err && !returnedState) return;

  // Consume this sign-in's stored secret (nonce) + silent flag, whatever the outcome.
  let expected: { nonce?: string; silent?: boolean; ts?: number } | null = null;
  try {
    expected = JSON.parse(localStorage.getItem(AUTH_STATE_KEY) || 'null');
  } catch {
    /* ignore a malformed value */
  }
  localStorage.removeItem(AUTH_STATE_KEY);
  const silent = expected?.silent === true;
  // A nonce with no timestamp is from a build before this existed; treat it as fresh rather than
  // rejecting a sign-in that is already in flight during an update.
  const fresh = expected?.ts == null || Date.now() - expected.ts < AUTH_STATE_TTL_MS;
  const stateOk =
    !!expected?.nonce && fresh && returnedState !== '' && returnedState === expected.nonce;

  if (token) {
    if (!stateOk) {
      // Either an injected token (attack) or our secret was evicted mid-redirect. Never store it;
      // fall back to a fresh, verifiable sign-in (Reconnect) rather than trusting it.
      history.replaceState(null, '', redirectUri());
      if (isConnected()) setNeedsReconnect(true);
      return;
    }
    const exp = Date.now() + parseInt(hash.get('expires_in') || '3600', 10) * 1000;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp }));
    localStorage.setItem(CONNECTED_KEY, '1');
    setNeedsReconnect(false);
    history.replaceState(null, '', redirectUri());
    return;
  }

  if (err) {
    history.replaceState(null, '', redirectUri());
    // login_required / interaction_required on the silent path => the device session
    // can no longer vouch silently; surface a Reconnect button instead of looping.
    if (silent) setNeedsReconnect(true);
  }
}

function startAuth(silent: boolean): void {
  if (!GOOGLE_CLIENT_ID) return;
  // Generate a single-use secret, remember it (with the silent flag), and pass it as `state`.
  // Google echoes `state` back unchanged; handleAuthReturn only accepts a token whose `state`
  // matches, so a token from a sign-in we didn't start is rejected.
  const nonce = randomNonce();
  localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({ nonce, silent, ts: Date.now() }));
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES,
    state: nonce,
  });
  if (silent) p.set('prompt', 'none');
  location.href = `${AUTH_ENDPOINT}?${p.toString()}`;
}


/** Interactive sign-in (the full Google screen). User-initiated; navigates away. */
export function signIn(): void {
  requestPersistentStorage(); // a user gesture is the best moment to be granted persistence
  setNeedsReconnect(false);
  startAuth(false);
}

/** Silent renewal (prompt=none). Navigates away and bounces back in ~1s, no interaction. */
export function renewSilently(): void {
  sessionStorage.setItem(SILENT_TRIED_KEY, '1');
  startAuth(true);
}

/** Renew at launch if the token expires within this window. A token still technically valid but
 *  seconds from expiry would otherwise pass the "have a token" check, render "connected", then die
 *  on the first sync and drop the user to Reconnect — a proactive renewal at launch sails through
 *  invisibly instead. (getToken() keeps the exact check, so a near-expiry token is still usable for
 *  an immediate API call; only the launch-renewal decision uses this buffer.) */
const RENEW_BUFFER_MS = 120_000; // 2 minutes

/** True when the network actually answers, not merely when the OS claims a connection.
 *  navigator.onLine alone is not enough to gate the renewal redirect: on a subway platform
 *  (2026-08-06, observed on the predecessor app carrying this same code) the OS reported online
 *  with no usable data, the redirect fired, and the app was left stranded on an unreachable
 *  accounts.google.com instead of booting from cache. So before leaving the page, probe a host
 *  the app already talks to (must be in the CSP's connect-src; 'self' won't do, the service
 *  worker would answer from cache). Short timeout: a network too slow to answer in 2s is not
 *  one to hand the whole page to. */
async function networkAnswers(): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2000);
  try {
    await fetch('https://www.googleapis.com/', { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    return true; // any response, even an opaque 404, proves the network path is real
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * At launch, if we hold no token — or one about to expire (within RENEW_BUFFER_MS) — but the device
 * is connected and online, attempt a single silent renewal. Guarded so it never loops: at most once
 * per app launch, never after a failed renewal (needsReconnect), never for a user who has not signed
 * in yet. The app opens on Log with nothing entered, so a ~1s bounce here costs no data.
 *
 * The reachability probe runs last, after every cheap guard, so a boot holding a valid token
 * never waits on the network at all.
 *
 * Returns true if it is redirecting away right now (caller should skip rendering).
 */
export async function maybeRenewOnLaunch(): Promise<boolean> {
  const t = getToken();
  if (t && t.exp > Date.now() + RENEW_BUFFER_MS) return false; // comfortably valid, no renewal needed
  if (!isConnected()) return false; // never signed in -> show Connect, don't auto-redirect
  if (needsReconnect()) return false; // last silent attempt failed -> show Reconnect
  if (!navigator.onLine) return false; // offline -> just work locally
  if (sessionStorage.getItem(SILENT_TRIED_KEY) === '1') return false; // already tried this launch
  if (!(await networkAnswers())) return false; // OS says online but nothing answers -> work locally
  renewSilently();
  return true;
}

/** Called when the Sheets API rejects our token (401): drop it and require a reconnect. */
export function handleTokenRejected(): void {
  localStorage.removeItem(TOKEN_KEY);
  setNeedsReconnect(true);
}

/** Forget the token and the connection on this device (does not revoke on Google's side). */
export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CONNECTED_KEY);
  setNeedsReconnect(false);
  sessionStorage.removeItem(SILENT_TRIED_KEY);
}
