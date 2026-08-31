import { describe, it, expect } from 'vitest';
import { buildTabs, isEmptySnapshot, parseTabs, type SyncSnapshot } from './serialize';
import { RATING_WORDS } from '../seeds';
import type { Entry } from '../types';

// A minimal, valid snapshot to build cases from.
const emptySnapshot: SyncSnapshot = {
  entries: [],
  vocab: [],
  ratingWords: [],
  gaps: [],
  events: [],
  conditionNoun: 'episode',
  patientName: '',
};

const anEntry: Entry = {
  id: 'e1',
  date: '2026-08-10',
  start_time: '09:00',
  rating: 3,
  symptoms: [],
  treatments: [],
  factors: [],
  notes: '',
  source: 'normal',
  deleted: false,
  logged_at: '2026-08-10T09:00:00.000Z',
  updated_at: '2026-08-10T09:00:00.000Z',
};

// isEmptySnapshot is the exact test the reconcile step uses to decide pull-vs-adopt, so its
// behavior is load-bearing for data safety. These lock in what it means.
describe('isEmptySnapshot', () => {
  it('is true when there are no entries, events, or gaps', () => {
    expect(isEmptySnapshot(emptySnapshot)).toBe(true);
  });

  it('is false when there is an entry', () => {
    expect(isEmptySnapshot({ ...emptySnapshot, entries: [anEntry] })).toBe(false);
  });

  it('is false when there is an event', () => {
    const event = { id: 'v1', date: '2026-08-10', note: 'appt', updated_at: anEntry.updated_at };
    expect(isEmptySnapshot({ ...emptySnapshot, events: [event] })).toBe(false);
  });

  it('is false when there is a gap', () => {
    const gap = { id: 'g1', start: '2026-08-01', end: '2026-08-05', reason: 'travel' };
    expect(isEmptySnapshot({ ...emptySnapshot, gaps: [gap] })).toBe(false);
  });
});

// The pull path reads the Preferences tab through the same reader the import uses, then fills
// its own defaults in on top. A phone being restored has nothing of its own to keep, so anything
// the tab leaves out has to come back as the app's default. (The import wants the opposite, and
// gets it by reading the tab directly; see importCsv.test.ts.)
describe('parseTabs fills the pull path defaults', () => {
  const prefTab = (rows: string[][]) => [
    ['Kind', 'Label', 'Type', 'Limit', 'Archived', 'Watched'],
    ...rows,
  ];

  it('keeps the default rating words when the tab names none', () => {
    const s = parseTabs({ Preferences: prefTab([['item', 'Coffee', 'remedy', '', '', '']]) });
    expect(s.ratingWords).toEqual([...RATING_WORDS]);
  });

  it('overrides only the levels the tab names', () => {
    const s = parseTabs({ Preferences: prefTab([['rating', 'Worst', '5', '', '', '']]) });
    expect(s.ratingWords[4]).toBe('Worst');
    expect(s.ratingWords[0]).toBe(RATING_WORDS[0]);
  });

  it('keeps the default word to track and no report name when the tab has no setting rows', () => {
    const s = parseTabs({ Preferences: prefTab([['item', 'Coffee', 'remedy', '', '', '']]) });
    expect(s.conditionNoun).toBe('episode');
    expect(s.patientName).toBe('');
  });

  it('reads the setting rows when the tab has them', () => {
    const s = parseTabs({
      Preferences: prefTab([
        ['setting', 'headache', 'noun', '', '', ''],
        ['setting', 'A Name', 'name', '', '', ''],
      ]),
    });
    expect(s.conditionNoun).toBe('headache');
    expect(s.patientName).toBe('A Name');
  });

  it('keeps a limit only on a medication, and watching only on a factor', () => {
    const s = parseTabs({
      Preferences: prefTab([
        ['item', 'Sumatriptan', 'medication', '10', '', ''],
        ['item', 'Hot shower', 'remedy', '10', '', 'watched'],
        ['item', 'Poor sleep', 'factor', '', '', 'watched'],
      ]),
    });
    expect(s.vocab[0]).toEqual({ label: 'Sumatriptan', type: 'medication', limit: 10, dailyLimit: null, archived: false, watched: false });
    expect(s.vocab[1]).toEqual({ label: 'Hot shower', type: 'remedy', limit: null, dailyLimit: null, archived: false, watched: false });
    expect(s.vocab[2]).toEqual({ label: 'Poor sleep', type: 'factor', limit: null, dailyLimit: null, archived: false, watched: true });
  });

  it('reads an untyped item as a remedy, which only the pull path does', () => {
    const s = parseTabs({ Preferences: prefTab([['item', 'Something', '', '', '', '']]) });
    expect(s.vocab[0].type).toBe('remedy');
  });
});

// ---------------------------------------------------------------------------------------------
// The daily limit (v8, 2026-08-31). It gets its own column and needs no migration of its own:
// a sheet written before v8 has no such column, which states nothing and reads as null.
// ---------------------------------------------------------------------------------------------

describe('the daily limit column', () => {
  /** Round-trip a snapshot through the writer and back, the way a real backup and pull would. */
  const roundTrip = (s: SyncSnapshot): SyncSnapshot => {
    const tabs = buildTabs(s);
    const byTitle: Record<string, string[][]> = {};
    for (const t of tabs) byTitle[t.title] = t.values;
    return parseTabs(byTitle);
  };

  it('carries a medication with both limits out to the sheet and back unchanged', () => {
    const out = roundTrip({
      ...emptySnapshot,
      vocab: [
        { label: 'Sumatriptan', type: 'medication', limit: 10, dailyLimit: 2, archived: false },
      ],
      ratingWords: [...RATING_WORDS],
    });
    expect(out.vocab[0]).toMatchObject({ label: 'Sumatriptan', limit: 10, dailyLimit: 2 });
  });

  it('writes the column into the header, so a person reading the sheet can see it', () => {
    const prefs = buildTabs(emptySnapshot).find((t) => t.title === 'Preferences');
    expect(prefs?.values[0]).toContain('DailyLimit');
  });

  it('keeps a daily limit off anything that is not a medication', () => {
    const out = roundTrip({
      ...emptySnapshot,
      vocab: [{ label: 'Hot shower', type: 'remedy', limit: null, dailyLimit: 3, archived: false }],
      ratingWords: [...RATING_WORDS],
    });
    expect(out.vocab[0].dailyLimit).toBeNull();
  });

  it('reads a sheet written BEFORE this column existed, which is why nobody has to do anything', () => {
    // A pre-v8 Preferences tab: six columns, no DailyLimit. Every sheet in the world is one of
    // these until its device next backs up. The absent column states nothing, so it reads as null
    // and the monthly limit is untouched.
    const s = parseTabs({
      Preferences: [
        ['Kind', 'Label', 'Type', 'Limit', 'Archived', 'Watched'],
        ['item', 'Sumatriptan', 'medication', '10', '', ''],
      ],
    });
    expect(s.vocab[0]).toMatchObject({ label: 'Sumatriptan', limit: 10, dailyLimit: null });
  });

  it('ignores a daily limit that is not a whole number of at least one', () => {
    const s = parseTabs({
      Preferences: [
        ['Kind', 'Label', 'Type', 'Limit', 'Archived', 'Watched', 'DailyLimit'],
        ['item', 'Ibuprofen', 'medication', '', '', '', 'lots'],
        ['item', 'Naproxen', 'medication', '', '', '', '0'],
      ],
    });
    expect(s.vocab[0].dailyLimit).toBeNull();
    expect(s.vocab[1].dailyLimit).toBeNull();
  });
});
