import { describe, expect, it } from 'vitest';
import { demoSnapshot } from './demo';

// The try-it demo builds its sample data from today's date. These pin the story it tells and
// the one rule it must never break: nothing dated after today.

const ibuprofenDays = (entries: ReturnType<typeof demoSnapshot>['entries'], month: string) =>
  new Set(
    entries
      .filter((e) => e.date.startsWith(month) && e.treatments.some((a) => a.treatment === 'Ibuprofen'))
      .map((e) => e.date)
  ).size;

describe('demoSnapshot', () => {
  it('never dates anything after today', () => {
    for (const day of [1, 2, 15, 28, 31]) {
      const today = new Date(2026, 8, day); // September 2026
      const iso = `2026-09-${String(day).padStart(2, '0')}`;
      const snap = demoSnapshot(today);
      for (const e of snap.entries) expect(e.date <= iso).toBe(true);
      for (const ev of snap.events) expect(ev.date <= iso).toBe(true);
      for (const g of snap.gaps) expect(g.end <= iso).toBe(true);
    }
  });

  it('shows the last three months: entries this month and last, a gap the month before', () => {
    const snap = demoSnapshot(new Date(2026, 8, 30));
    expect(snap.entries.filter((e) => e.date.startsWith('2026-09')).length).toBe(8);
    expect(snap.entries.filter((e) => e.date.startsWith('2026-08')).length).toBe(12);
    expect(snap.gaps.some((g) => g.start.startsWith('2026-07'))).toBe(true);
    expect(snap.events[0]?.date).toBe('2026-09-17');
  });

  it('puts Ibuprofen over its monthly limit last month and under it this month', () => {
    const snap = demoSnapshot(new Date(2026, 8, 30));
    const limit = snap.vocab.find((v) => v.label === 'Ibuprofen')?.limit;
    expect(limit).toBe(10);
    expect(ibuprofenDays(snap.entries, '2026-08')).toBe(12);
    expect(ibuprofenDays(snap.entries, '2026-09')).toBe(3);
  });

  it('crosses a year boundary and a short February', () => {
    const jan = demoSnapshot(new Date(2027, 0, 10));
    expect(jan.entries.some((e) => e.date.startsWith('2026-12'))).toBe(true);
    expect(jan.gaps.some((g) => g.start.startsWith('2026-11'))).toBe(true);
    const mar = demoSnapshot(new Date(2027, 2, 5));
    for (const e of mar.entries.filter((e) => e.date.startsWith('2027-02'))) {
      expect(Number(e.date.slice(-2))).toBeLessThanOrEqual(28);
    }
  });
});
