// The monthly-count math, in one place, so the Stats tab and the report can never disagree.
// The definitions, which every consumer relies on:
//   episode days = distinct dates with a episode entry (rating !== 0; symptom-only excluded)
//   entryCount      = count of episode entries (rating !== 0)
//   med days      = distinct dates with a treatment attempt matching a tracked medication
//   rating counts = per-level (1–5) tally of rated episode entries
//   breakout days = episode days that carry a given watched factor
// A null rating ("not recorded", common in backfill) counts as an episode, same as the app.

import type { Entry, Gap } from '../types';
import { pad } from '../lib';

/** A month's inclusive date bounds. '31' is a safe upper bound on zero-padded ISO strings. */
export function monthBounds(key: string): { first: string; last: string } {
  return { first: `${key}-01`, last: `${key}-31` };
}

/** Gaps that overlap the given month. */
export function gapsInMonth(key: string, gaps: Gap[]): Gap[] {
  const { first, last } = monthBounds(key);
  return gaps.filter((g) => g.start <= last && g.end >= first);
}

/** Distinct dates carrying at least one episode (rating !== 0). */
export function episodeDays(entries: Entry[]): number {
  return new Set(entries.filter((e) => e.rating !== 0).map((e) => e.date)).size;
}

/** Total episode entries (rating !== 0). */
export function entryCount(entries: Entry[]): number {
  return entries.filter((e) => e.rating !== 0).length;
}

/**
 * Distinct dates with a treatment attempt matching a medication (case-insensitive). This is the
 * clinically-meaningful count. Days, not doses: "am I taking this too often" is asked in days
 * across medicine, and the thresholds that matter vary by drug and condition, which is why a
 * limit is something you set yourself rather than something the app assumes. Two doses on one
 * date is still one medication day.
 */
export function medDays(entries: Entry[], medName: string): number {
  const n = medName.trim().toLowerCase();
  if (!n) return 0;
  const dates = new Set<string>();
  for (const e of entries) {
    if (e.treatments.some((a) => a.treatment.toLowerCase() === n)) dates.add(e.date);
  }
  return dates.size;
}

/** One treatment's outcome tally over whatever entries were passed in. `tries` is every attempt;
 *  `noOutcome` are the attempts with nothing recorded, kept separate and never folded into the
 *  denominator. Deliberately avoids the word "rating", which everywhere else in this codebase
 *  means the 0–5 episode rating. */
export interface TreatmentOutcome {
  /** Display label — the most recent spelling logged (entries arrive newest-first). */
  name: string;
  yes: number;
  partly: number;
  no: number;
  /** Attempts with helped === null. Missing data stays missing, never counted as "didn't help". */
  noOutcome: number;
  /** yes + partly + no + noOutcome. */
  tries: number;
}

/**
 * Outcome tallies per treatment, newest-spelling wins, matched case-insensitively like medDays.
 * Deliberately counts *attempts*, not days: an outcome is recorded per attempt, so "did it work
 * when I tried it" is the only question this data can answer. That makes it the one stat in the
 * app that isn't days-based, which the label has to say out loud.
 *
 * Scope comes from the caller's entries: Stats passes everything (all time), the report passes its
 * date-range slice, so the report's version obeys the same range as every other number on the page.
 *
 * Every treatment with at least one attempt is returned, including ones with no outcomes at all
 * (rendered as "no outcomes recorded"): omitting them would read as the app having lost them, and
 * the missing outcomes are themselves the honest story. Sorted by attempts desc, then name, so what
 * you reach for most sits on top and the order is stable across renders.
 */
export function treatmentOutcomes(entries: Entry[]): TreatmentOutcome[] {
  const byKey = new Map<string, TreatmentOutcome>();
  for (const e of entries) {
    for (const a of e.treatments) {
      const name = a.treatment.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let t = byKey.get(key);
      if (!t) {
        t = { name, yes: 0, partly: 0, no: 0, noOutcome: 0, tries: 0 };
        byKey.set(key, t);
      }
      t.tries++;
      if (a.helped === 'yes') t.yes++;
      else if (a.helped === 'partly') t.partly++;
      else if (a.helped === 'no') t.no++;
      else t.noOutcome++;
    }
  }
  return [...byKey.values()].sort((a, b) => b.tries - a.tries || a.name.localeCompare(b.name));
}

/** Per-level tally of rated episode entries: index 0 = rating 1 … index 4 = rating 5.
 *  Rating 0 (no episode) and null (not recorded) are excluded, so the five bands cover the
 *  rated entryCount only. */
export function ratingCounts(entries: Entry[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const e of entries) {
    if (e.rating != null && e.rating >= 1 && e.rating <= 5) out[e.rating - 1]++;
  }
  return out;
}

/** Distinct episode dates (rating !== 0) whose entry carries the given watched factor. A date
 *  counts if ANY episode on it is flagged, so with + without always sum to episodeDays. */
export function breakoutDays(entries: Entry[], factorLabel: string): number {
  const factor = factorLabel.trim().toLowerCase();
  if (!factor) return 0;
  const dates = new Set<string>();
  for (const e of entries) {
    if (e.rating === 0) continue;
    if (e.factors.some((f) => f.toLowerCase() === factor)) dates.add(e.date);
  }
  return dates.size;
}

/** One day of the Stats calendar. */
export interface CalDay {
  /** 1-based day of the month. */
  day: number;
  /** Worst rating that day (1–5), or null when the day has no *rated* episode. */
  rating: number | null;
  /** Any episode that day (rating !== 0), rated or not — matches episodeDays. */
  episode: boolean;
  /** Day sits inside a coverage gap and has no episode entry (episodes take precedence). */
  gap: boolean;
}

/**
 * Per-day states for a month's Stats calendar, derived from the same month entries and gaps the
 * counts use, so the calendar and the episode-days count can never disagree. A day is: a *rated*
 * episode (shaded by its worst rating), an *unrated* episode (episode but no rating recorded,
 * e.g. backfill), inside a *gap* (no data), or *none* (no episode). Symptom-only days (rating 0)
 * are not episode days and read as none.
 */
export function calendarDays(entries: Entry[], monthGaps: Gap[], key: string): CalDay[] {
  const [y, m] = key.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate(); // day 0 of the next month = last day of this one
  const worst = new Map<string, number | null>(); // date -> worst rating, or null if episode-but-unrated
  for (const e of entries) {
    if (e.rating === 0) continue; // symptom-only, not a episode day
    const rated = e.rating != null && e.rating >= 1 && e.rating <= 5 ? e.rating : null;
    if (!worst.has(e.date)) {
      worst.set(e.date, rated);
    } else if (rated != null) {
      const cur = worst.get(e.date) ?? 0;
      if (rated > cur) worst.set(e.date, rated);
    }
  }
  const out: CalDay[] = [];
  for (let d = 1; d <= dim; d++) {
    const date = `${key}-${pad(d)}`;
    const episode = worst.has(date);
    const rating = episode ? worst.get(date) ?? null : null;
    const gap = !episode && monthGaps.some((g) => g.start <= date && g.end >= date);
    out.push({ day: d, rating, episode, gap });
  }
  return out;
}
