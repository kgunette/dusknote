import { describe, it, expect } from 'vitest';
import {
  dosesOnDate,
  reconcileOrphans,
  resolveAddItem,
  setMedicationMark,
  statsMeds,
} from './vocab';
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

  it('adds a treatment it has never seen UNMARKED, rather than calling it a drug', () => {
    const out = reconcileOrphans([], [entry({ treatments: [{ id: 'a', time: '', treatment: 'Naproxen', helped: null }] })]);
    // 'remedy' is the stored word for an unmarked treatment. The scan reads words out of history
    // and cannot tell a drug from a hot shower, so it no longer asserts one. Marking is a person's
    // job, the way watching a factor is.
    expect(out[0]).toEqual({ label: 'Naproxen', type: 'remedy', limit: null, archived: false });
  });
});

// ---------------------------------------------------------------------------------------------
// Treatments are ONE list with the medications marked (2026-08-31). The stored words stay
// 'medication' and 'remedy' so every existing sheet reads without conversion; the pill IS that
// word. These pin the rules that change and, first, the one that must NOT change.
// ---------------------------------------------------------------------------------------------

describe('what still gets counted', () => {
  // The single most important test in this tier. Stats rows and the report's summary table are
  // built from statsMeds. If marking a medication ever stopped producing type 'medication', a real
  // medication would drop out of both while every other screen looked completely fine.
  it('keeps counting a marked medication that carries a monthly limit', () => {
    const v = [vocab('Sumatriptan', 'medication', { limit: 10 })];
    expect(statsMeds(v)).toEqual([{ name: 'Sumatriptan', limit: 10 }]);
  });

  it('counts an unmarked treatment nowhere, however it was added', () => {
    expect(statsMeds([vocab('Hot shower', 'remedy')])).toEqual([]);
  });

  it('does NOT count a medication whose only limit is a daily one', () => {
    // Deliberate for this tier: the daily limit is read while you log and nowhere else. Both limit
    // captions say where each number shows up, so this is the documented behaviour, not an
    // oversight.
    const v = [vocab('Ibuprofen', 'medication', { dailyLimit: 3 })];
    expect(statsMeds(v)).toEqual([]);
  });

  it('still ignores an archived medication', () => {
    expect(statsMeds([vocab('Rizatriptan', 'medication', { limit: 5, archived: true })])).toEqual([]);
  });
});

describe('one treatments list: adding', () => {
  it('finds an existing treatment whatever its mark, instead of refusing the name', () => {
    // This is the trap that is gone. Adding "Coffee" when Coffee is already a marked medication
    // used to be a clash you could not resolve, because the type had no control and an in-use
    // option cannot be deleted.
    const v = [vocab('Coffee', 'medication')];
    const res = resolveAddItem(v, 'remedy', 'Coffee');
    expect(res.status).toBe('exists');
  });

  it('reviving from the log form keeps the mark and both limits', () => {
    // The log form states no fields, so an archived medication comes back as itself. Quietly
    // stripping the mark and the limits here would be data loss with nothing on screen.
    const archived = vocab('Sumatriptan', 'medication', { limit: 10, dailyLimit: 2, archived: true });
    const res = resolveAddItem([archived], 'remedy', 'Sumatriptan');
    expect(res.status).toBe('revived');
    if (res.status !== 'revived') return;
    expect(res.item).toMatchObject({ type: 'medication', limit: 10, dailyLimit: 2, archived: false });
  });

  it('reviving from the add sheet applies what the form stated', () => {
    const archived = vocab('Coffee', 'medication', { limit: 4, archived: true });
    const res = resolveAddItem([archived], 'remedy', 'Coffee', {
      type: 'remedy',
      limit: null,
      dailyLimit: null,
    });
    expect(res.status).toBe('revived');
    if (res.status !== 'revived') return;
    expect(res.item).toMatchObject({ type: 'remedy', limit: null, dailyLimit: null, archived: false });
  });

  it('keeps symptoms and factors in their own namespaces', () => {
    const res = resolveAddItem([vocab('Nausea', 'symptom')], 'factor', 'Nausea');
    expect(res.status).toBe('created');
  });
});

describe('marking and unmarking', () => {
  it('unmarking drops both limits, which is what the amber note warns about', () => {
    const med = vocab('Sumatriptan', 'medication', { limit: 10, dailyLimit: 2 });
    const out = setMedicationMark([med], med, false);
    expect(out[0]).toMatchObject({ type: 'remedy', limit: null, dailyLimit: null });
  });

  it('marking leaves the rest of the item alone', () => {
    const treat = vocab('Coffee', 'remedy');
    const out = setMedicationMark([treat], treat, true);
    expect(out[0]).toMatchObject({ label: 'Coffee', type: 'medication', archived: false });
  });

  it('never mutates the list it was given', () => {
    const med = vocab('Sumatriptan', 'medication', { limit: 10 });
    const input = [med];
    setMedicationMark(input, med, false);
    expect(input[0].limit).toBe(10);
  });
});

describe('the daily dose count', () => {
  const dose = (treatment: string, time: string) => ({ id: `a-${time}`, time, treatment, helped: null });

  it('counts every dose of that treatment on that date', () => {
    const e = entry({ treatments: [dose('Sumatriptan', '08:30'), dose('Sumatriptan', '14:05')] });
    expect(dosesOnDate([e], 'Sumatriptan', '2026-08-10')).toBe(2);
  });

  it('adds up across entries, because a day can span more than one', () => {
    const a = entry({ id: 'e1', treatments: [dose('Sumatriptan', '08:30')] });
    const b = entry({ id: 'e2', treatments: [dose('Sumatriptan', '20:15')] });
    expect(dosesOnDate([a, b], 'Sumatriptan', '2026-08-10')).toBe(2);
  });

  it('ignores other days, other treatments, and deleted entries', () => {
    const today = entry({ id: 'e1', treatments: [dose('Sumatriptan', '08:30'), dose('Coffee', '09:00')] });
    const otherDay = entry({ id: 'e2', date: '2026-08-09', treatments: [dose('Sumatriptan', '10:00')] });
    const removed = entry({ id: 'e3', deleted: true, treatments: [dose('Sumatriptan', '11:00')] });
    expect(dosesOnDate([today, otherDay, removed], 'Sumatriptan', '2026-08-10')).toBe(1);
  });

  it('matches the label the way everything else does, ignoring case and padding', () => {
    const e = entry({ treatments: [dose('  sumatriptan ', '08:30')] });
    expect(dosesOnDate([e], 'Sumatriptan', '2026-08-10')).toBe(1);
  });
});
