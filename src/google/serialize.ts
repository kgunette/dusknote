// Local data -> sheet rows. Pure functions, no network, so they're easy to test.
//
// The sheet is a readable mirror of the phone: each push wholesale-rewrites every tab from
// local state (the phone is the source of truth). Multi-value fields use "; " separators so
// Sheets filters work and a human reads it naturally.

import type { Attempt, ChipDef, Entry, Gap, Helped, MedEvent, TrackedMed, VocabItem } from '../types';
import { ratingWord, uid } from '../lib';
import { RATING_WORDS } from '../seeds';
import { vocabFromLegacy } from '../vocab';

export interface SyncSnapshot {
  entries: Entry[]; // live entries only (tombstones already filtered out)
  vocab: VocabItem[]; // the merged vocabulary; chips/meds are derived from this
  ratingWords: string[]; // the editable 1–5 rating words
  gaps: Gap[];
  events: MedEvent[];
  conditionNoun: string; // "episode" / "headache" / … (Kind=setting row; v7)
  patientName: string; // name on the report; empty = none (Kind=setting row; v7)
}

// Human-readable content first (Entries, Events), then Gaps, then machine state (Preferences).
export const TAB_ORDER = ['Entries', 'Events', 'Gaps', 'Preferences'] as const;

/** Bump whenever the sheet's tab or column layout changes (e.g. renaming a header). The sync's
 *  "did anything change" check hashes the data, which a header-only rename wouldn't alter, so
 *  folding this in forces one re-push per device to rewrite the sheet with the new layout.
 *  v2: Severity → Rating / Rating word, Factors → Other factors (2026-07-05).
 *  v3: Preferences becomes one row per vocab item (Kind=item, +Archived column) (2026-07-05).
 *  v4: Preferences gains Kind=rating rows for the editable 1–5 words.
 *  v5: dropped the End column from Entries (end-time was cut from the form 2026-07-04 and never
 *      repopulated, so the column only held one stale value; the model field stays dormant), 2026-07-06.
 *  v6: Preferences gains a Watched column (Kind=item factor rows; the Stats with/without split), 2026-07-23.
 *  v7: Preferences gains Kind=setting rows (the condition noun; the report patient name), 2026-07-23.
 *  v8: Preferences gains a DailyLimit column (doses in one day, on Kind=item medication rows),
 *      2026-08-31. Purely additive: an older sheet has no such column, which states nothing and
 *      reads as null, so nothing written before v8 needs converting. */
export const SHEET_SCHEMA_VERSION = 7;

export const HEADERS: Record<string, string[]> = {
  // Entries is the doctor-readable table; column order is locked.
  Entries: [
    'Date',
    'Start',
    'Rating',
    'Rating word',
    'Symptoms',
    'Treatments',
    'Other factors',
    'Notes',
    'Source',
    'ID',
    'Logged at',
    'Updated at',
  ],
  Events: ['Date', 'Note'],
  Gaps: ['Start', 'End', 'Reason'],
  // Machine state that travels to a new phone: one row per vocab item (Kind=item). Kept
  // human-readable — Label/Type spell it out, Limit is a plain number, Archived is a word.
  Preferences: ['Kind', 'Label', 'Type', 'Limit', 'Archived', 'Watched', 'DailyLimit'],
};

/** One readable treatment cell: "06:15 Water → no; 08:30 Ibuprofen → yes". */
function treatmentsCell(e: Entry): string {
  return e.treatments
    .map((a) => `${a.time} ${a.treatment}${a.helped ? ` → ${a.helped}` : ''}`)
    .join('; ');
}

function entryRow(e: Entry, ratingWords: readonly string[]): string[] {
  return [
    e.date,
    e.start_time,
    e.rating == null ? '' : String(e.rating),
    ratingWord(e.rating, ratingWords) ?? '',
    e.symptoms.join('; '),
    treatmentsCell(e),
    e.factors.join('; '),
    e.notes,
    e.source,
    e.id,
    e.logged_at,
    e.updated_at,
  ];
}

