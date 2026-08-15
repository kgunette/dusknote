// Deciding which spreadsheet a device should use when it connects with no sheet cached yet
// (a new phone, or after storage was evicted). Kept free of network, auth, and storage imports
// so the decision is a pure function the tests can exercise directly.
//
// Context: the drive.file scope only ever surfaces spreadsheets THIS app created, so a Drive
// listing of spreadsheets is exactly "our own sheets and nothing else." A sheet renamed in Drive
// is still one we created, so it still shows up (just not under the name "Dusknote"). Google Drive
// allows several files to share a name, so two "Dusknote" sheets can coexist (split-brain). Those
// two facts are why we can tell a first-time user (zero of our sheets) from a returning one, and
// why "more than one, or one renamed" is a genuine question only the person can answer.

/** One spreadsheet the app created, as shown in the chooser. */
export interface SheetCandidate {
  id: string;
  name: string;
  createdTime: string; // ISO 8601, from Drive
  modifiedTime: string; // ISO 8601, from Drive (tracks the last backup)
  entryCount: number; // saved entries in the sheet, filled in before the chooser renders
}

export type SheetDecision =
  | { kind: 'create' } // nothing of ours exists: a genuine first-time setup
  | { kind: 'adopt'; id: string } // exactly one, named the app name: silent new-phone recovery
  | { kind: 'choose' }; // ambiguous (two or more, or one renamed): the person picks

/**
 * Decide what to do with the app-created spreadsheets found in Drive. Only the count and the names
 * matter here; the richer metadata (entry counts, dates) is gathered later, and only when the answer
 * is "choose". The rule, deliberately conservative: adopt automatically ONLY when there is exactly
 * one sheet and it still carries the app's own name. Anything else is a question, never a guess,
 * because guessing wrong could orphan someone's history.
 */
export function decideSheet(
  candidates: { id: string; name: string }[],
  sheetName: string
): SheetDecision {
  if (candidates.length === 0) return { kind: 'create' };
  if (candidates.length === 1 && candidates[0].name === sheetName) {
    return { kind: 'adopt', id: candidates[0].id };
  }
  return { kind: 'choose' };
}
