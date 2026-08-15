// The report as a real, selectable-text PDF, rendered with pdfmake in Source Serif. One
// generator serves both the manual "Export PDF" share and the monthly auto-backup (3b).
// Same ReportModel the on-screen preview uses, so the file matches what was on screen.
// White page (prints clean), with a section → month → entry hierarchy.

import pdfMake from 'pdfmake/build/pdfmake';
import { SITE_DISPLAY, nounCap } from '../config';
import { fmtDayShort, fmtTime, shortFactor } from '../lib';
import { sourceSerifVfs } from './fonts/vfs';
import {
  monthCountsParts,
  monthNoDataText,
  type EntryItem,
  type EventItem,
  type MonthSection,
  type ReportModel,
  type ReportOptions,
} from './model';

const INK = '#20211d';
const MUTED = '#6b6b60';
const FAINT = '#727264';
const LINE = '#d8d5c8';
const LINE_SOFT = '#e7e4d8';
const ACCENT = '#4f5640';
const NODATA = '#75756a';
const HAIR = '#e8e5da'; // faint rule between consecutive entries
const SECTION_RULE = '#b9b6a6'; // heavier rule under a section header
const MONTH_RULE = '#e5e2d6'; // lighter rule under a month divider
const CONTENT_W = 532; // LETTER (612pt) minus 40pt margins each side

let registered = false;
function register(): void {
  if (registered) return;
  pdfMake.vfs = sourceSerifVfs;
  pdfMake.fonts = {
    SourceSerif: {
      normal: 'SourceSerif4-Regular.ttf',
      bold: 'SourceSerif4-Semibold.ttf',
      italics: 'SourceSerif4-It.ttf',
      bolditalics: 'SourceSerif4-Semibold.ttf', // unused; fall back to upright semibold
    },
  };
  registered = true;
}

/** Major section header (Monthly counts, Timeline): outranks a month, on a heavier rule. */
function sectionHead(title: string): unknown[] {
  return [
    { text: title, bold: true, fontSize: 13, color: INK, margin: [0, 20, 0, 0] },
    {
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.2, lineColor: SECTION_RULE },
      ],
      margin: [0, 5, 0, 10],
    },
  ];
}

/** Rating key as a compact 0-1-2 · 3-4-5 · — grid in a white box (no fill, printer-friendly). */
function ratingKeyBlock(key: Array<[string, string]>): Record<string, unknown> {
  const item = ([n, w]: [string, string]) => ({
    text: [
      { text: `${n}   `, bold: true, color: INK },
      { text: w, color: '#54544a' },
    ],
    fontSize: 7.5,
    margin: [0, 1.5, 0, 1.5],
  });
  const columns = [key.slice(0, 3), key.slice(3, 6), key.slice(6)].map(
    (group) => ({ stack: group.map(item), width: '*' })
  );
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: 'Rating scale', bold: true, color: INK, fontSize: 8, margin: [0, 0, 0, 5] },
              { columns, columnGap: 12 },
            ],
            margin: [10, 8, 10, 8],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#e2dfd2',
      vLineColor: () => '#e2dfd2',
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 4],
  };
}

function summaryTable(model: ReportModel): Record<string, unknown> {
  const medNames = model.meds.map((m) => m.name);
  const watchedHeads = model.watchedLabels.map((l) => {
    const s = shortFactor(l);
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  const cols = 3 + medNames.length + watchedHeads.length;
  const header = ['Month', `${nounCap()} days`, `${nounCap()} entries`, ...medNames, ...watchedHeads].map((t, i) => ({
    text: t,
    bold: true,
    color: MUTED,
    fontSize: 9,
    alignment: i === 0 ? 'left' : 'center',
  }));

  const body: unknown[][] = [header];
  for (const m of model.months) {
    if (m.status === 'data') {
      body.push([
        { text: m.label, color: INK, fontSize: 9.5 },
        { text: String(m.episodeDays), alignment: 'center', color: INK, fontSize: 9.5 },
        { text: String(m.entryCount), alignment: 'center', color: INK, fontSize: 9.5 },
        // Just the count (no "of limit"); bold when it exceeds the med's monthly limit.
        ...m.medDays.map((d) => ({
          text: String(d.days),
          alignment: 'center',
          color: INK,
          fontSize: 9.5,
          bold: d.limit != null && d.days > d.limit,
        })),
        ...m.breakouts.map((b) => ({
          text: String(b.days),
          alignment: 'center',
          color: INK,
          fontSize: 9.5,
        })),
      ]);
    } else {
      const reason = monthNoDataText(m);
      const spanned = {
        text: reason,
        colSpan: cols - 1,
        italics: true,
        color: NODATA,
        fontSize: 9.5,
      };
      const placeholders = Array.from({ length: cols - 2 }, () => ({}));
      body.push([{ text: m.label, color: NODATA, italics: true, fontSize: 9.5 }, spanned, ...placeholders]);
    }
  }

  return {
    table: { headerRows: 1, widths: ['*', 'auto', 'auto', ...medNames.map(() => 'auto'), ...watchedHeads.map(() => 'auto')], body },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 1 : i === 0 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i === 1 ? LINE : LINE_SOFT),
      paddingTop: () => 4,
      paddingBottom: () => 5,
      paddingLeft: (i: number) => (i === 0 ? 0 : 12),
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 4],
  };
}

