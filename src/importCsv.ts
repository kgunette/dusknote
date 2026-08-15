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

import type { Entry, Gap, MedEvent } from './types';
import { parseTreatments, splitMulti } from './google/serialize';

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

export interface ImportParse {
  /** null when the file was rejected — nothing may be merged. */
  data: { entries: Entry[]; events: MedEvent[]; gaps: Gap[] } | null;
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
): { kind: 'entries' | 'events' | 'gaps'; unknown: string[] } | null {
  const has = (h: string) => headers.includes(h);
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
        'sheet’s Entries tab (Date, Start, Rating, …), Events tab (Date, Note), or Gaps tab ' +
        '(Start, End, Reason).',
    ]);
  if (detected.unknown.length)
    return fail([
      `Row 1: unrecognized column${detected.unknown.length === 1 ? '' : 's'} ` +
        `${detected.unknown.map((h) => `“${h}”`).join(', ')} for ${
          detected.kind === 'entries' ? 'an Entries' : detected.kind === 'events' ? 'an Events' : 'a Gaps'
        } file. Column names must match the sheet exactly.`,
    ]);

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
  return { data: { entries, events, gaps }, errors: [] };
}
