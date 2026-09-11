import { IS_DEMO, SITE_DISPLAY, SITE_URL } from '../config';

// The try-it demo's one visible difference from a personal copy. It is on every tab and cannot be
// dismissed, because it is the honest answer to "can I just use this one?": no, and here is where
// to get your own. The reseed on every visit (main.tsx) is what makes the first sentence true.
// Its one link is the product page, the front door, since 2026-09-11 (it went to the setup guide
// before): on a phone the banner is the only way from the demo to the site, and the page has the
// guide a scroll down.

export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-banner" role="note">
      This is a demo with sample data, and it will not save anything. To read more or set up your
      own copy, go to{' '}
      <a href={SITE_URL} target="_blank" rel="noreferrer">
        {SITE_DISPLAY}
      </a>
      .
    </div>
  );
}
