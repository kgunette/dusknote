import { useEffect, useState } from 'react';
import { APP_NAME, APP_VERSION, RELEASES_URL, REPO } from '../config';

// The quiet "new version available" line. Privacy contract: the ONLY network contact this app
// makes besides the user's own Google Sheet. It asks GitHub one public question ("what's the
// latest release?") at most once a day, compares version numbers locally on the device, and
// sends nothing about the user. Fails silently on any error (offline, rate-limited, repo
// private) — the banner simply doesn't show.

const CHECKED_AT_KEY = 'dn_update_checked_at'; // epoch ms of the last successful check
const LATEST_KEY = 'dn_update_latest'; // last version string GitHub reported
const DISMISSED_KEY = 'dn_update_dismissed'; // version the user dismissed the banner for
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** "1.2.0" vs "1.10.1" — numeric per-part compare; true when b is newer than a. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (y !== x) return y > x;
  }
  return false;
}

export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(() => localStorage.getItem(LATEST_KEY));
  const [dismissed, setDismissed] = useState<string | null>(() =>
    localStorage.getItem(DISMISSED_KEY)
  );

  useEffect(() => {
    const last = Number(localStorage.getItem(CHECKED_AT_KEY) || 0);
    if (Date.now() - last < CHECK_EVERY_MS) return;
    let cancelled = false;
    (async () => {
      try {
        // no-referrer strips the Referer header. The Origin header is unavoidable on a CORS
        // fetch, so GitHub still learns that this deployment exists; nothing about the person
        // using it travels either way. The README and the setup guide say so plainly.
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' },
          referrerPolicy: 'no-referrer',
        });
        if (!res.ok) return;
        const data: { tag_name?: string } = await res.json();
        const tag = (data.tag_name || '').replace(/^v/, '');
        if (!tag || cancelled) return;
        localStorage.setItem(CHECKED_AT_KEY, String(Date.now()));
        localStorage.setItem(LATEST_KEY, tag);
        setLatest(tag);
      } catch {
        /* silent by design: no update signal is never an error the user needs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!latest || !isNewer(APP_VERSION, latest) || dismissed === latest) return null;

  return (
    <div className="update-banner">
      <span>
        A new version of {APP_NAME} is available.{' '}
        <a href={RELEASES_URL} target="_blank" rel="noreferrer">
          See what’s new
        </a>
      </span>
      <button
        type="button"
        className="update-banner-x"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, latest);
          setDismissed(latest);
        }}
      >
        ×
      </button>
    </div>
  );
}
