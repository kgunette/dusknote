// The app's identity and the per-deployer configuration surface. Two kinds of value live here:
//
// 1. The app's ONE name + version. Canonical source: package.json ("displayName" / "version"),
//    injected at build time (see vite.config.ts). The title, manifest, sheet name, backup folder,
//    report footer, and update banner all derive from these, so the name lives in exactly one
//    place. This is the project's name, not a per-deployer setting: every deployment is Dusknote.
//    The only name a deployer picks is their own Vercel project's, which becomes their address,
//    not the app's name.
//
// 2. The ONE genuinely per-deployer value, read from env: the Google OAuth Client ID
//    (deployment infrastructure). Everything a person personalizes (vocabulary, rating words,
//    watched factors, the condition noun, the name on the report) is user data, never
//    configuration.

export const APP_NAME: string = __APP_NAME__;
export const APP_VERSION: string = __APP_VERSION__;

/** The canonical repo. The update banner checks its latest release; docs link to it. */
export const REPO = 'kgunette/dusknote';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

/** The project's front door, linked from the Settings footer. Deliberately points at the project
 *  rather than the maker's personal site: a fork is frozen until its owner syncs, so anything
 *  hardcoded here is effectively permanent in that copy, and this way how the maker is presented
 *  can change by editing one page instead of needing strangers to redeploy. Attribution lives on
 *  the other end of this link (and in LICENSE, which MIT requires every fork to carry).
 *  Must resolve before the repo is public, or every deployer ships a dead link. */
export const SITE_URL = 'https://dusknote.app';

/** SITE_URL as it reads in print: "dusknote.app". The report footer's center slot, where a doctor
 *  or anyone else the report is shared with can find the project. Derived so it can never drift
 *  from the link itself. */
export const SITE_DISPLAY = SITE_URL.replace(/^https?:\/\//, '');

/** Google OAuth Client ID (public by design, not a secret) — the ONE deploy-time value.
 *  Empty = this deployment has no Google Cloud project yet; Settings explains that instead
 *  of offering Connect. */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// ---- The condition noun: what you call the thing you track ("episode", "headache", "flare").
// Personalization, so it is user data, set in-app (Log options → What you track), stored in
// prefs, synced via the sheet, loaded before first render (main.tsx) into this module-level
// value. Rare writes (a settings edit) trigger a React re-render from App, so render-time
// reads via noun() always see the current word.

const NOUN_FALLBACK = 'episode';
let currentNoun = NOUN_FALLBACK;

/** Lowercased, trimmed; empty when invalid. Letters, spaces, hyphens; short. */
export function normalizeNoun(raw: string): string {
  const n = raw.trim().toLowerCase();
  return /^[a-z][a-z -]{0,23}$/.test(n) ? n : '';
}

export function setConditionNoun(raw: string): void {
  currentNoun = normalizeNoun(raw) || NOUN_FALLBACK;
}

/** The current condition noun ("episode" until personalized). */
export function noun(): string {
  return currentNoun;
}

/** "an episode" / "a headache" — indefinite article chosen by first letter. */
export function aNoun(n?: string): string {
  const w = n ?? currentNoun;
  return `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
}

/** "Episode" — capitalized, for headings and sentence starts. */
export function nounCap(n?: string): string {
  const w = n ?? currentNoun;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** The locked rating-0 label ("No episode"): a symptom-only day that never counts as one. */
export function noRatingLabel(): string {
  return `No ${currentNoun}`;
}
