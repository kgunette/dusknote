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
 *  v7: Preferences gains Kind=setting rows (the condition noun; the report patient name), 2026-07-23. */
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
  Preferences: ['Kind', 'Label', 'Type', 'Limit', 'Archived', 'Watched'],
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
        ]),
        // rating rows: the level sits in the Type column (Kind=rating, Label=word).
        ...s.ratingWords.map((w, i) => ['rating', w, String(i + 1), '', '', '']),
        // setting rows: the value sits in Label, the setting key in Type (Kind=setting, v7).
        ['setting', s.conditionNoun, 'noun', '', '', ''],
        ...(s.patientName ? [['setting', s.patientName, 'name', '', '', '']] : []),
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

  // Preferences: new format is one row per vocab item (Kind=item). Old backups carry Kind=chip
  // and Kind=med rows; read those too and rebuild vocab from them (accept-old, write-new), so
  // recovery from a pre-Slice-C sheet still works.
  const pRows = raw.Preferences ?? [];
  const vocab: VocabItem[] = [];
  const legacyChips: ChipDef[] = [];
  const legacyMeds: TrackedMed[] = [];
  const ratingWords: string[] = [...RATING_WORDS]; // default; overridden by any Kind=rating rows
  let conditionNoun = 'episode'; // defaults stand unless v7 setting rows say otherwise
  let patientName = '';
  for (const r of pRows.slice(1)) {
    const g = byHeader(pRows[0], r);
    const kind = g('Kind');
    const label = g('Label');
    if (!label) continue;
    const limStr = g('Limit');
    const lim = Number(limStr);
    const limit = limStr !== '' && Number.isFinite(lim) && lim >= 1 ? Math.round(lim) : null;
    if (kind === 'item') {
      const type = (g('Type') as VocabItem['type']) || 'remedy';
      vocab.push({
        label,
        type,
        limit: type === 'medication' ? limit : null,
        archived: g('Archived').trim().toLowerCase() === 'archived',
        // Absent column (pre-v6 sheet) reads as not watched — accept-old, write-new.
        watched: type === 'factor' && g('Watched').trim().toLowerCase() === 'watched',
      });
    } else if (kind === 'rating') {
      const level = Number(g('Type'));
      if (Number.isInteger(level) && level >= 1 && level <= 5) ratingWords[level - 1] = label;
    } else if (kind === 'setting') {
      // v7: Label holds the value, Type the key. Absent rows (pre-v7 sheet) keep defaults.
      if (g('Type') === 'noun') conditionNoun = label;
      else if (g('Type') === 'name') patientName = label;
    } else if (kind === 'chip') {
      legacyChips.push({ label, type: (g('Type') as ChipDef['type']) || 'remedy' });
    } else if (kind === 'med') {
      legacyMeds.push({ name: label, limit });
    }
  }
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
