import { docUrl, IS_DEMO } from '../config';

// The try-it demo's one visible difference from a personal copy. It is on every tab and cannot be
// dismissed, because it is the honest answer to "can I just use this one?": no, and here is how
// to get your own. The reseed on every visit (main.tsx) is what makes the first sentence true.

export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-banner" role="note">
      This is a demo with sample data, and it will not save anything. To keep your own records,{' '}
      <a href={docUrl('setup-guide.md')} target="_blank" rel="noreferrer">
        set up your own copy
      </a>
      .
    </div>
  );
}
