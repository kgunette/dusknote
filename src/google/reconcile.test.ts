import { describe, it, expect } from 'vitest';
import {
  mergeEntries,
  mergeEventsByContent,
  mergeGapsByContent,
  guardPush,
} from './reconcile';
import type { Entry, Gap, MedEvent } from '../types';
import type { SyncSnapshot } from './serialize';

// ---- factories ----

function entry(id: string, updated_at: string, over: Partial<Entry> = {}): Entry {
  return {
    id,
    date: '2026-08-10',
    start_time: '09:00',
    rating: 3,
    symptoms: [],
    treatments: [],
    factors: [],
    notes: '',
    source: 'normal',
    deleted: false,
    logged_at: updated_at,
    updated_at,
    ...over,
  };
}

function event(id: string, date: string, note: string): MedEvent {
  return { id, date, note, updated_at: `${date}T00:00:00.000Z` };
}

function gap(id: string, start: string, end: string, reason: string): Gap {
  return { id, start, end, reason };
}

function snapshot(over: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    entries: [],
    vocab: [],
    ratingWords: [],
    gaps: [],
    events: [],
    conditionNoun: 'episode',
    patientName: '',
    ...over,
  };
}

const ids = (es: Entry[]) => es.map((e) => e.id).sort();

// ---- mergeEntries ----

describe('mergeEntries', () => {
  it('the recovery case: a phone with one new entry plus a full sheet keeps everything', () => {
    // This is the exact data-loss scenario. Old behavior overwrote the sheet with the one entry.
    const local = [entry('new', '2026-08-10T09:00:00.000Z')];
    const remote = [
      entry('h1', '2024-01-01T00:00:00.000Z'),
      entry('h2', '2024-02-01T00:00:00.000Z'),
      entry('h3', '2024-03-01T00:00:00.000Z'),
    ];
    expect(ids(mergeEntries(local, remote))).toEqual(['h1', 'h2', 'h3', 'new']);
  });

  it('keeps the newer version when the same id differs (remote newer)', () => {
    const local = [entry('x', '2026-01-01T00:00:00.000Z', { rating: 1 })];
    const remote = [entry('x', '2026-06-01T00:00:00.000Z', { rating: 5 })];
    const merged = mergeEntries(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].rating).toBe(5);
  });

  it('keeps the newer version when the same id differs (local newer)', () => {
    const local = [entry('x', '2026-06-01T00:00:00.000Z', { rating: 1 })];
    const remote = [entry('x', '2026-01-01T00:00:00.000Z', { rating: 5 })];
    const merged = mergeEntries(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].rating).toBe(1);
  });

  it('keeps local on an exact timestamp tie', () => {
    const local = [entry('x', '2026-06-01T00:00:00.000Z', { notes: 'local' })];
    const remote = [entry('x', '2026-06-01T00:00:00.000Z', { notes: 'remote' })];
    expect(mergeEntries(local, remote)[0].notes).toBe('local');
  });

  it('a newer local tombstone stays deleted, never resurrected by the sheet', () => {
    const local = [entry('x', '2026-06-01T00:00:00.000Z', { deleted: true })];
    const remote = [entry('x', '2026-01-01T00:00:00.000Z', { deleted: false })];
    const merged = mergeEntries(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].deleted).toBe(true);
  });

  it('a sheet edit newer than a local delete wins (edit-after-delete)', () => {
    const local = [entry('x', '2026-01-01T00:00:00.000Z', { deleted: true })];
    const remote = [entry('x', '2026-06-01T00:00:00.000Z', { deleted: false })];
    expect(mergeEntries(local, remote)[0].deleted).toBe(false);
  });

  it('treats a missing updated_at as oldest, so it never spuriously wins', () => {
    const local = [entry('x', '', { notes: 'no-stamp' })];
    const remote = [entry('x', '2020-01-01T00:00:00.000Z', { notes: 'stamped' })];
    expect(mergeEntries(local, remote)[0].notes).toBe('stamped');
  });
});

