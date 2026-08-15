// Turn the raw local data + the chosen report options into a presentation-ready model.
// One model, two renderers: the on-screen preview (ReportScreen) and the PDF (pdf.ts) both
// read this, so what you see is what the doctor gets.

import type { Entry, Gap, MedEvent, TrackedMed } from '../types';
import {
  fmtDateFull,
  fmtMonth,
  fmtTime,
  groupAttempts,
  HELPED_WORD,
  monthKey,
  monthsDesc,
  ratingWord,
  shortFactor,
  toISODate,
} from '../lib';
import { noRatingLabel, noun } from '../config';
import { RATING_WORDS } from '../seeds';
import {
  breakoutDays,
  calendarDays,
  entryCount,
  gapsInMonth,
  episodeDays,
  medDays,
  ratingCounts,
  treatmentOutcomes,
  type CalDay,
  type TreatmentOutcome,
} from './counts';

/** The 0–5 legend for the report, from the (editable) rating words. Exact casing, no reformatting
 *  the words show as typed; 0/— are the fixed system labels. */
export function buildRatingKey(words: readonly string[]): Array<[string, string]> {
  return [
    ['0', noRatingLabel()],
    ['1', words[0]],
    ['2', words[1]],
    ['3', words[2]],
    ['4', words[3]],
    ['5', words[4]],
    ['—', 'Not recorded'],
  ];
}

export interface ReportOptions {
  /** null = all history; otherwise an inclusive ISO date range. */
  range: { start: string; end: string } | null;
  summaryTable: boolean;
  timeline: boolean;
  ratingMode: 'num' | 'word';
  includeSymptoms: boolean;
  includeTreatments: boolean;
  includeFactors: boolean;
  includeNotes: boolean;
  includeEvents: boolean;
  /** Include watched-factor with/without splits (summary-table columns + month count lines).
   *  Callers gate by passing watchedFactors: [] when off; see ReportScreen. */
  includeWatched: boolean;
  /** Include the "What helped" treatment-outcome table. Follows the report's date range like every
   *  other number on the page, so a Jan–Jun report never quietly shows all-time totals. */
  includeOutcomes: boolean;
}

/** The everyday starting point when you open the report: full timeline, no summary table. */
export const DEFAULT_OPTIONS: ReportOptions = {
  range: null,
  summaryTable: false,
  timeline: true,
  ratingMode: 'num',
  includeSymptoms: true,
  includeTreatments: true,
  includeFactors: true,
  includeNotes: false,
  includeEvents: false,
  includeWatched: false,
  includeOutcomes: false,
};

/** Everything on: the complete, self-explanatory snapshot used for the monthly auto-backup. */
export const BACKUP_OPTIONS: ReportOptions = {
  range: null,
  summaryTable: true,
  timeline: true,
  ratingMode: 'num',
  includeSymptoms: true,
  includeTreatments: true,
  includeFactors: true,
  includeNotes: true,
  includeEvents: true,
  includeWatched: true,
  includeOutcomes: true,
};

export interface MedDayCount {
  name: string;
  /** Distinct dates that month with an attempt of this medication (see counts.medDays). */
  days: number;
  limit: number | null;
}

export interface EntryItem {
  kind: 'entry';
  date: string;
  time: string | null;
  /** 0–5, or null when not recorded. */
  rating: number | null;
  /** "Hard to focus" / "No episode" / "Not recorded". */
  ratingWord: string;
  symptoms: string[];
  /** One line per attempt group, outcome spelled out for the doctor:
   *  ["7:10 AM Coffee, didn't help", "8:45 AM Ibuprofen + Antihistamine, helped"] (empty when none). */
  treatments: string[];
  factors: string[];
  notes: string;
}

export interface EventItem {
  kind: 'event';
  date: string;
  note: string;
}

export interface MonthSection {
  key: string;
  label: string; // "June 2026"
  status: 'data' | 'gap' | 'before';
  /** Gap reasons for a fully-missing month (status 'gap'). */
  gapReasons: string[];
  /** Gap reasons overlapping a month that still has some data (status 'data'). */
  partialGapReasons: string[];
  episodeDays: number;
  entryCount: number;
  medDays: MedDayCount[];
  /** Per-rating tally of the month's episode entries: index 0 = rating 1 … index 4 = rating 5.
   *  Stats-only (the report doesn't render it); a rating breakdown as a shade key. */
  ratings: number[];
  /** Per-day states for the Stats calendar (one entry per day of the month). Stats-only. */
  days: CalDay[];
  /** One with/without split per watched factor (Stats-only; the report doesn't render it). */
  breakouts: Array<{ label: string; days: number }>;
  items: Array<EntryItem | EventItem>;
}

