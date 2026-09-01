// CSV import — the one import format, and it is exactly the app's own Google Sheet columns.
// A file is an Entries, Events, or Gaps table (the header row says which). The app never
// reformats a foreign file: conversion happens outside (the setup guide's AI prompt, or any
// spreadsheet app), and this module only verifies and accepts or refuses.
//
// Validation is strict and whole-file: a bad file imports NOTHING. Every error names its
// spreadsheet row and column ("Row 14, Date: …") so the message can be found in a spreadsheet
// app or pasted straight back to an AI assistant for a fix. Because the Google Sheet is a
// wholesale mirror of local state, a rejected import also protects the sheet backup: garbage
// that never merges can never sync.
//
// IDs: rows may carry the sheet's ID column; rows without one get a deterministic id derived
// from their content, so importing the same file twice stays a no-op (merge + dedup by id in
// importBackfill).

import type { ChipType, Entry, Gap, MedEvent } from './types';
import { parseTreatments, readPreferenceRows, splitMulti } from './google/serialize';
import { fromLegacyType, sanitizeLabel } from './vocab';
import { normalizeNoun } from './config';

const MAX_CHARS = 2_000_000; // ~2 MB of text; far beyond any real history
const MAX_ROWS = 20_000;
const MAX_ERRORS_SHOWN = 6;

const ENTRY_COLS = [
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
];
const EVENT_COLS = ['Date', 'Note'];
const GAP_COLS = ['Start', 'End', 'Reason'];
// Every column a Preferences file may carry. Anything else is reported as unknown, so a column
// added to the sheet has to be added here too (DailyLimit and Medication, both 2026-08-31).
const PREF_COLS = ['Kind', 'Label', 'Type', 'Medication', 'Limit', 'Archived', 'Watched', 'DailyLimit'];
/** The type words a file may use. The first three are current; `medication` and `remedy` are the
 *  retired pair, still accepted so a file written before 2026-08-31 keeps importing. Error messages
 *  name only the current three, because telling someone to write a retired word is the thing this
 *  change exists to stop. */
const ITEM_TYPES = ['symptom', 'treatment', 'factor', 'medication', 'remedy'];
const CURRENT_TYPES = 'symptom, treatment, or factor';

/** One Kind=item row, validated: it has a type, so it names an option the app can find. */
export interface PrefItem {
  label: string;
  type: ChipType;
  /** Whether this row says the treatment is a medication: true, false, or **null for "the file
   *  does not say"**. A pre-2026-08-31 row says it through the Type word itself; a current row says
   *  it through the Medication column; a row with `Type=treatment` and no Medication column states
   *  nothing, and the import then leaves the mark alone. */
  medication: boolean | null;
  /** The MONTHLY limit: a whole number >= 1, or null for none. Meaningful only when
   *  `states.limit`. */
  limit: number | null;
  /** The DAILY limit: a whole number >= 1, or null for none. Meaningful only when
   *  `states.dailyLimit`; a file written before that column existed states nothing here. */
  dailyLimit: number | null;
  /** Meaningful only when `states.archived`. */
  archived: boolean;
  /** Meaningful only when `states.watched`. */
  watched: boolean;
}

/** A validated Preferences file: what it states, and which settings it states at all. Anything
 *  the file does not state is left off here, so applying it can leave the device's own setting
 *  standing. Nothing in this shape has been compared to the device yet. */
export interface PrefFile {
  items: PrefItem[];
  /** Which optional columns the file carries. An absent column states nothing for any option. */
  states: {
    limit: boolean;
    archived: boolean;
    watched: boolean;
    dailyLimit: boolean;
    medication: boolean;
  };
  /** Five slots for ratings 1 through 5; null where the file names no word for that level. */
  ratingWords: (string | null)[];
  /** null when the file carries no setting row for it. */
  conditionNoun: string | null;
  patientName: string | null;
}

export interface ImportParse {
  /** null when the file was rejected — nothing may be merged or applied. */
  data:
    | { kind: 'records'; entries: Entry[]; events: MedEvent[]; gaps: Gap[] }
    | { kind: 'preferences'; prefs: PrefFile }
    | null;
  errors: string[];
}

/** Minimal RFC 4180 CSV: quoted fields, "" escapes, CR/LF and bare LF, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop rows that are entirely blank (trailing newlines, spacer lines).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Small deterministic content hash (djb2-xor), so unchanged rows keep the same id across imports. */
function hashId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
  return `csv-${h.toString(36)}-${(seed.length % 1296).toString(36)}`;
}