// ---- events and gaps (content-keyed, no id in the sheet) ----

describe('mergeEventsByContent', () => {
  it('adds all remote events to an empty local list', () => {
    const remote = [event('r1', '2026-05-01', 'Neurology'), event('r2', '2026-06-01', 'MRI')];
    expect(mergeEventsByContent([], remote)).toHaveLength(2);
  });

  it('does not duplicate an event whose content already exists locally', () => {
    const local = [event('l1', '2026-05-01', 'Neurology')];
    const remote = [event('r1', '2026-05-01', 'Neurology'), event('r2', '2026-06-01', 'MRI')];
    const merged = mergeEventsByContent(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.map((v) => v.note).sort()).toEqual(['MRI', 'Neurology']);
  });
});

describe('mergeGapsByContent', () => {
  it('adds distinct gaps and skips duplicates by content', () => {
    const local = [gap('l1', '2026-05-01', '2026-05-05', 'travel')];
    const remote = [
      gap('r1', '2026-05-01', '2026-05-05', 'travel'), // dup
      gap('r2', '2026-07-01', '2026-07-03', 'sick'),
    ];
    const merged = mergeGapsByContent(local, remote);
    expect(merged).toHaveLength(2);
  });
});

// ---- guardPush ----

describe('guardPush', () => {
  it('blocks the eviction catastrophe: an empty phone must not push over a full sheet', () => {
    const local = snapshot(); // database evicted: nothing local
    const remote = snapshot({
      entries: [entry('h1', '2024-01-01T00:00:00.000Z'), entry('h2', '2024-02-01T00:00:00.000Z')],
    });
    const result = guardPush(local, remote, []);
    expect(result.safe).toBe(false);
    expect(result.droppedEntryIds.sort()).toEqual(['h1', 'h2']);
  });

  it('allows a push that holds everything the sheet has', () => {
    const es = [entry('a', '2026-01-01T00:00:00.000Z'), entry('b', '2026-02-01T00:00:00.000Z')];
    const local = snapshot({ entries: es });
    const remote = snapshot({ entries: es });
    expect(guardPush(local, remote, []).safe).toBe(true);
  });

  it('allows dropping a record the user actually deleted (a tombstone, not a loss)', () => {
    const local = snapshot({ entries: [entry('a', '2026-02-01T00:00:00.000Z')] });
    const remote = snapshot({
      entries: [entry('a', '2026-02-01T00:00:00.000Z'), entry('b', '2026-01-01T00:00:00.000Z')],
    });
    // 'b' is gone from local because it was deleted; the tombstone makes the drop intentional.
    const result = guardPush(local, remote, ['b']);
    expect(result.safe).toBe(true);
    expect(result.droppedEntryIds).toEqual([]);
  });

  it('blocks dropping a record the phone never knew about (no tombstone for it)', () => {
    const local = snapshot({ entries: [entry('a', '2026-02-01T00:00:00.000Z')] });
    const remote = snapshot({
      entries: [entry('a', '2026-02-01T00:00:00.000Z'), entry('b', '2026-01-01T00:00:00.000Z')],
    });
    const result = guardPush(local, remote, []); // no tombstone for 'b'
    expect(result.safe).toBe(false);
    expect(result.droppedEntryIds).toEqual(['b']);
  });

  it('flags an events shrink as unsafe', () => {
    const local = snapshot({ events: [event('l1', '2026-05-01', 'Neurology')] });
    const remote = snapshot({
      events: [event('r1', '2026-05-01', 'Neurology'), event('r2', '2026-06-01', 'MRI')],
    });
    expect(guardPush(local, remote, []).eventsWouldShrink).toBe(true);
    expect(guardPush(local, remote, []).safe).toBe(false);
  });

  it('flags a gaps shrink as unsafe', () => {
    const local = snapshot();
    const remote = snapshot({ gaps: [gap('r1', '2026-07-01', '2026-07-03', 'sick')] });
    expect(guardPush(local, remote, []).gapsWouldShrink).toBe(true);
  });
});
