// What a Preferences file would change, worked out against what the device already holds, and
// what the result would be.
//
// Both come from ONE pass, deliberately. The review screen promises that what it lists is what
// will happen, so the list and the result must never be worked out by two pieces of code that
// could drift apart. `planPrefsImport` produces both together; `comparePrefs` and `applyPrefs`
// are the two halves of its answer.
//
// Nothing here writes anything or touches storage. Opening a file to look at it must leave
// everything exactly as it was.
//
// The rule, in the person's own words: anything the file has a setting for, it overwrites;
// anything it doesn't have a setting for, nothing changes. Nothing is ever removed. So a setting
// the file never mentions is not compared at all, which is why the parse step reports what the
// file STATES rather than filling in defaults (see importCsv.ts / readPreferenceRows).

import type { ChipType, VocabItem } from './types';
import type { PrefFile, PrefItem } from './importCsv';

/** The Log options screen's own group order, so the review reads in the same sequence as the
 *  screen a person would go and check afterwards. */
const TYPE_ORDER: ChipType[] = ['symptom', 'treatment', 'factor'];

/** One difference on an option the person already has. One row on the review screen each: the
 *  risk is each individual change, so an option that changes twice says so twice. */
export type ItemChange =
  | { label: string; type: ChipType; field: 'type'; from: ChipType; to: ChipType }
  | { label: string; type: ChipType; field: 'medication'; from: boolean; to: boolean }
  | { label: string; type: ChipType; field: 'limit'; from: number | null; to: number | null }
  | { label: string; type: ChipType; field: 'dailyLimit'; from: number | null; to: number | null }
  | { label: string; type: ChipType; field: 'archived'; from: boolean; to: boolean }
  | { label: string; type: ChipType; field: 'watched'; from: boolean; to: boolean };

export interface NewItem {
  label: string;
  type: ChipType;
  /** A file can carry an option that is already archived (your own export does). Worth saying,
   *  or you would look for it on the list you tap every day. */
  archived: boolean;
}

export interface PrefChanges {
  /** The word you track. Its own card, because it rewords every screen in the app. */
  noun: { from: string; to: string } | null;
  /** The name printed on the report. */
  name: { from: string; to: string } | null;
  ratings: { level: number; from: string; to: string }[];
  changed: ItemChange[];
  added: NewItem[];
}

export interface DeviceState {
  vocab: VocabItem[];
  ratingWords: string[];
  conditionNoun: string;
  patientName: string;
}

const fold = (s: string) => s.trim().toLowerCase();

export function isEmptyChanges(c: PrefChanges): boolean {
  return (
    !c.noun && !c.name && c.ratings.length === 0 && c.changed.length === 0 && c.added.length === 0
  );
}

/** What one of the person's options would look like after the file was applied. Only the settings
 *  the file states are taken from it; the rest are the option's own, untouched. */
function resolve(existing: VocabItem, file: PrefItem, states: PrefFile['states']) {
  const type = file.type;
  // The mark follows the same rule as every other setting: a file that states it overwrites, a
  // file that says nothing leaves the device's own answer standing. `null` is "does not say".
  const medication =
    type === 'treatment' ? (file.medication ?? !!existing.medication) : undefined;
  return {
    type,
    medication,
    // A limit belongs to a medication and nothing else, so unmarking one, or changing it into a
    // symptom, takes BOTH limits with it. That is not a separate decision to approve.
    limit: medication ? (states.limit ? file.limit : (existing.limit ?? null)) : null,
    dailyLimit: medication
      ? states.dailyLimit
        ? file.dailyLimit
        : (existing.dailyLimit ?? null)
      : null,
    archived: states.archived ? file.archived : existing.archived,
    // Watching belongs to a factor the same way.
    watched: type === 'factor' ? (states.watched ? file.watched : !!existing.watched) : false,
  };
}

/**
 * Compare a Preferences file with the device.
 *
 * Matching an option: an option's identity in this app is its type plus its label, so the same
 * name may legitimately be a symptom and a factor at once, and those stay two separate options.
 * Treatments are ONE list with the medications marked, so a medication and a remedy can never be
 * two options sharing a name (entries store the bare treatment name, with nothing to tell them
 * apart). A file naming one where the device holds the other is therefore the SAME option, with its
 * mark changing. That is the `Coffee: medication -> remedy` case the whole feature exists for.
 *
 * Spelling is never changed by a file. Matching folds case, and the device's own label stands,
 * because changing a label means rewriting it across every past entry, which is what the rename
 * in Log options is for.
 */
