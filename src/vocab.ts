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

/** A treatment is ONE kind of thing with a mark on it (2026-08-31), not two kinds. The stored type
 *  is 'treatment' either way; `medication` says which of them are drugs. Kept as a named helper
 *  because the intent reads better than the comparison does at each call site. */
export function isTreatmentType(t: ChipType): boolean {
  return t === 'treatment';
}

/** Is this option a marked medication? The one question `statsMeds`, the limits and the pill all
 *  ask. A mark on anything that is not a treatment is meaningless and never set. */
export function isMedication(v: VocabItem): boolean {
  return v.type === 'treatment' && !!v.medication;
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

/** The item a new label would collide with. Identity is the type plus the folded label, so the
 *  same word can be a symptom and a factor at once and those stay two options. Treatments need no
 *  special case any more: there is one treatment type, so one Coffee, and marking it is an edit
 *  rather than a second item you are refused. */
export function findTreatmentOrItem(
  vocab: VocabItem[],
  type: ChipType,
  label: string
): VocabItem | null {
  return vocab.find((v) => vocabKey(v.type, v.label) === vocabKey(type, label)) ?? null;
}

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
    .filter((v) => !v.archived && isMedication(v) && v.limit != null && v.limit > 0)
    .map((v) => ({ name: v.label, limit: v.limit }));
}

/** Daily dose limits, keyed by folded label, for the log form's count. Active medications only:
 *  an archived one is not an option you can log against, and a limit on anything unmarked means
 *  nothing. Kept as its own derivation so the log form never learns about VocabItem, the same way
 *  activeChips and statsMeds keep the other consumers out of it. */
export function dailyLimits(vocab: VocabItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of vocab) {
    if (v.archived || !isMedication(v)) continue;
    if (v.dailyLimit != null && v.dailyLimit > 0) out.set(v.label.trim().toLowerCase(), v.dailyLimit);
  }
  return out;
}

/** A chip as the app stored it BEFORE a treatment became one kind with a mark: its `type` is one
 *  of the old words. Only the legacy readers produce these, which is why the retired vocabulary is
 *  confined to this one shape and the one function below. */
export interface LegacyChip {
  label: string;
  type: string;
}

/** Translate a stored `Type` word, old or new, into the model the app uses now. This is the ONLY
 *  place the retired words are understood, so nothing downstream has to know they existed.
 *  - `medication` (pre-2026-08-31) becomes a marked treatment
 *  - `remedy` (same era) becomes an unmarked one
 *  - anything unrecognized becomes an unmarked treatment, which asserts nothing
 *  A tab or export written before the change keeps loading because of this function. */
export function fromLegacyType(raw: string): { type: ChipType; medication?: boolean } {
  const t = raw.trim().toLowerCase();
  if (t === 'symptom' || t === 'factor') return { type: t };
  if (t === 'medication') return { type: 'treatment', medication: true };
  return { type: 'treatment', medication: false };
}

/**
 * Bring a stored option list onto the current model, in place, on the device.
 *
 * **This is the on-device half of retiring the two type words (2026-08-31), and without it the
 * screens go blank.** The sheet reader translates what it pulls, but a phone that is already set
 * up never pulls: it reads its own IndexedDB, which still holds `type: 'medication'` and
 * `'remedy'`. Those match no group any more, so every treatment would disappear from Log options,
 * from the log form's Treatments row, and from Stats, while the entries mentioning them sat
 * untouched underneath. Caught by loading the old shape into the running app.
 *
 * Lossless by construction: a stored medication comes out marked, with its limit; a stored remedy
 * comes out unmarked. Idempotent, so a list already converted is returned unchanged and nothing
 * re-persists. Returns null when there was nothing to do, so the caller can skip the write.
 */
export function migrateVocabTypes(vocab: VocabItem[]): VocabItem[] | null {
  let changed = false;
  const out = vocab.map((v) => {
    const raw = v.type as string;
    if (raw !== 'medication' && raw !== 'remedy') return v;
    changed = true;
    const { type, medication } = fromLegacyType(raw);
    return { ...v, type, medication, limit: medication ? v.limit : null };
  });
  return changed ? out : null;
}

/**
 * Build vocab from the legacy separated lists (chips + tracked meds). Each chip becomes an item;
 * a medication's limit is pulled from the matching tracked med by name. A tracked med with no
 * matching chip (an orphan) comes in as its own medication item. Shared by the on-device
 * migration (`ensureVocab`) and backward-compatible sheet recovery (`parseTabs`).
 */
export function vocabFromLegacy(chips: LegacyChip[], meds: TrackedMed[]): VocabItem[] {
  const limitByMed = new Map(meds.map((m) => [m.name.trim().toLowerCase(), m.limit]));
  const items: VocabItem[] = chips.map((c) => {
    const { type, medication } = fromLegacyType(c.type);
    return {
      label: c.label,
      type,
      medication,
      limit: medication ? (limitByMed.get(c.label.trim().toLowerCase()) ?? null) : null,
      archived: false,
    };
  });
  const seen = new Set(items.map((i) => vocabKey(i.type, i.label)));
  for (const m of meds) {
    if (!m.name.trim()) continue;
    const key = vocabKey('treatment', m.name);
    if (!seen.has(key)) {
      items.push({ label: m.name, type: 'treatment', medication: true, limit: m.limit, archived: false });
      seen.add(key);
    }
  }
  return items;
}