export interface ReportModel {
  subtitle: string; // "Jane Doe · all history", or just the range when no name is set
  rangeLabel: string; // "all history" | "Jan 1 – Jul 4, 2026"
  preparedLabel: string; // "Prepared July 4, 2026"
  showKey: boolean; // rating key belongs at the top (numbers mode + timeline shown)
  months: MonthSection[]; // newest first
  hasAnyData: boolean;
  meds: TrackedMed[];
  /** Watched factors included in this model (already gated by the caller); summary-table columns. */
  watchedLabels: string[];
  /** "What helped" rows over the report's date range. Empty unless options.includeOutcomes. */
  outcomes: TreatmentOutcome[];
  /** The caption above the "What helped" table: "All history. Counts attempts, not days." Built
   *  here rather than in each renderer so the preview and the PDF can never word it differently. */
  outcomesScope: string;
  ratingKey: Array<[string, string]>; // the 0–5 legend, from the editable rating words
}


/** One line per attempt group, outcome in words: "8:45 AM Ibuprofen + Antihistamine, helped".
 *  Grouping is shared with the feed (groupAttempts); only the outcome rendering differs. */
function formatTreatments(attempts: Entry['treatments']): string[] {
  return groupAttempts(attempts).map((g) => {
    const t = g.time ? `${fmtTime(g.time)} ` : '';
    const outcome = g.helped ? `, ${HELPED_WORD[g.helped]}` : '';
    return `${t}${g.names}${outcome}`;
  });
}

function toEntryItem(e: Entry, words: readonly string[]): EntryItem {
  return {
    kind: 'entry',
    date: e.date,
    time: e.rating === 0 && !e.start_time ? null : e.start_time || null,
    rating: e.rating,
    ratingWord:
      e.rating == null ? 'Not recorded' : (ratingWord(e.rating, words) ?? 'Not recorded'),
    symptoms: e.symptoms,
    treatments: formatTreatments(e.treatments),
    factors: e.factors,
    notes: e.notes,
  };
}

/** Clip a value to a range for readable boundary handling. */
function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function buildReportModel(
  data: {
    entries: Entry[];
    events: MedEvent[];
    gaps: Gap[];
    meds: TrackedMed[];
    ratingWords?: readonly string[];
    /** Active watched factors (Stats' with/without split). Optional: the report path omits it. */
    watchedFactors?: string[];
    /** The name on the report (Settings → Your name). Empty/absent = no name line. */
    patientName?: string;
  },
  options: ReportOptions,
  now: Date
): ReportModel {
  const meds = data.meds.filter((m) => m.name.trim() !== '');
  const watched = data.watchedFactors ?? [];
  const words = data.ratingWords ?? RATING_WORDS;
  const liveEntries = data.entries; // already tombstone-free
  const oldestEntry =
    liveEntries.length > 0
      ? liveEntries.reduce((min, e) => (e.date < min ? e.date : min), liveEntries[0].date)
      : null;

  // Resolve the date range. All-history spans from the earliest thing we know about to today.
  const today = toISODate(now);
  let start: string;
  let end: string;
  if (options.range) {
    start = options.range.start;
    end = options.range.end;
  } else {
    const gapStarts = data.gaps.map((g) => g.start);
    const candidates = [oldestEntry, ...gapStarts].filter((d): d is string => d != null);
    start = candidates.length ? candidates.sort()[0] : today;
    end = today;
  }

  const entries = liveEntries.filter((e) => inRange(e.date, start, end));
  const events = options.includeEvents
    ? data.events.filter((v) => inRange(v.date, start, end))
    : [];
  const gaps = data.gaps.filter((g) => g.start && g.end && g.start <= end && g.end >= start);

  // Months before the global first entry are "before tracking began", not episode-free.
  const trackedFromKey = oldestEntry ? monthKey(oldestEntry) : null;

  const monthKeys =
    entries.length || gaps.length || options.range
      ? monthsDesc(monthKey(end), monthKey(start))
      : [];

  const rawMonths: MonthSection[] = monthKeys.map((key) => {
    const inMonth = entries.filter((e) => monthKey(e.date) === key);
    const monthGaps = gapsInMonth(key, gaps);

    if (inMonth.length === 0 && monthGaps.length > 0) {
      return blankSection(key, 'gap', monthGaps.map((g) => g.reason).filter(Boolean));
    }
    if (inMonth.length === 0 && trackedFromKey != null && key < trackedFromKey) {
      return blankSection(key, 'before', []);
    }

    const monthEvents = events.filter((v) => monthKey(v.date) === key);
    const items: Array<EntryItem | EventItem> = [
      ...inMonth.map((e) => toEntryItem(e, words)),
      ...monthEvents.map((v): EventItem => ({ kind: 'event', date: v.date, note: v.note })),
    ].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const at = a.kind === 'entry' ? (a.time ?? '') : '';
      const bt = b.kind === 'entry' ? (b.time ?? '') : '';
      return bt.localeCompare(at);
    });

    return {
      key,
      label: fmtMonth(key),
      status: 'data',
      gapReasons: [],
      partialGapReasons: monthGaps.map((g) => g.reason).filter(Boolean),
      episodeDays: episodeDays(inMonth),
      entryCount: entryCount(inMonth),
      medDays: meds.map((m) => ({ name: m.name, days: medDays(inMonth, m.name), limit: m.limit })),
      ratings: ratingCounts(inMonth),
      days: calendarDays(inMonth, monthGaps, key),
      breakouts: watched.map((label) => ({ label, days: breakoutDays(inMonth, label) })),
      items,
    };
  });

  const months = coalesceNonData(rawMonths);

  const rangeLabel = options.range
    ? `${fmtDateFull(start)} – ${fmtDateFull(end)}`
    : 'all history';

  const name = (data.patientName ?? '').trim();
  return {
    subtitle: name ? `${name} · ${rangeLabel}` : rangeLabel,
    rangeLabel,
    preparedLabel: `Prepared ${now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })}`,
    showKey: options.ratingMode === 'num' && options.timeline,
    months,
    hasAnyData: months.some((m) => m.status === 'data'),
    meds,
    watchedLabels: watched,
    // Built from the already range-filtered entries, so the table obeys the chosen range.
    outcomes: options.includeOutcomes ? treatmentOutcomes(entries) : [],
    // Scope stated next to the table, because unlike every other section it has no month names or
    // dates of its own to carry it, and the subtitle can be pages away in print.
    outcomesScope: `${rangeLabel.charAt(0).toUpperCase()}${rangeLabel.slice(1)}. Counts attempts, not days.`,
    ratingKey: buildRatingKey(words),
  };
}

