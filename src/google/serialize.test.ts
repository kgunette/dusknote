import { describe, it, expect } from 'vitest';
import { isEmptySnapshot, type SyncSnapshot } from './serialize';
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
