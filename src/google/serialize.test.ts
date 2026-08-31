import { describe, it, expect } from 'vitest';
import { isEmptySnapshot, parseTabs, type SyncSnapshot } from './serialize';
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
    expect(s.vocab[0]).toEqual({ label: 'Sumatriptan', type: 'medication', limit: 10, archived: false, watched: false });
    expect(s.vocab[1]).toEqual({ label: 'Hot shower', type: 'remedy', limit: null, archived: false, watched: false });
    expect(s.vocab[2]).toEqual({ label: 'Poor sleep', type: 'factor', limit: null, archived: false, watched: true });
  });

  it('reads an untyped item as a remedy, which only the pull path does', () => {
    const s = parseTabs({ Preferences: prefTab([['item', 'Something', '', '', '', '']]) });
    expect(s.vocab[0].type).toBe('remedy');
  });
});
