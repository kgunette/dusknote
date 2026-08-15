import { useEffect, useState } from 'react';
import type { SyncPhase } from '../google/useGoogleSync';

// The Log-screen backup banner (finding b). It surfaces the one degraded backup state that is
// otherwise silent: the Google connection lapsed and can't renew on its own, so nothing new backs
// up until the person reconnects. Scoped to phase === 'reconnect' only, so it never nags. Both
// states speak the app's existing status-dot language (amber dot = attention, olive dot = done;
// see .sync-dot), not a new motif.

// Survives the OAuth redirect that reboots the app, the same way the auth breadcrumbs do
// (localStorage, never sessionStorage, which the iOS standalone redirect wipes).
const RECONNECT_PENDING_KEY = 'dn_reconnect_pending';
const SUCCESS_MS = 4000;

export function BackupBanner({ phase, onReconnect }: { phase: SyncPhase; onReconnect: () => void }) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(RECONNECT_PENDING_KEY)) return;
    // The reconnect attempt has resolved. Confirm once on success; drop the breadcrumb on a
    // still-broken return (cancelled or declined) so no stale "reconnected" ever fires later.
    if (phase === 'ready') {
      localStorage.removeItem(RECONNECT_PENDING_KEY);
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), SUCCESS_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'reconnect' || phase === 'disconnected' || phase === 'error') {
      localStorage.removeItem(RECONNECT_PENDING_KEY);
    }
    // 'preparing' / 'choose' are mid-flight: keep the breadcrumb and wait for the outcome.
  }, [phase]);

  const reconnect = () => {
    localStorage.setItem(RECONNECT_PENDING_KEY, '1'); // read back after the redirect reboots the app
    onReconnect();
  };

  if (phase === 'reconnect') {
    return (
      <div className="backup-banner" role="status">
        <span className="dot warn" aria-hidden="true" />
        <span className="txt">
          <b>Backup disconnected.</b> Your entries are safe on this phone, but won't back up until
          you reconnect.
        </span>
        <button type="button" className="reconnect" onClick={reconnect}>
          Reconnect
        </button>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="backup-banner success" role="status">
        <span className="dot done" aria-hidden="true" />
        <span className="txt">
          <b>Backup reconnected.</b>
        </span>
      </div>
    );
  }

  return null;
}
