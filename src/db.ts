import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChipDef, Entry, Gap, MedEvent, TrackedMed, VocabItem } from './types';
import { SEED_CHIPS, RATING_WORDS } from './seeds';
import { setConditionNoun } from './config';
import { reconcileOrphans, repairVocab, vocabFromLegacy } from './vocab';
import { mergeEntries, mergeEventsByContent, mergeGapsByContent } from './google/reconcile';

interface AppDB extends DBSchema {
  entries: { key: string; value: Entry; indexes: { 'by-date': string } };
  prefs: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

function db(): Promise<IDBPDatabase<AppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>('dusknote', 1, {
      upgrade(d) {
        const store = d.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('by-date', 'date');
        d.createObjectStore('prefs');
      },
    });
  }
  return dbPromise;
}

/** Non-deleted entries, newest first. */
export async function listEntries(): Promise<Entry[]> {
  const all = await (await db()).getAll('entries');
  return all
    .filter((e) => !e.deleted)
    .sort((a, b) => (b.date + b.start_time).localeCompare(a.date + a.start_time));
}

export async function putEntry(entry: Entry): Promise<void> {
  await (await db()).put('entries', { ...entry, updated_at: new Date().toISOString() });
}

/** Delete = tombstone, so sync can carry the delete to the sheet. */
export async function tombstoneEntry(id: string): Promise<void> {
  const d = await db();
  const e = await d.get('entries', id);
  if (e) await d.put('entries', { ...e, deleted: true, updated_at: new Date().toISOString() });
}

/** Ids of entries the user has deleted (tombstones). The push guard uses these to tell an
 *  intentional deletion from a record that vanished, so a real delete never trips the guard. */
export async function tombstoneEntryIds(): Promise<string[]> {
  const all = await (await db()).getAll('entries');
  return all.filter((e) => e.deleted).map((e) => e.id);
}

/**
 * New-phone recovery: replace local data with what came back from the sheet. Only called on a
 * device with an empty local store, so the clear is a no-op in practice but keeps it clean.
 * Vocab only overwrites when the sheet actually had some, so seed defaults survive an empty tab.
 */
export async function importSnapshot(data: {
  entries: Entry[];
  vocab: VocabItem[];
  gaps: Gap[];
  events: MedEvent[];
  ratingWords: string[];
  conditionNoun?: string;
  patientName?: string;
}): Promise<void> {
  const d = await db();
  const tx = d.transaction('entries', 'readwrite');
  await tx.objectStore('entries').clear();
  for (const e of data.entries) await tx.objectStore('entries').put(e);
  await tx.done;
  if (data.vocab.length) {
    // Recovering from an older sheet can yield vocab (rebuilt from legacy chip/med rows) that
    // lacks archived orphans; re-derive them from the imported entries so a restorable label
    // logged only once survives recovery. repairVocab drops any bogus archived duplicates a
    // not-yet-healed sheet may still carry.
    await prefs.setVocab(repairVocab(reconcileOrphans(data.vocab, data.entries)));
  }
  if (data.ratingWords.length === 5) await prefs.setRatingWords(data.ratingWords);
  await prefs.setGaps(data.gaps);
  await prefs.setEvents(data.events);
  // v7 personalization settings: recover them like the rating words, and update the live
  // runtime noun so the app re-words immediately after a new-phone pull.
  if (data.conditionNoun) {
    await prefs.setConditionNoun(data.conditionNoun);
    setConditionNoun(data.conditionNoun);
  }
  if (data.patientName != null) await prefs.setPatientName(data.patientName);
}

/**
 * Backfill import: MERGE historical entries/events/gaps into the existing local store (never
 * replace). Deduplicated by id, so importing the same file twice is a no-op. Everything in the
 * file is already flagged source: backfilled. Returns how many new items were actually added.
 */