function blankSection(key: string, status: 'gap' | 'before', gapReasons: string[]): MonthSection {
  return {
    key,
    label: fmtMonth(key),
    status,
    gapReasons,
    partialGapReasons: [],
    episodeDays: 0,
    entryCount: 0,
    medDays: [],
    ratings: [0, 0, 0, 0, 0],
    days: [],
    breakouts: [],
    items: [],
  };
}

function nonDataSig(m: MonthSection): string {
  return m.status === 'before' ? 'before' : `gap:${m.gapReasons.join('|')}`;
}

/**
 * Collapse runs of consecutive gap / before-tracking months that share a reason into one
 * range section, so a long gap reads "February 2026 – April 2026 — no data (reason)" once
 * instead of repeating the same paragraph every month. Data months pass through untouched.
 */
function coalesceNonData(months: MonthSection[]): MonthSection[] {
  const out: MonthSection[] = [];
  for (let i = 0; i < months.length; ) {
    const m = months[i];
    if (m.status === 'data') {
      out.push(m);
      i++;
      continue;
    }
    let j = i;
    const sig = nonDataSig(m);
    while (j + 1 < months.length && months[j + 1].status !== 'data' && nonDataSig(months[j + 1]) === sig) {
      j++;
    }
    // months run newest-first, so months[j] is the oldest of the run.
    out.push(
      j === i ? m : { ...m, key: `${months[j].key}__${months[i].key}`, label: `${months[j].label} – ${months[i].label}` }
    );
    i = j + 1;
  }
  return out;
}

/** The reason phrase for a non-data section (no "no data" prefix). Empty for data months. */
export function reportReason(m: MonthSection): string {
  if (m.status === 'gap') return m.gapReasons.join('; ');
  if (m.status === 'before') return 'before tracking began';
  return '';
}

/** The full "no data" sentence shown under a gap divider in the timeline. */
export function monthNoDataText(m: MonthSection): string {
  if (m.status === 'before') return 'Before tracking began.';
  return reportReason(m) || 'No records for this period.';
}

export interface CountPart {
  text: string;
  /** true when a tracked-med dose count exceeds its monthly limit (bolded in the report). */
  over: boolean;
}

/** The month's counts as parts, so an over-limit dose can be emphasized where it renders. */
export function monthCountsParts(m: MonthSection): CountPart[] {
  if (m.status !== 'data') return [{ text: 'no data', over: false }];
  return [
    { text: `${m.episodeDays} ${noun()} day${m.episodeDays === 1 ? '' : 's'}`, over: false },
    { text: `${m.entryCount} ${noun()} ${m.entryCount === 1 ? 'entry' : 'entries'}`, over: false },
    ...m.medDays.map((d) => ({
      text: `${d.days} ${d.name}`,
      over: d.limit != null && d.days > d.limit,
    })),
    // Watched-factor splits (empty unless the caller included them). A factor with zero
    // matching days in the month simply doesn't appear, same as Stats.
    ...m.breakouts
      .filter((b) => b.days > 0)
      .map((b) => ({ text: `${b.days} with ${shortFactor(b.label)}`, over: false })),
  ];
}

