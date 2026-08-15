// The merged vocabulary is the single source of truth. Everything else derives from it:
//   - the tap options in the log form (active items -> ChipDef[])
//   - the medications counted in Stats/Report (active meds WITH a limit -> TrackedMed[])
//   - the medications shown in the Settings bridge card (all active meds -> TrackedMed[])
// Keeping these as pure derivations means the existing consumers (EntryForm, StatsScreen,
// ReportScreen, model.ts) never learned about VocabItem — they still see chips and meds.

import type { ChipDef, ChipType, Entry, TrackedMed, VocabItem } from './types';

/** A stable per-item key: type + case-folded label. Identity is the label itself. */
export function vocabKey(type: ChipType, label: string): string {
  return `${type}:${label.trim().toLowerCase()}`;
}

/** Strip the characters that would corrupt the sheet round-trip: the "; " multi-value separator,
 *  the "→" treatment-outcome marker, and newlines. Collapses the leftover whitespace. Applied
 *  wherever a new or renamed label enters the vocab, so a stored label can never carry a reserved
 *  delimiter (a factor typed "stress; work" would otherwise split into two on the next sync). */
export function sanitizeLabel(s: string): string {
  return s.replace(/[;\n\r→]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Case-insensitive A->Z comparator for vocab labels; the display order for the log form's tap
 *  rows and the Log options manager (seed/insertion order felt random). Alpha is self-explaining
 *  and scales as items are added. The "+ add" chip is appended by ChipRow after the options, so it
 *  stays last regardless. */
export const byLabelAsc = (a: { label: string }, b: { label: string }): number =>
  a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });

/** Tap options for the log form: every non-archived item, sorted A->Z. The form filters by type,
 *  which preserves this order, so each type row (Symptoms / Treatments / Other factors) is alpha.
 *  Archived items are hidden. */
export function activeChips(vocab: VocabItem[]): ChipDef[] {
  return vocab
    .filter((v) => !v.archived)
    .sort(byLabelAsc)
    .map((v) => ({ label: v.label, type: v.type }));
}

/** Medications counted in Stats/Report: active meds that carry a limit. A med with no limit is a
 *  log-only option, counted nowhere. This is what leaves Stats
 *  unchanged: only a medication carrying a limit surfaces. */
export function statsMeds(vocab: VocabItem[]): TrackedMed[] {
  return vocab
    .filter((v) => !v.archived && v.type === 'medication' && v.limit != null && v.limit > 0)
    .map((v) => ({ name: v.label, limit: v.limit }));
}

/**
 * Build vocab from the legacy separated lists (chips + tracked meds). Each chip becomes an item;
 * a medication's limit is pulled from the matching tracked med by name. A tracked med with no
 * matching chip (an orphan) comes in as its own medication item. Shared by the on-device
 * migration (`ensureVocab`) and backward-compatible sheet recovery (`parseTabs`).
 */
export function vocabFromLegacy(chips: ChipDef[], meds: TrackedMed[]): VocabItem[] {
  const limitByMed = new Map(meds.map((m) => [m.name.trim().toLowerCase(), m.limit]));
  const items: VocabItem[] = chips.map((c) => ({
    label: c.label,
    type: c.type,
    limit: c.type === 'medication' ? (limitByMed.get(c.label.trim().toLowerCase()) ?? null) : null,
    archived: false,
  }));
  const seen = new Set(items.map((i) => vocabKey(i.type, i.label)));
  for (const m of meds) {
    if (!m.name.trim()) continue;
    const key = vocabKey('medication', m.name);
    if (!seen.has(key)) {
      items.push({ label: m.name, type: 'medication', limit: m.limit, archived: false });
      seen.add(key);
    }
  }
  return items;
}

/**
 * The single source of truth for what happens when you add a vocabulary item — used by BOTH add
 * surfaces (the Log options manager and the log form's "+ add") so their rules can never drift.
 * It only reports the situation; each caller renders the response:
 * the manager shows a message on `exists`/`clash`, the log form resolves silently.
 *
 * - `created` — brand-new item; `vocab` is the list with it appended.
 * - `revived` — an archived same-group item is un-archived; `vocab` has it restored. `limit`:
 *    pass a value to set it (manager), or omit (`undefined`) to preserve the archived item's own
 *    limit (the form, which has no limit concept).
 * - `exists`  — an active same-group item already has this name; nothing to create.
 * - `clash`   — a medication and a remedy can't share a name (entries store bare treatment names,
 *    so nothing could tell them apart); `conflict` is the item holding the name.
 */
