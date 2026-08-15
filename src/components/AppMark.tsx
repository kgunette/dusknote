/** The app mark (the "dusk bands" logo) for in-app use: three ragged olive bands
 *  fading down, on a card-colored rounded tile so it stays visible against the near-black
 *  feed (one elevation step up from the home-screen icon's #12151d ground). Mark only, no
 *  wordmark. Used on the feed top row and in the Settings footer. */
export function AppMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <rect x="2" y="2" width="96" height="96" rx="24" fill="var(--card)" />
      <line x1="22" y1="32" x2="78" y2="32" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" />
      <line x1="22" y1="50" x2="66" y2="50" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" opacity="0.72" />
      <line x1="22" y1="68" x2="54" y2="68" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" opacity="0.46" />
    </svg>
  );
}