function detectKind(
  headers: string[]
): { kind: 'entries' | 'events' | 'gaps' | 'preferences'; unknown: string[] } | null {
  const has = (h: string) => headers.includes(h);
  // Preferences first: it is the one file that can change a setting you already have, and its
  // columns share no name with the other three, so nothing else can be mistaken for it.
  if (has('Kind') && has('Label'))
    return { kind: 'preferences', unknown: headers.filter((h) => !PREF_COLS.includes(h)) };
  if (has('Date') && has('Note'))
    return { kind: 'events', unknown: headers.filter((h) => !EVENT_COLS.includes(h)) };
  if (has('Start') && has('End'))
    return { kind: 'gaps', unknown: headers.filter((h) => !GAP_COLS.includes(h)) };
  if (has('Date'))
    return { kind: 'entries', unknown: headers.filter((h) => !ENTRY_COLS.includes(h)) };
  return null;
}

export function parseImportCsv(text: string): ImportParse {
  const fail = (errors: string[]): ImportParse => ({ data: null, errors });

  if (text.length > MAX_CHARS)
    return fail(['This file is too big to import (over 2 MB). Split it and import the parts.']);
  const rows = parseCsv(text);
  if (rows.length < 2)
    return fail(['The file needs a header row plus at least one data row.']);
  if (rows.length - 1 > MAX_ROWS)
    return fail([`Too many rows (over ${MAX_ROWS.toLocaleString()}). Split the file.`]);

  const headers = rows[0].map((h) => h.trim());
  const detected = detectKind(headers);
  if (!detected)
    return fail([
      'Row 1: these column headers don’t match any import type. Expected the columns of your ' +
        'sheet’s Entries tab (Date, Start, Rating, …), Events tab (Date, Note), Gaps tab ' +
        '(Start, End, Reason), or Preferences tab (Kind, Label, Type, …).',
    ]);
  if (detected.unknown.length)
    return fail([
      `Row 1: unrecognized column${detected.unknown.length === 1 ? '' : 's'} ` +
        `${detected.unknown.map((h) => `“${h}”`).join(', ')} for ${
          detected.kind === 'entries'
            ? 'an Entries'
            : detected.kind === 'events'
              ? 'an Events'
              : detected.kind === 'gaps'
                ? 'a Gaps'
                : 'a Preferences'
        } file. Column names must match the sheet exactly.`,
    ]);

  if (detected.kind === 'preferences') return parsePreferences(rows, headers, fail);

  const idx: Record<string, number> = {};
  headers.forEach((h, i) => (idx[h] = i));

  const errors: string[] = [];
  const entries: Entry[] = [];
  const events: MedEvent[] = [];
  const gaps: Gap[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString();

  for (let r = 1; r < rows.length; r++) {
    const rowNum = r + 1; // header is spreadsheet row 1
    const g = (name: string) => (idx[name] != null ? (rows[r][idx[name]] ?? '').trim() : '');
    const err = (col: string, msg: string) => errors.push(`Row ${rowNum}, ${col}: ${msg}`);

    if (detected.kind === 'entries') {
      const date = g('Date');
      if (!validDate(date)) {
        err('Date', `expected a date like 2026-03-05, got “${date || '(blank)'}”.`);
        continue;
      }
      const start = g('Start');
      if (start && !TIME_RE.test(start)) {
        err('Start', `expected a 24-hour time like 08:30, got “${start}”.`);
        continue;
      }
      const ratingRaw = g('Rating');
      let rating: number | null = null;
      if (ratingRaw !== '') {
        const n = Number(ratingRaw);
        if (!Number.isInteger(n) || n < 0 || n > 5) {
          err('Rating', `expected blank or a whole number 0–5, got “${ratingRaw}”.`);
          continue;
        }
        rating = n;
      }
      const source = g('Source');
      if (source && source !== 'normal' && source !== 'backfilled') {
        err('Source', `expected blank, “normal”, or “backfilled”, got “${source}”.`);
        continue;
      }
      const symptoms = g('Symptoms');
      const treatments = g('Treatments');
      const factors = g('Other factors');
      const notes = g('Notes');
      const id =
        g('ID') ||
        hashId(['e', date, start, ratingRaw, symptoms, treatments, factors, notes].join('|'));
      if (seenIds.has(id)) continue; // exact duplicate row inside the file
      seenIds.add(id);
      entries.push({
        id,
        date,
        start_time: start,
        rating,
        symptoms: splitMulti(symptoms),
        treatments: parseTreatments(treatments),
        factors: splitMulti(factors),
        notes,
        source: source === 'normal' ? 'normal' : 'backfilled',
        deleted: false,
        logged_at: g('Logged at') || now,
        updated_at: g('Updated at') || now,
      });
    } else if (detected.kind === 'events') {
      const date = g('Date');
      if (!validDate(date)) {
        err('Date', `expected a date like 2026-03-05, got “${date || '(blank)'}”.`);
        continue;
      }
      const note = g('Note');
      if (!note) {
        err('Note', 'is empty. Every event needs a note.');
        continue;
      }
      const id = hashId(['v', date, note].join('|'));
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      events.push({ id, date, note, updated_at: now });
    } else {
      const start = g('Start');
      const end = g('End');
      if (!validDate(start)) {
        err('Start', `expected a date like 2026-03-05, got “${start || '(blank)'}”.`);
        continue;
      }
      if (!validDate(end)) {
        err('End', `expected a date like 2026-03-05, got “${end || '(blank)'}”.`);
        continue;
      }
      if (end < start) {
        err('End', `${end} is before the Start date ${start}.`);
        continue;
      }
      const reason = g('Reason');
      const id = hashId(['g', start, end, reason].join('|'));
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      gaps.push({ id, start, end, reason });
    }
  }

  if (errors.length) {
    const shown = errors.slice(0, MAX_ERRORS_SHOWN);
    if (errors.length > shown.length)
      shown.push(`…and ${errors.length - shown.length} more problem${errors.length - shown.length === 1 ? '' : 's'}.`);
    shown.push('Nothing was imported. Fix the file and try again. Your AI assistant can help: paste this message.');
    return fail(shown);
  }
  return { data: { kind: 'records', entries, events, gaps }, errors: [] };
}

/** Validate a Preferences table into a PrefFile. Same contract as the rest of this module: any
 *  problem refuses the whole file and names the row, and nothing is compared to the device here.
 *
 *  Type is required on every option row, unlike Limit / Archived / Watched, which may be left
 *  out. An option's identity in this app is its type plus its label, so a row with no type names
 *  nothing the app can find, and a new option would have nowhere to go. */
function parsePreferences(
  rows: string[][],
  headers: string[],
  fail: (errors: string[]) => ImportParse
): ImportParse {
  if (!headers.includes('Type'))
    return fail([
      `Row 1: a Preferences file needs a Type column. It holds each option’s type ` +
        `(${CURRENT_TYPES}), the level for a rating row, and the key for a setting row.`,
    ]);

  const stated = readPreferenceRows(rows);
  const errors: string[] = [];
  const err = (row: number, col: string, msg: string) => errors.push(`Row ${row}, ${col}: ${msg}`);

  const items: PrefItem[] = [];
  const rowByKey = new Map<string, number>(); // type + folded label -> the row that claimed it

  for (const it of stated.items) {
    const label = sanitizeLabel(it.label);
    if (!label) {
      err(it.row, 'Label', `“${it.label}” leaves no name once the characters the app can’t store are removed.`);
      continue;
    }
    const typeRaw = (it.type ?? '').toLowerCase();
    if (!typeRaw) {
      err(it.row, 'Type', `every option needs a type. Expected ${CURRENT_TYPES}.`);
      continue;
    }
    if (!ITEM_TYPES.includes(typeRaw)) {
      err(it.row, 'Type', `expected ${CURRENT_TYPES}, got “${it.type}”.`);
      continue;
    }
    // The retired words normalize here, so everything downstream sees one treatment type. That
    // also retires the old medication-vs-remedy name clash: two rows naming the same treatment
    // now collide on the ordinary duplicate check below, with a clearer message.
    const { type } = fromLegacyType(typeRaw);
    const folded = label.toLowerCase();

    const dupe = rowByKey.get(`${type}:${folded}`);
    if (dupe != null) {
      err(it.row, 'Label', `“${label}” is already listed as a ${type} on row ${dupe}. Each option can appear once.`);
      continue;
    }
    rowByKey.set(`${type}:${folded}`, it.row);
    items.push({
      label,
      type,
      medication: type === 'treatment' ? it.medication : null,
      limit: it.limit,
      dailyLimit: it.dailyLimit,
      archived: it.archived,
      watched: it.watched,
    });
  }

  // Rating words: sanitized the same way a typed one is. A word that sanitizes away states nothing.
  const ratingWords: (string | null)[] = stated.ratingWords.map((w) =>
    w ? sanitizeLabel(w.value) || null : null
  );

  let conditionNoun: string | null = null;
  if (stated.conditionNoun) {
    const n = normalizeNoun(stated.conditionNoun.value);
    if (!n)
      err(
        stated.conditionNoun.row,
        'Label',
        `“${stated.conditionNoun.value}” can’t be used as the word you track. Use letters, spaces or hyphens, up to 24 characters.`
      );
    else conditionNoun = n;
  }

  const patientName = stated.patientName ? sanitizeLabel(stated.patientName.value) || null : null;

  if (errors.length) {
    const shown = errors.slice(0, MAX_ERRORS_SHOWN);
    if (errors.length > shown.length)
      shown.push(
        `…and ${errors.length - shown.length} more problem${errors.length - shown.length === 1 ? '' : 's'}.`
      );
    shown.push('Nothing was changed. Fix the file and try again. Your AI assistant can help: paste this message.');
    return fail(shown);
  }

  return {
    data: {
      kind: 'preferences',
      prefs: { items, states: stated.columns, ratingWords, conditionNoun, patientName },
    },
    errors: [],
  };
}
