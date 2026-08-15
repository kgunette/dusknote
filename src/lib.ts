import type { Attempt, Helped } from './types';
import { noRatingLabel } from './config';
import { RATING_WORDS } from './seeds';

export const pad = (n: number): string => String(n).padStart(2, '0');

/** Capitalize the first letter (chip labels are stored capitalized). */
export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** How long the "Saved" flash shows before a full-screen form dismisses. Shared by both forms. */
export const SAVED_FLASH_MS = 700;

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toHM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtTime(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ap}`;
}

function localDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDayShort(date: string): string {
  return localDate(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function fmtDateFull(date: string): string {
  return localDate(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDateLine(date: string, time: string, now = new Date()): string {
  const today = toISODate(now);
  const yesterday = toISODate(new Date(now.getTime() - 86400000));
  const day = date === today ? 'Today' : date === yesterday ? 'Yesterday' : fmtDayShort(date);
  return `${day}, ${fmtTime(time)}`;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function fmtMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Month keys, newest to oldest, inclusive. Capped as a guard against bad input. */
export function monthsDesc(newest: string, oldest: string, cap = 120): string[] {
  const out: string[] = [];
  let [y, m] = newest.split('-').map(Number);
  const [ey, em] = oldest.split('-').map(Number);
  while ((y > ey || (y === ey && m >= em)) && out.length < cap) {
    out.push(`${y}-${pad(m)}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function entryStart(e: { date: string; start_time: string }): Date {
  const [y, m, d] = e.date.split('-').map(Number);
  const [h, mi] = e.start_time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}


/** Short display word for a watched factor: the label up to the first "/" or "(", lowercased —
 *  "Allergies / pollen" → "allergies" — so splits read "3 with allergies". Shared by Stats,
 *  the report month lines, and the summary-table headers (which capitalize it). */
export function shortFactor(label: string): string {
  return label.split(/[/(]/)[0].trim().toLowerCase();
}

/** The 1–5 word for a rating. `words` are the (editable) labels; defaults to the seed set for the
 *  few callers that don't have the stored ones. 0 is always the locked noRatingLabel();
 *  blank/out-of-range → null. */
export function ratingWord(sev: number | null, words: readonly string[] = RATING_WORDS): string | null {
  if (sev === 0) return noRatingLabel();
  return sev != null && sev >= 1 && sev <= 5 ? words[sev - 1] : null;
}

/** "Thursday 3" — full weekday + day of month, no month. The feed's month header
 *  already carries the month, so the entry row doesn't repeat it. */
export function fmtWeekdayDay(date: string): string {
  const d = localDate(date);
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()}`;
}

export interface AttemptGroup {
  time: string; // raw HH:MM (may be '' for a timeless backfilled attempt)
  names: string; // "Ibuprofen + Antihistamine"
  helped: Helped;
}

/** Group treatment attempts that share a time and outcome into one row, so two meds taken
 *  together read as "Ibuprofen + Antihistamine". Shared by the feed (glyph outcome) and the
 *  report (spelled-out outcome), so both surfaces group identically. */
export function groupAttempts(attempts: Attempt[]): AttemptGroup[] {
  const groups: Array<{ time: string; names: string[]; helped: Helped }> = [];
  for (const a of attempts) {
    const last = groups[groups.length - 1];
    if (last && last.time === a.time && last.helped === a.helped) last.names.push(a.treatment);
    else groups.push({ time: a.time, names: [a.treatment], helped: a.helped });
  }
  return groups.map((g) => ({ time: g.time, names: g.names.join(' + '), helped: g.helped }));
}

/** Outcome in plain words, for the report (the doctor's copy). A null outcome renders nothing. */
export const HELPED_WORD: Record<'yes' | 'partly' | 'no', string> = {
  yes: 'helped',
  partly: 'partly',
  no: "didn't help",
};

/** The relief-glyph CSS class for an outcome: olive full / olive half / hollow ring.
 *  A null outcome (not yet answered) gets no glyph. Used in the feed and the log form. */
export function glyphClass(helped: Helped): string {
  return helped === 'yes'
    ? 'g-yes'
    : helped === 'partly'
      ? 'g-part'
      : helped === 'no'
        ? 'g-no'
        : '';
}

/** "just now" / "3m ago" / "2h ago" / "5d ago" — for the last-backed-up line. */
export function fmtRelativeTime(iso: string, now = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