export async function importBackfill(data: {
  entries: Entry[];
  events: MedEvent[];
  gaps: Gap[];
}): Promise<{ entries: number; events: number; gaps: number }> {
  const d = await db();
  const existingIds = new Set((await d.getAllKeys('entries')) as string[]);
  let addedEntries = 0;
  const tx = d.transaction('entries', 'readwrite');
  for (const e of data.entries) {
    if (!existingIds.has(e.id)) {
      await tx.objectStore('entries').put(e);
      addedEntries++;
    }
  }
  await tx.done;

  const curEvents = await prefs.events();
  const evIds = new Set(curEvents.map((e) => e.id));
  const newEvents = data.events.filter((e) => !evIds.has(e.id));
  if (newEvents.length) {
    await prefs.setEvents([...curEvents, ...newEvents].sort((a, b) => b.date.localeCompare(a.date)));
  }

  const curGaps = await prefs.gaps();
  const gapIds = new Set(curGaps.map((g) => g.id));
  const newGaps = data.gaps.filter((g) => !gapIds.has(g.id));
  if (newGaps.length) {
    await prefs.setGaps([...curGaps, ...newGaps].sort((a, b) => b.start.localeCompare(a.start)));
  }

  return { entries: addedEntries, events: newEvents.length, gaps: newGaps.length };
}

/**
 * Reconcile a non-empty device with a sheet that also has data: MERGE rather than replace, so
 * neither side's records are lost. Entries merge by id (newer wins, tombstones honored); events and
 * gaps merge by content (they carry no id in the sheet). The entry write is one atomic transaction.
 * Preferences are adopted from the sheet the same way importSnapshot does, which is what a
 * recovering device wants: its vocabulary, rating words, condition noun, and report name come back.
 */
export async function reconcileMerge(data: {
  entries: Entry[];
  vocab: VocabItem[];
  gaps: Gap[];
  events: MedEvent[];
  ratingWords: string[];
  conditionNoun?: string;
  patientName?: string;
}): Promise<void> {
  const d = await db();
  const localEntries = await d.getAll('entries'); // includes tombstones
  const merged = mergeEntries(localEntries, data.entries);
  const tx = d.transaction('entries', 'readwrite');
  await tx.objectStore('entries').clear();
  for (const e of merged) await tx.objectStore('entries').put(e);
  await tx.done;

  const localEvents = await prefs.events();
  await prefs.setEvents(
    mergeEventsByContent(localEvents, data.events).sort((a, b) => b.date.localeCompare(a.date))
  );
  const localGaps = await prefs.gaps();
  await prefs.setGaps(
    mergeGapsByContent(localGaps, data.gaps).sort((a, b) => b.start.localeCompare(a.start))
  );

  // Preferences come from the sheet when it carries them (same rule as importSnapshot). Orphan
  // vocab is re-derived from the live merged entries, so a label logged once still survives.
  if (data.vocab.length) {
    await prefs.setVocab(repairVocab(reconcileOrphans(data.vocab, merged.filter((e) => !e.deleted))));
  }
  if (data.ratingWords.length === 5) await prefs.setRatingWords(data.ratingWords);
  if (data.conditionNoun) {
    await prefs.setConditionNoun(data.conditionNoun);
    setConditionNoun(data.conditionNoun);
  }
  if (data.patientName != null) await prefs.setPatientName(data.patientName);
}

/**
 * One-time migration to the merged vocab model. Runs when the `vocab` pref is absent:
 * builds vocab from the legacy chips + tracked-meds lists, then adds archived items for any
 * orphan labels found in entries (a medication logged once, before it was ever added as a tap
 * option, lands here). Idempotent — once persisted it
 * just returns the stored list. Additive: it never touches entries.
 */
export async function ensureVocab(): Promise<VocabItem[]> {
  const existing = await prefs.vocab();
  if (Array.isArray(existing)) {
    // Self-heal an old orphan-scan bug: drop any bogus archived duplicates. When something
    // was removed, persist so the corrected vocab re-pushes and rewrites the sheet's Preferences.
    const repaired = repairVocab(existing);
    if (repaired.length !== existing.length) await prefs.setVocab(repaired);
    return repaired;
  }
  const [chips, meds, entries] = await Promise.all([
    prefs.chips(),
    prefs.trackedMeds(),
    listEntries(),
  ]);
  const vocab = reconcileOrphans(vocabFromLegacy(chips, meds), entries);
  await prefs.setVocab(vocab);
  return vocab;
}

/**
 * Rename a vocabulary label across every past entry (entries store the readable word).
 * Rewrites the label in the field its type lives in — symptoms, factors, or treatment names —
 * bumping updated_at on each changed entry so sync carries the rewrite to the sheet. Matching is
 * case-insensitive on the trimmed value, so it also normalizes stray casing. Symptom/factor lists
 * are sets, so a rename that collides within one entry is de-duplicated; treatments are a time
 * sequence and keep every attempt. Tombstoned entries are skipped (they are being deleted).
 * Returns how many entries changed. This is the only operation in the app that mutates entries.
 */