export interface TabValues {
  title: string;
  values: string[][]; // header row + data rows
}

/** Header-only tabs, for first-time sheet creation. */
export function headerOnlyTabs(): TabValues[] {
  return TAB_ORDER.map((title) => ({ title, values: [HEADERS[title]] }));
}

/** Full tab contents from local state, for a push. Entries read chronologically. */
export function buildTabs(s: SyncSnapshot): TabValues[] {
  const entriesAsc = [...s.entries].sort((a, b) =>
    `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)
  );
  const eventsAsc = [...s.events].sort((a, b) => a.date.localeCompare(b.date));
  const gapsAsc = [...s.gaps].sort((a, b) => a.start.localeCompare(b.start));

  return [
    { title: 'Entries', values: [HEADERS.Entries, ...entriesAsc.map((e) => entryRow(e, s.ratingWords))] },
    { title: 'Events', values: [HEADERS.Events, ...eventsAsc.map((ev) => [ev.date, ev.note])] },
    { title: 'Gaps', values: [HEADERS.Gaps, ...gapsAsc.map((g) => [g.start, g.end, g.reason])] },
    {
      title: 'Preferences',
      values: [
        HEADERS.Preferences,
        ...s.vocab.map((v) => [
          'item',
          v.label,
          v.type,
          v.limit == null ? '' : String(v.limit),
          v.archived ? 'archived' : '',
          v.watched ? 'watched' : '',
          v.dailyLimit == null ? '' : String(v.dailyLimit),
        ]),
        // rating rows: the level sits in the Type column (Kind=rating, Label=word).
        ...s.ratingWords.map((w, i) => ['rating', w, String(i + 1), '', '', '', '']),
        // setting rows: the value sits in Label, the setting key in Type (Kind=setting, v7).
        ['setting', s.conditionNoun, 'noun', '', '', '', ''],
        ...(s.patientName ? [['setting', s.patientName, 'name', '', '', '', '']] : []),
      ],
    },
  ];
}

/** True when there is nothing worth backing up. On a fresh device this decides pull vs push:
 *  empty local + a sheet with data means pull (new-phone recovery). */
export function isEmptySnapshot(s: SyncSnapshot): boolean {
  return s.entries.length === 0 && s.events.length === 0 && s.gaps.length === 0;
}

// ---- Deserialization: sheet rows -> local data (the inverse of buildTabs, for the pull) ----

/** Build a header-name -> value lookup for a row, so parsing survives column reordering. */
function byHeader(header: string[], row: string[]): (name: string) => string {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => (idx[h] = i));
  return (name) => (idx[name] != null ? (row[idx[name]] ?? '') : '');
}

export function splitMulti(cell: string): string[] {
  return cell.trim() ? cell.split(';').map((s) => s.trim()).filter(Boolean) : [];
}

/** "06:15 Water → no; 08:30 Ibuprofen → yes" -> attempts. Treatment names may have spaces.
 *  Shared with the CSV import (same cell format there). */
export function parseTreatments(cell: string): Attempt[] {
  if (!cell.trim()) return [];
  return cell
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      // Time is optional so an attempt with no time but a recorded outcome ("Ibuprofen → yes")
      // still parses the outcome, instead of swallowing "→ yes" into the treatment name.
      const m = part.match(/^(?:(\d{1,2}:\d{2})\s+)?(.+?)(?:\s+→\s+(yes|partly|no))?$/);
      if (m) return { id: uid(), time: m[1] ?? '', treatment: m[2].trim(), helped: (m[3] as Helped) ?? null };
      return { id: uid(), time: '', treatment: part, helped: null };
    });
}

// ---- The Preferences table, read for what it STATES ----
//
// Two callers want different things from the same table. A sheet PULL is recovery: a phone being
// restored has nothing of its own, so anything the table leaves out should fall back to the app's
// default. A Preferences IMPORT is the opposite: the device already holds settings the person
// chose, and the rule there is that a setting the file never mentions is left alone. Neither can
// be built on the other's answer, so this reader reports what the table actually states and lets
// each caller decide what absence means.

/** One Kind=item row, exactly as stated. Whether an optional column exists at all is reported
 *  once on StatedPreferences, since a column is present or absent for the whole table. */
export interface StatedItem {
  /** 1-based row number in the table, so an import error can name the row a person can go and fix. */
  row: number;
  label: string;
  /** The Type cell verbatim, or null when it is empty. Unrecognized words come through as
   *  written so the import can name what it found; the pull path treats anything odd as a remedy. */
  type: string | null;
  /** The MONTHLY limit: a whole number >= 1, or null for none. Meaningful only when
   *  `columns.limit`. */
  limit: number | null;
  /** The DAILY limit: a whole number >= 1, or null for none. Meaningful only when
   *  `columns.dailyLimit`; a table written before v8 has no such column and states nothing. */
  dailyLimit: number | null;
  /** Meaningful only when `columns.archived`. */
  archived: boolean;
  /** The cell said "watched". Applying it to a non-factor is each caller's own business.
   *  Meaningful only when `columns.watched`. */
  watched: boolean;
}

/** A single stated value, with the row it came from. */
export interface StatedValue {
  row: number;
  value: string;
}

export interface StatedPreferences {
  items: StatedItem[];
  /** Which optional columns the table carries. An absent column states nothing for any row. */
  columns: { limit: boolean; archived: boolean; watched: boolean; dailyLimit: boolean };
  /** Five slots for ratings 1 through 5; null where the table names no word for that level.
   *  Each carries its row number so a caller that has to refuse a word can name the row. */
  ratingWords: (StatedValue | null)[];
  /** null when the table carries no setting row for it. */
  conditionNoun: StatedValue | null;
  patientName: StatedValue | null;
  /** Pre-v3 chip/med rows, for the pull path's accept-old sheet recovery. */
  legacyChips: ChipDef[];
  legacyMeds: TrackedMed[];
}

/** Read a Preferences table (header row + data rows) for what it states. Never throws; a row it
 *  cannot make sense of is left out rather than guessed at. */
export function readPreferenceRows(rows: string[][]): StatedPreferences {
  const header = (rows[0] ?? []).map((h) => h.trim());
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (idx[h] == null) idx[h] = i;
  });
  const cell = (row: string[], name: string) => (idx[name] != null ? (row[idx[name]] ?? '') : '');

  const items: StatedItem[] = [];
  const ratingWords: (StatedValue | null)[] = [null, null, null, null, null];
  let conditionNoun: StatedValue | null = null;
  let patientName: StatedValue | null = null;
  const legacyChips: ChipDef[] = [];
  const legacyMeds: TrackedMed[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const kind = cell(row, 'Kind').trim();
    const label = cell(row, 'Label');
    if (!label) continue; // a row that names nothing states nothing
    const readLimit = (col: string): number | null => {
      const raw = cell(row, col);
      const n = Number(raw);
      return raw !== '' && Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
    };
    const limit = readLimit('Limit');
    const dailyLimit = readLimit('DailyLimit');
    if (kind === 'item') {
      items.push({
        row: r + 1,
        label,
        type: cell(row, 'Type').trim() || null,
        limit,
        archived: cell(row, 'Archived').trim().toLowerCase() === 'archived',
        watched: cell(row, 'Watched').trim().toLowerCase() === 'watched',
        dailyLimit,
      });
    } else if (kind === 'rating') {
      // The level sits in the Type column (Kind=rating, Label=word).
      const level = Number(cell(row, 'Type'));
      if (Number.isInteger(level) && level >= 1 && level <= 5)
        ratingWords[level - 1] = { row: r + 1, value: label };
    } else if (kind === 'setting') {
      // The value sits in Label, the setting key in Type.
      const key = cell(row, 'Type').trim();
      if (key === 'noun') conditionNoun = { row: r + 1, value: label };
      else if (key === 'name') patientName = { row: r + 1, value: label };
    } else if (kind === 'chip') {
      legacyChips.push({ label, type: (cell(row, 'Type') as ChipDef['type']) || 'remedy' });
    } else if (kind === 'med') {
      legacyMeds.push({ name: label, limit });
    }
    // Any other Kind is left alone on purpose: a table written by a newer version of the app
    // must not make this one refuse the whole file over a row it has no opinion about.
  }

  return {
    items,
    columns: {
      limit: idx['Limit'] != null,
      archived: idx['Archived'] != null,
      watched: idx['Watched'] != null,
      dailyLimit: idx['DailyLimit'] != null,
    },
    ratingWords,
    conditionNoun,
    patientName,
    legacyChips,
    legacyMeds,
  };
}

/** Parse the four tabs (raw values incl. header rows) back into a local snapshot. */
export function parseTabs(raw: Record<string, string[][]>): SyncSnapshot {
  const entries: Entry[] = [];
  const gaps: Gap[] = [];
  const events: MedEvent[] = [];
  const now = new Date().toISOString();

  const eRows = raw.Entries ?? [];
  for (const r of eRows.slice(1)) {
    const g = byHeader(eRows[0], r);
    if (!g('Date')) continue;
    // Accept the new "Rating" header and the old "Severity" one, so recovery from an
    // older backup still works (accept-old, write-new).
    const sevRaw = g('Rating') || g('Severity');
    const sev = sevRaw === '' ? null : Number(sevRaw);
    entries.push({
      id: g('ID') || uid(),
      date: g('Date'),
      start_time: g('Start'),
      rating: sev != null && Number.isFinite(sev) ? sev : null,
      symptoms: splitMulti(g('Symptoms')),
      treatments: parseTreatments(g('Treatments')),
      factors: splitMulti(g('Other factors') || g('Factors')),
      notes: g('Notes'),
      source: g('Source') === 'backfilled' ? 'backfilled' : 'normal',
      deleted: false,
      logged_at: g('Logged at') || now,
      updated_at: g('Updated at') || now,
    });
  }

  // Preferences: read what the table STATES, then fill this path's defaults in on top. A pull is
  // recovery, so a missing rating row or setting row means "use the app's own default": a phone
  // being restored has nothing of its own to keep. The Preferences IMPORT wants the opposite and
  // reads the same table through readPreferenceRows directly.
  const stated = readPreferenceRows(raw.Preferences ?? []);
  const vocab: VocabItem[] = stated.items.map((it) => {
    const type = (it.type as VocabItem['type']) || 'remedy';
    return {
      label: it.label,
      type,
      limit: type === 'medication' ? it.limit : null,
      // Absent column (pre-v8 sheet) reads as no daily limit — accept-old, write-new.
      dailyLimit: type === 'medication' ? it.dailyLimit : null,
      archived: it.archived,
      // Absent column (pre-v6 sheet) reads as not watched — accept-old, write-new.
      watched: type === 'factor' && it.watched,
    };
  });
  const ratingWords: string[] = RATING_WORDS.map((w, i) => stated.ratingWords[i]?.value ?? w);
  // v7 settings: absent rows (pre-v7 sheet) keep the app's defaults.
  const conditionNoun = stated.conditionNoun?.value ?? 'episode';
  const patientName = stated.patientName?.value ?? '';
  const { legacyChips, legacyMeds } = stated;
  const finalVocab = vocab.length ? vocab : vocabFromLegacy(legacyChips, legacyMeds);

  const cRows = raw.Gaps ?? [];
  for (const r of cRows.slice(1)) {
    const g = byHeader(cRows[0], r);
    if (g('Start') && g('End')) {
      gaps.push({ id: uid(), start: g('Start'), end: g('End'), reason: g('Reason') });
    }
  }

  const vRows = raw.Events ?? [];
  for (const r of vRows.slice(1)) {
    const g = byHeader(vRows[0], r);
    if (g('Date') && g('Note')) {
      events.push({ id: uid(), date: g('Date'), note: g('Note'), updated_at: now });
    }
  }

  return { entries, vocab: finalVocab, ratingWords, gaps, events, conditionNoun, patientName };
}