export type AddResolution =
  | { status: 'created'; vocab: VocabItem[]; item: VocabItem }
  | { status: 'revived'; vocab: VocabItem[]; item: VocabItem }
  | { status: 'exists'; item: VocabItem }
  | { status: 'clash'; conflict: VocabItem };

export function resolveAddItem(
  vocab: VocabItem[],
  type: ChipType,
  rawLabel: string,
  limit?: number | null
): AddResolution {
  const label = sanitizeLabel(rawLabel);
  const lower = label.toLowerCase();
  // Cross-type treatment clash comes first: med <-> remedy names must be unique.
  if (type === 'medication' || type === 'remedy') {
    const conflict = vocab.find(
      (v) =>
        (v.type === 'medication' || v.type === 'remedy') &&
        v.type !== type &&
        v.label.trim().toLowerCase() === lower
    );
    if (conflict) return { status: 'clash', conflict };
  }
  const same = vocab.find((v) => vocabKey(v.type, v.label) === vocabKey(type, label));
  if (same) {
    if (!same.archived) return { status: 'exists', item: same };
    const revivedLimit = limit === undefined ? same.limit : limit;
    const item = { ...same, archived: false, limit: revivedLimit };
    return { status: 'revived', item, vocab: vocab.map((v) => (v === same ? item : v)) };
  }
  const item: VocabItem = { label, type, limit: limit ?? null, archived: false };
  return { status: 'created', item, vocab: [...vocab, item] };
}

/**
 * Add an **archived** item for any label used in entries that the vocab doesn't already cover
 * (an orphan), so history stays consistent and the label is restorable. Orphan symptoms/factors
 * carry their field's type. A treatment attempt has no type, so it's an orphan only when the label
 * is unknown under BOTH treatment types (medication and remedy) — otherwise a logged remedy like
 * Coffee would be wrongly re-added as a medication. A truly-unknown treatment defaults to
 * medication (a one-off medication logged before it was ever added as an option lands here).
 * Returns a new list; never mutates input.
 */
export function reconcileOrphans(vocab: VocabItem[], entries: Entry[]): VocabItem[] {
  const out = [...vocab];
  const seen = new Set(out.map((i) => vocabKey(i.type, i.label)));
  const add = (label: string, type: ChipType) => {
    const l = label.trim();
    if (!l) return;
    const key = vocabKey(type, l);
    if (seen.has(key)) return;
    out.push({ label: l, type, limit: null, archived: true });
    seen.add(key);
  };
  for (const e of entries) {
    e.symptoms.forEach((s) => add(s, 'symptom'));
    e.factors.forEach((f) => add(f, 'factor'));
    e.treatments.forEach((a) => {
      const l = a.treatment.trim();
      if (!l) return;
      // Known as either a medication or a remedy? Then it's not an orphan.
      if (seen.has(vocabKey('medication', l)) || seen.has(vocabKey('remedy', l))) return;
      add(l, 'medication');
    });
  }
  return out;
}

/**
 * Self-healing cleanup for an old orphan-scan bug: remedies logged as treatments
 * were wrongly re-added as archived medications. Drop any archived item whose label also exists as
 * a NON-archived item (a cross-type duplicate). A genuine archived orphan has no
 * active twin, so it survives. Idempotent. Returns a new list.
 */
export function repairVocab(vocab: VocabItem[]): VocabItem[] {
  const active = new Set(
    vocab.filter((v) => !v.archived).map((v) => v.label.trim().toLowerCase())
  );
  return vocab.filter((v) => !(v.archived && active.has(v.label.trim().toLowerCase())));
}

/** Active watched factors, for Stats' with/without monthly split. Order: alphabetical. */
export function watchedFactors(vocab: VocabItem[]): string[] {
  return vocab
    .filter((v) => !v.archived && v.type === 'factor' && v.watched)
    .map((v) => v.label)
    .sort((a, b) => a.localeCompare(b));
}