export async function renameLabelInEntries(
  field: 'symptom' | 'factor' | 'treatment',
  oldLabel: string,
  newLabel: string
): Promise<number> {
  const d = await db();
  const all = await d.getAll('entries');
  const old = oldLabel.trim().toLowerCase();
  const now = new Date().toISOString();
  let changed = 0;
  const tx = d.transaction('entries', 'readwrite');
  for (const e of all) {
    if (e.deleted) continue;
    let dirty = false;
    if (field === 'symptom' || field === 'factor') {
      const arr = field === 'symptom' ? e.symptoms : e.factors;
      if (arr.some((v) => v.trim().toLowerCase() === old)) {
        const seen = new Set<string>();
        const next: string[] = [];
        for (const v of arr) {
          const val = v.trim().toLowerCase() === old ? newLabel : v;
          const key = val.trim().toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            next.push(val);
          }
        }
        if (field === 'symptom') e.symptoms = next;
        else e.factors = next;
        dirty = true;
      }
    } else if (e.treatments.some((a) => a.treatment.trim().toLowerCase() === old)) {
      e.treatments = e.treatments.map((a) =>
        a.treatment.trim().toLowerCase() === old ? { ...a, treatment: newLabel } : a
      );
      dirty = true;
    }
    if (dirty) {
      e.updated_at = now;
      await tx.objectStore('entries').put(e);
      changed++;
    }
  }
  await tx.done;
  return changed;
}

async function getPref<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get('prefs', key);
  return v === undefined ? fallback : (v as T);
}

async function setPref(key: string, value: unknown): Promise<void> {
  await (await db()).put('prefs', value, key);
}

export const prefs = {
  /** The merged vocabulary — the source of truth. null until the migration has run
   *  (`ensureVocab`); chips/trackedMeds below are legacy, read only by that migration. */
  vocab: () => getPref<VocabItem[] | null>('vocab', null),
  setVocab: (v: VocabItem[]) => setPref('vocab', v),
  chips: () => getPref<ChipDef[]>('chips', SEED_CHIPS),
  /** The medications watched against a monthly overuse limit. Migrates a legacy single med.
   *  Fresh installs track nothing — no preset medication, no invented limit — until the user
   *  adds their own in Log options. */
  trackedMeds: async (): Promise<TrackedMed[]> => {
    const list = await getPref<TrackedMed[] | null>('trackedMeds', null);
    if (Array.isArray(list)) return list; // includes [] — an explicit "track nothing"
    const legacy = await getPref<TrackedMed | null>('trackedMed', null);
    return legacy && legacy.name ? [legacy] : [];
  },
  /** The editable 1–5 rating words; 0 is always "No episode" and isn't stored here.
   *  Defaults to the seed set until edited; synced to the sheet's Preferences `rating` rows. */
  ratingWords: () => getPref<string[]>('ratingWords', [...RATING_WORDS]),
  setRatingWords: (w: string[]) => setPref('ratingWords', w),
  /** The condition noun ("episode" / "headache" / "flare") — set in Log options, synced. */
  conditionNoun: () => getPref<string>('conditionNoun', 'episode'),
  setConditionNoun: (n: string) => setPref('conditionNoun', n),
  /** The name printed on the report and backup PDFs. Empty = no name line. Synced. */
  patientName: () => getPref<string>('patientName', ''),
  setPatientName: (n: string) => setPref('patientName', n),
  gaps: () => getPref<Gap[]>('gaps', []),
  setGaps: (g: Gap[]) => setPref('gaps', g),
  events: () => getPref<MedEvent[]>('events', []),
  setEvents: (e: MedEvent[]) => setPref('events', e),
  /** Durable mirror of the "signed in on this device" marker. localStorage (where the marker
   *  normally lives) can be evicted by iOS; IndexedDB persists like the entries do, so this lets
   *  the app remember it has connected and silently renew instead of dropping to "Connect". */
  connected: () => getPref<boolean>('connected', false),
  setConnected: (v: boolean) => setPref('connected', v),
  /** Durable "this device has reconciled with the sheet" flag. Co-located with the data in
   *  IndexedDB (not localStorage) on purpose: if the data is ever evicted, this flag is evicted
   *  with it, so the device reconciles again and safely pulls, instead of pushing an empty
   *  snapshot over a full sheet. Re-reconciling is safe because reconcile now merges. */
  reconciled: () => getPref<boolean>('reconciled', false),
  setReconciled: (v: boolean) => setPref('reconciled', v),
};