/**
 * "What helped": one row per treatment over the report's date range. Mirrors the preview table
 * field-for-field. A caption above states the range and the unit, since this is the only section
 * with no month names or dates of its own, and in print the subtitle carrying the range can be
 * pages away. The "No outcome" column appears only when something is missing.
 */
function outcomesTable(model: ReportModel): Record<string, unknown>[] {
  const anyMissing = model.outcomes.some((t) => t.noOutcome > 0);
  const scope = { text: model.outcomesScope, fontSize: 8, color: MUTED, margin: [0, 0, 0, 7] };
  const heads = ['Treatment', 'Helped', 'Partly', 'No', ...(anyMissing ? ['No outcome'] : [])];
  const header = heads.map((t, i) => ({
    text: t,
    bold: true,
    color: MUTED,
    fontSize: 9,
    alignment: i === 0 ? 'left' : 'center',
  }));

  const cell = (n: number) => ({ text: String(n), alignment: 'center', color: INK, fontSize: 9.5 });
  const body: unknown[][] = [header];
  for (const t of model.outcomes) {
    body.push([
      { text: t.name, color: INK, fontSize: 9.5 },
      cell(t.yes),
      cell(t.partly),
      cell(t.no),
      ...(anyMissing ? [cell(t.noOutcome)] : []),
    ]);
  }

  return [
    scope,
    {
      table: { headerRows: 1, widths: ['*', ...heads.slice(1).map(() => 'auto')], body },
      layout: {
        hLineWidth: (i: number) => (i === 1 ? 1 : i === 0 ? 0 : 0.5),
        vLineWidth: () => 0,
        hLineColor: (i: number) => (i === 1 ? LINE : LINE_SOFT),
        paddingTop: () => 4,
        paddingBottom: () => 5,
        paddingLeft: (i: number) => (i === 0 ? 0 : 12),
        paddingRight: () => 0,
      },
      margin: [0, 0, 0, 4],
    },
  ];
}

function entryBlock(e: EntryItem, options: ReportOptions): Record<string, unknown> {
  const dateStr = fmtDayShort(e.date) + (e.time ? ` · ${fmtTime(e.time)}` : '');
  const sevStr =
    options.ratingMode === 'num'
      ? `  ·  ${e.rating == null ? '—' : e.rating}`
      : `  —  ${e.ratingWord}`;
  const stack: unknown[] = [
    {
      text: [
        { text: dateStr, bold: true, color: INK },
        { text: sevStr, bold: true, color: ACCENT },
      ],
      fontSize: 10.5,
    },
  ];
  const det = (label: string, value: string) => ({
    text: [{ text: `${label}: `, color: FAINT }, { text: value, color: '#54544a' }],
    fontSize: 9.5,
    margin: [0, 1, 0, 0],
  });
  if (options.includeSymptoms && e.symptoms.length) stack.push(det('Symptoms', e.symptoms.join(', ')));
  if (options.includeTreatments && e.treatments.length)
    stack.push({
      stack: [
        { text: 'Treatments:', color: FAINT },
        ...e.treatments.map((line) => ({ text: line, color: '#54544a', margin: [10, 0.5, 0, 0] })),
      ],
      fontSize: 9.5,
      margin: [0, 1, 0, 0],
    });
  if (options.includeFactors && e.factors.length)
    stack.push(det('Other factors', e.factors.join(', ')));
  if (options.includeNotes && e.notes.trim())
    stack.push({
      text: `“${e.notes.trim()}”`,
      italics: true,
      color: '#54544a',
      fontSize: 9.5,
      margin: [0, 1, 0, 0],
    });
  return { stack, margin: [0, 0, 0, 10], unbreakable: true };
}