export interface PrefPlan {
  /** What the review screen lists. */
  changes: PrefChanges;
  /** What the device would hold afterwards. Nothing is ever removed from the option list. */
  next: DeviceState;
}

export function planPrefsImport(file: PrefFile, device: DeviceState): PrefPlan {
  const byKey = new Map<string, VocabItem>();
  for (const v of device.vocab) byKey.set(`${v.type}:${fold(v.label)}`, v);

  const changed: ItemChange[] = [];
  const added: NewItem[] = [];
  // The result starts as exactly what the device holds. An option the file never mentions is
  // never touched, and nothing is ever taken out of this list.
  const nextVocab = [...device.vocab];
  const replace = (was: VocabItem, now: VocabItem) => {
    const at = nextVocab.indexOf(was);
    if (at >= 0) nextVocab[at] = now;
  };

  for (const item of file.items) {
    // One treatment type, so the plain key finds it whichever way either side is marked.
    const existing = byKey.get(`${item.type}:${fold(item.label)}`);

    if (!existing) {
      const archived = file.states.archived ? item.archived : false;
      added.push({ label: item.label, type: item.type, archived });
      nextVocab.push({
        label: item.label,
        type: item.type,
        medication: item.type === 'treatment' ? !!item.medication : undefined,
        limit: item.medication && file.states.limit ? item.limit : null,
        dailyLimit: item.medication && file.states.dailyLimit ? item.dailyLimit : null,
        archived,
        watched: item.type === 'factor' && file.states.watched ? item.watched : false,
      });
      continue;
    }

    const label = existing.label; // the device's spelling stands
    const next = resolve(existing, item, file.states);
    const type = next.type;
    if (existing.type !== next.type)
      changed.push({ label, type, field: 'type', from: existing.type, to: next.type });
    // The mark is its own row: it is the change a person most needs to see, and it is the one the
    // whole review screen was built for.
    if (!!existing.medication !== !!next.medication)
      changed.push({
        label,
        type,
        field: 'medication',
        from: !!existing.medication,
        to: !!next.medication,
      });
    // Only a medication can carry a limit, and only a factor can be watched, so when unmarking is
    // what takes one away it is part of that change rather than its own row.
    if (next.medication && (existing.limit ?? null) !== next.limit)
      changed.push({ label, type, field: 'limit', from: existing.limit ?? null, to: next.limit });
    if (next.medication && (existing.dailyLimit ?? null) !== next.dailyLimit)
      changed.push({
        label,
        type,
        field: 'dailyLimit',
        from: existing.dailyLimit ?? null,
        to: next.dailyLimit,
      });
    if (existing.archived !== next.archived)
      changed.push({ label, type, field: 'archived', from: existing.archived, to: next.archived });
    if (type === 'factor' && !!existing.watched !== next.watched)
      changed.push({ label, type, field: 'watched', from: !!existing.watched, to: next.watched });

    replace(existing, { ...existing, ...next });
  }

  const ratings: PrefChanges['ratings'] = [];
  file.ratingWords.forEach((word, i) => {
    if (word != null && word !== device.ratingWords[i])
      ratings.push({ level: i + 1, from: device.ratingWords[i] ?? '', to: word });
  });

  const noun =
    file.conditionNoun != null && file.conditionNoun !== device.conditionNoun
      ? { from: device.conditionNoun, to: file.conditionNoun }
      : null;
  const name =
    file.patientName != null && file.patientName !== device.patientName
      ? { from: device.patientName, to: file.patientName }
      : null;

  const inScreenOrder = (a: { label: string; type: ChipType }, b: { label: string; type: ChipType }) =>
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });

  return {
    changes: {
      noun,
      name,
      ratings,
      changed: changed.sort(inScreenOrder),
      added: added.sort(inScreenOrder),
    },
    next: {
      vocab: nextVocab,
      ratingWords: device.ratingWords.map((w, i) => file.ratingWords[i] ?? w),
      conditionNoun: noun ? noun.to : device.conditionNoun,
      patientName: name ? name.to : device.patientName,
    },
  };
}

/** What the review screen lists. */
export function comparePrefs(file: PrefFile, device: DeviceState): PrefChanges {
  return planPrefsImport(file, device).changes;
}

/** What the device holds once the person presses Apply. Same pass as the list they approved. */
export function applyPrefs(file: PrefFile, device: DeviceState): DeviceState {
  return planPrefsImport(file, device).next;
}
