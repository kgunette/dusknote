// What a Preferences file would change, worked out against what the device already holds.
//
// This module never writes anything. It answers one question: if this file were applied, what
// would be different? The review screen shows that answer and the person decides. Opening a file
// to look at it must leave everything exactly as it was.
//
// The rule, in the person's own words: anything the file has a setting for, it overwrites;
// anything it doesn't have a setting for, nothing changes. Nothing is ever removed. So a setting
// the file never mentions is not compared at all, which is why the parse step reports what the
// file STATES rather than filling in defaults (see importCsv.ts / readPreferenceRows).

import type { ChipType, VocabItem } from './types';
import type { PrefFile, PrefItem } from './importCsv';

/** The Log options screen's own group order, so the review reads in the same sequence as the
 *  screen a person would go and check afterwards. */
const TYPE_ORDER: ChipType[] = ['symptom', 'medication', 'remedy', 'factor'];

/** One difference on an option the person already has. One row on the review screen each: the
 *  risk is each individual change, so an option that changes twice says so twice. */
export type ItemChange =
  | { label: string; type: ChipType; field: 'type'; from: ChipType; to: ChipType }
  | { label: string; type: ChipType; field: 'limit'; from: number | null; to: number | null }
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
  return {
    type,
    // A limit belongs to a medication and nothing else, so a type change away from medication
    // takes the limit with it. That is not a separate decision to approve.
    limit: type === 'medication' ? (states.limit ? file.limit : (existing.limit ?? null)) : null,
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
 * The one pair the app forbids is a medication and a remedy sharing a name (entries store the
 * bare treatment name, with nothing to tell them apart), so a file naming one where the device
 * holds the other is the SAME option changing type. That is the `Coffee: medication -> remedy`
 * case the whole feature exists for.
 *
 * Spelling is never changed by a file. Matching folds case, and the device's own label stands,
 * because changing a label means rewriting it across every past entry, which is what the rename
 * in Log options is for.
 */
export function comparePrefs(file: PrefFile, device: DeviceState): PrefChanges {
  const byKey = new Map<string, VocabItem>();
  const treatmentByLabel = new Map<string, VocabItem>();
  for (const v of device.vocab) {
    byKey.set(`${v.type}:${fold(v.label)}`, v);
    if (v.type === 'medication' || v.type === 'remedy') treatmentByLabel.set(fold(v.label), v);
  }

  const changed: ItemChange[] = [];
  const added: NewItem[] = [];

  for (const item of file.items) {
    const existing =
      byKey.get(`${item.type}:${fold(item.label)}`) ??
      (item.type === 'medication' || item.type === 'remedy'
        ? treatmentByLabel.get(fold(item.label))
        : undefined);

    if (!existing) {
      added.push({
        label: item.label,
        type: item.type,
        archived: file.states.archived ? item.archived : false,
      });
      continue;
    }

    const label = existing.label; // the device's spelling stands
    const next = resolve(existing, item, file.states);
    const type = next.type;
    if (existing.type !== next.type)
      changed.push({ label, type, field: 'type', from: existing.type, to: next.type });
    // Only a medication can carry a limit, and only a factor can be watched, so when a type
    // change is what takes one away it is part of that change rather than its own row.
    if (type === 'medication' && (existing.limit ?? null) !== next.limit)
      changed.push({ label, type, field: 'limit', from: existing.limit ?? null, to: next.limit });
    if (existing.archived !== next.archived)
      changed.push({ label, type, field: 'archived', from: existing.archived, to: next.archived });
    if (type === 'factor' && !!existing.watched !== next.watched)
      changed.push({ label, type, field: 'watched', from: !!existing.watched, to: next.watched });
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
    noun,
    name,
    ratings,
    changed: changed.sort(inScreenOrder),
    added: added.sort(inScreenOrder),
  };
}