/**
 * The single source of truth for what happens when you add a vocabulary item, used by BOTH add
 * surfaces (the Log options manager and the log form's "+ add") so their rules can never drift.
 * It only reports the situation; each caller renders the response: the manager shows a message on
 * `exists`, the log form resolves without saying anything.
 *
 * - `created` — brand-new item; `vocab` is the list with it appended.
 * - `revived` — an archived item of the same identity is un-archived; `vocab` has it restored.
 *    What the caller states in `fields` is applied; what it omits is preserved.
 * - `exists`  — an active item already has this name; nothing to create.
 *
 * **`clash` is gone (2026-08-31).** It used to mean a medication and a remedy cannot share a name,
 * which was true and was also the trap: once an entry used the label, the type could not be changed
 * and could not be deleted, so a wrong guess was permanent. With ONE treatments list there is one
 * Coffee and the pill is an edit on it, so the collision it described cannot arise.
 */
export type AddResolution =
  | { status: 'created'; vocab: VocabItem[]; item: VocabItem }
  | { status: 'revived'; vocab: VocabItem[]; item: VocabItem }
  | { status: 'exists'; item: VocabItem };

/** What an add SETS, as opposed to what it preserves. Every field is optional and `undefined`
 *  means "leave whatever the archived item already had" — the rule the limit has always followed.
 *  The Log options add sheet passes all three, because you just filled in a form saying what you
 *  want. The log form's "+ add" passes none, because it has no form and must never quietly strip
 *  the mark or the limits off a medication you archived. */
export interface AddFields {
  /** Treatments only: the pill. */
  medication?: boolean;
  limit?: number | null;
  dailyLimit?: number | null;
}

export function resolveAddItem(
  vocab: VocabItem[],
  type: ChipType,
  rawLabel: string,
  fields: AddFields = {}
): AddResolution {
  const label = sanitizeLabel(rawLabel);
  const same = findTreatmentOrItem(vocab, type, label);
  if (same) {
    if (!same.archived) return { status: 'exists', item: same };
    const item: VocabItem = {
      ...same,
      archived: false,
      medication: fields.medication ?? same.medication,
      limit: fields.limit === undefined ? same.limit : fields.limit,
      dailyLimit: fields.dailyLimit === undefined ? (same.dailyLimit ?? null) : fields.dailyLimit,
    };
    return { status: 'revived', item, vocab: vocab.map((v) => (v === same ? item : v)) };
  }
  const item: VocabItem = {
    label,
    type,
    medication: type === 'treatment' ? (fields.medication ?? false) : undefined,
    limit: fields.limit ?? null,
    dailyLimit: fields.dailyLimit ?? null,
    archived: false,
  };
  return { status: 'created', item, vocab: [...vocab, item] };
}

/** Turn a treatment's pill on or off. Unmarking drops BOTH limits, because a limit only means
 *  anything on a medication, and the edit sheet warns before saving that this is what will happen.
 *  Marking leaves the limits alone (there are none to keep on something that was unmarked).
 *  Returns a new list; never mutates input. */
export function setMedicationMark(
  vocab: VocabItem[],
  item: VocabItem,
  isMedication: boolean
): VocabItem[] {
  if (!isTreatmentType(item.type)) return vocab;
  return vocab.map((v) =>
    v === item
      ? isMedication
        ? { ...v, medication: true }
        : { ...v, medication: false, limit: null, dailyLimit: null }
      : v
  );
}

/** Doses of one treatment recorded on one date, counted across EVERY entry carrying that date
 *  rather than just the one being edited: a day can span more than one entry, so logging twice in a
 *  day with the same medication in both still reads 2. Deleted entries are tombstones and never
 *  count. Case-insensitive, matching how a treatment label is identified everywhere else.
 *  This is what the log form's attempt card reads; nothing in Stats or the report uses it. */
export function dosesOnDate(entries: Entry[], treatment: string, date: string): number {
  const want = treatment.trim().toLowerCase();
  if (!want) return 0;
  let n = 0;
  for (const e of entries) {
    if (e.deleted || e.date !== date) continue;
    for (const a of e.treatments) {
      if (a.treatment.trim().toLowerCase() === want) n++;
    }
  }
  return n;
}

/**
 * Add an item for any label used in entries that the vocab doesn't already cover (an orphan), so
 * history stays consistent and the label is usable again. Orphan symptoms/factors carry their
 * field's type. A treatment attempt has no type, so it's an orphan only when the label is unknown
 * under BOTH treatment types, otherwise a treatment already on the list would be re-added.
 *
 * **A rebuilt treatment arrives UNMARKED (2026-08-31), the way a factor arrives unwatched.** It
 * used to default to medication, which meant the app asserted that Coffee was a drug on no evidence
 * and left no way to take it back. The scan reads words out of your history; it cannot tell a drug
 * from a hot shower, and it should not pretend to. Nobody calls an unwatched factor a wrong guess.
 * Marking a medication is now something a person does on purpose, in one tap, on a list that shows
 * it.
 *
 * Orphans arrive ACTIVE (Karen's call, 2026-08-24, from her own migration). They used to arrive
 * archived, unconditionally, which hid a current daily medication in a drawer beside a one-off
 * from two years ago while the Log screen showed the app's generic starters. The scan cannot tell
 * a current treatment from a retired one; the person can, and archiving what they no longer use is
 * one tap. A wrong guess is now visible instead of hidden, which is the point.
 *
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
    out.push({ label: l, type, limit: null, archived: false });
    seen.add(key);
  };
  for (const e of entries) {
    e.symptoms.forEach((s) => add(s, 'symptom'));
    e.factors.forEach((f) => add(f, 'factor'));
    e.treatments.forEach((a) => {
      const l = a.treatment.trim();
      if (!l) return;
      if (seen.has(vocabKey('treatment', l))) return;
      add(l, 'treatment'); // unmarked: the scan does not get to decide something is a drug
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
