import { describe, it, expect } from 'vitest';
import { reconcileOrphans } from './vocab';
import type { Entry, VocabItem } from './types';

// The orphan scan is what rebuilds the option list from the words in someone's history when a
// device takes its options from the sheet. It is the guess tier 8.5 exists to shrink, so what it
// produces is worth pinning down.

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  date: '2026-08-10',
  start_time: '09:00',
  rating: 3,
  symptoms: [],
  treatments: [],
  factors: [],
  notes: '',
  source: 'backfilled',
  deleted: false,
  logged_at: '2026-08-10T09:00:00.000Z',
  updated_at: '2026-08-10T09:00:00.000Z',
  ...over,
});

const vocab = (label: string, type: VocabItem['type'], over: Partial<VocabItem> = {}): VocabItem => ({
  label,
  type,
  limit: null,
  archived: false,
  ...over,
});

describe('reconcileOrphans', () => {
  it('adds an unknown label as ACTIVE, not archived', () => {
    const out = reconcileOrphans([], [entry({ symptoms: ['Light sensitivity'] })]);
    expect(out).toEqual([
      { label: 'Light sensitivity', type: 'symptom', limit: null, archived: false },
    ]);
  });

  it('leaves a label it already knows alone', () => {
    const mine = vocab('Coffee', 'remedy');
    const out = reconcileOrphans([mine], [entry({ treatments: [{ id: 'a', time: '', treatment: 'Coffee', helped: null }] })]);
    expect(out).toEqual([mine]);
  });

  it('does not re-add a known remedy as a medication', () => {
    const out = reconcileOrphans(
      [vocab('Coffee', 'remedy')],
      [entry({ treatments: [{ id: 'a', time: '', treatment: 'Coffee', helped: null }] })]
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('remedy');
  });

  it('still guesses medication for a treatment it has never seen', () => {
    const out = reconcileOrphans([], [entry({ treatments: [{ id: 'a', time: '', treatment: 'Naproxen', helped: null }] })]);
    expect(out[0]).toEqual({ label: 'Naproxen', type: 'medication', limit: null, archived: false });
  });
});