function eventBlock(v: EventItem): Record<string, unknown> {
  return {
    table: {
      widths: [2, '*'],
      body: [
        [
          { text: '', fillColor: '#8e9a73' },
          {
            stack: [
              { text: `${fmtDayShort(v.date)} — Event`, bold: true, color: ACCENT, fontSize: 10 },
              { text: v.note, color: '#54544a', fontSize: 9.5, margin: [0, 1, 0, 0] },
            ],
            margin: [8, 0, 0, 0],
          },
        ],
      ],
    },
    layout: { defaultBorder: false, paddingTop: () => 0, paddingBottom: () => 0, paddingLeft: () => 0, paddingRight: () => 0 },
    margin: [0, 0, 0, 10],
    unbreakable: true,
  };
}

function hairline(): Record<string, unknown> {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: HAIR }],
    margin: [0, 0, 0, 10],
  };
}

function monthBlock(m: MonthSection, options: ReportOptions): unknown[] {
  const counts = monthCountsParts(m).map((p, i) => ({
    text: (i > 0 ? '  ·  ' : '') + p.text,
    bold: p.over,
    color: p.over ? INK : MUTED,
  }));
  // Label with its count line directly beneath, both left-aligned (never side by side:
  // a right-aligned count line wraps awkwardly once a month carries four segments).
  const out: unknown[] = [
    { text: m.label, bold: true, fontSize: 11.5, color: m.status === 'data' ? INK : NODATA, margin: [0, 14, 0, 0] },
    { text: counts, fontSize: 9, margin: [0, 2, 0, 4] },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: MONTH_RULE }],
      margin: [0, 0, 0, 9],
    },
  ];

  if (m.status !== 'data') {
    out.push({ text: monthNoDataText(m), italics: true, color: NODATA, fontSize: 10 });
    return out;
  }

  // Entries and events with a faint hairline between consecutive items (not before the first).
  m.items.forEach((it, idx) => {
    if (idx > 0) out.push(hairline());
    out.push(it.kind === 'entry' ? entryBlock(it, options) : eventBlock(it));
  });
  if (m.partialGapReasons.length) {
    out.push({
      text: `Partial data: ${m.partialGapReasons.join('; ')}`,
      italics: true,
      color: NODATA,
      fontSize: 9,
      margin: [0, 0, 0, 6],
    });
  }
  return out;
}

function buildDoc(model: ReportModel, options: ReportOptions): Record<string, unknown> {
  const content: unknown[] = [
    { text: `${nounCap()} report`, fontSize: 20, bold: true, color: INK },
    { text: model.subtitle, fontSize: 10.5, color: MUTED, margin: [0, 3, 0, 0] },
  ];

  if (options.summaryTable) {
    content.push(...sectionHead('Monthly counts'));
    content.push(summaryTable(model));
  }
  if (options.includeOutcomes && model.outcomes.length > 0) {
    content.push(...sectionHead('What helped'));
    content.push(...outcomesTable(model));
  }
  if (options.timeline) {
    content.push(...sectionHead('Timeline'));
    // The rating scale explains the timeline's entry numbers and nothing else, so it sits inside
    // the timeline rather than orphaned at the top of the page.
    if (model.showKey) content.push(ratingKeyBlock(model.ratingKey));
    for (const m of model.months) content.push(...monthBlock(m, options));
    if (!model.months.length) {
      content.push({ text: 'No entries in this range.', italics: true, color: NODATA, fontSize: 10, margin: [0, 8, 0, 0] });
    }
  }

  return {
    pageSize: 'LETTER',
    pageMargins: [40, 46, 40, 56],
    defaultStyle: { font: 'SourceSerif', fontSize: 10, color: INK, lineHeight: 1.15 },
    // No page background: a plain white page prints clean (colored fills waste ink / get dropped).
    footer: (currentPage: number, pageCount: number) => ({
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: LINE }] },
        {
          columns: [
            { text: model.preparedLabel, alignment: 'left', fontSize: 8.5, color: FAINT },
            { text: SITE_DISPLAY, alignment: 'center', fontSize: 8.5, color: FAINT },
            { text: `${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 8.5, color: FAINT },
          ],
          margin: [0, 8, 0, 0],
        },
      ],
      margin: [40, 14, 40, 0],
    }),
    content,
  };
}

/** Build the report as a PDF Blob. Works offline (fonts are bundled). */
export function generateReportPdf(model: ReportModel, options: ReportOptions): Promise<Blob> {
  register();
  const doc = buildDoc(model, options);
  return new Promise((resolve) => pdfMake.createPdf(doc).getBlob(resolve));
}
