import { useMemo, useState } from 'react';
import './logoptions.css';
import type { ChipType, Entry, VocabItem } from '../types';
import {
  byLabelAsc,
  isTreatmentType,
  resolveAddItem,
  sanitizeLabel,
  setMedicationMark,
  vocabKey,
} from '../vocab';
import { XCircleIcon } from '../components/icons';
import { ModalOverlay } from '../components/ModalOverlay';
import { aNoun, normalizeNoun, noRatingLabel, noun } from '../config';

// D1a: the manager screen + the safe/reversible actions (archive/restore, delete-when-unused,
// add, edit a medication's limit). Rename (rewrites past entries) is D1b; editable rating words
// are D2, so the Rating group isn't here yet. Reached from the Log options card in Settings.

// A function, not a const: the factor explainer embeds the condition noun, which can change
// at runtime (Log options → What you track), so the strings must build per render.
//
// TREATMENTS ARE ONE GROUP (2026-08-31). A medication is a subset of the things you try, not a
// sibling of them, so a group can span more than one stored type: `kinds` is what it shows and
// `addType` is what a new one starts as. The Medications and Remedies groups, with two explainers,
// two add buttons and two archived drawers, are gone. "Treatments" needs no definition; the old
// explainers existed only to separate medication from remedy.
interface Group {
  key: string;
  kinds: ChipType[];
  title: string;
  add: string;
  addType: ChipType;
  explainer?: string;
}

const GROUPS = (): Group[] => [
  { key: 'symptom', kinds: ['symptom'], title: 'Symptoms', add: 'Add symptom', addType: 'symptom' },
  {
    key: 'treatment',
    kinds: ['medication', 'remedy'],
    title: 'Treatments',
    add: 'Add treatment',
    // A new treatment starts UNMARKED, the way a factor starts unwatched. The chip in the sheet
    // is how it becomes a medication.
    addType: 'remedy',
    explainer: 'Tap the pill to mark a medication. Only a medication can have a daily or monthly limit.',
  },
  {
    key: 'factor',
    kinds: ['factor'],
    title: 'Other factors',
    add: 'Add factor',
    addType: 'factor',
    explainer:
      `Things that may have an impact on ${noun()}s, like sleep, weather, or travel. ` +
      'Watch a factor (the eye icon) and your Stats will reflect the split each month of days ' +
      'with and without the factor. Watch as many factors as you like, and watching never ' +
      'changes your entries. Watched stats can also be included on the printable report.',
  },
];

type Confirm =
  | { action: 'archive'; item: VocabItem }
  | { action: 'delete'; item: VocabItem }
  | { action: 'unmark'; item: VocabItem }
  | { action: 'merge'; item: VocabItem; target: VocabItem; newLabel: string; fields: Partial<VocabItem> };

/** What the add/edit sheet is holding. The limits are CHECKBOXES rather than always-present
 *  fields: two fields with two explanations is four blocks of text sitting there before you have
 *  said you want either one. A checked box brings its field, and unchecking puts it away. */
interface TreatmentFields {
  /** The Medication chip. Only a marked treatment can carry a limit. */
  medication: boolean;
  hasLimit: boolean;
  limit: string;
  hasDaily: boolean;
  dailyLimit: string;
}

type Editor =
  | ({ mode: 'add'; group: Group; name: string; error: string | null } & TreatmentFields)
  | ({ mode: 'edit'; item: VocabItem; name: string; error: string | null } & TreatmentFields)
  | { mode: 'rating'; level: number; name: string; error: string | null }
  | { mode: 'noun'; name: string; error: string | null };

/** The stored type an add/edit sheet would save. For a treatment the Medication chip decides it;
 *  every other group has one type and keeps it. */
function editorType(ed: Extract<Editor, { mode: 'add' | 'edit' }>): ChipType {
  const base = ed.mode === 'add' ? ed.group.addType : ed.item.type;
  if (!isTreatmentType(base)) return base;
  return ed.medication ? 'medication' : 'remedy';
}

/** The blank treatment fields an add sheet opens with: nothing marked, no limits, nothing shown. */
const NO_FIELDS: TreatmentFields = {
  medication: false,
  hasLimit: false,
  limit: '',
  hasDaily: false,
  dailyLimit: '',
};

/** The fields an edit sheet opens with. Editing something that already carries a limit opens with
 *  that box checked and its field showing, rather than hiding a setting you already made. */
function fieldsFor(item: VocabItem): TreatmentFields {
  return {
    medication: item.type === 'medication',
    hasLimit: item.limit != null,
    limit: item.limit?.toString() ?? '',
    hasDaily: item.dailyLimit != null,
    dailyLimit: item.dailyLimit?.toString() ?? '',
  };
}

/** A blank string, or a whole number >= 1, becomes a limit; anything else is "no limit" (null). */
function parseLimit(s: string): number | null {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
}

function entriesWord(n: number): string {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
}

/** The caption under an item, in up to two lines. The limits get their own line (Karen,
 *  2026-08-30): a medication carrying both reads "2 a day · 10 days/mo" with "55 entries"
 *  underneath, rather than three facts wrapping wherever the width happens to run out. A treatment
 *  with no limits stays on one line, and so does everything else. */
function subText(item: VocabItem, count: number): { limits: string | null; used: string } {
  const used = count === 0 ? 'never used' : entriesWord(count);
  if (item.type === 'medication') {
    const parts: string[] = [];
    if (item.dailyLimit != null) parts.push(`${item.dailyLimit} a day`);
    if (item.limit != null) parts.push(`${item.limit} days/mo`);
    if (parts.length) return { limits: parts.join(' · '), used };
  }
  if (item.type === 'factor' && item.watched) return { limits: null, used: `Watching · ${used}` };
  return { limits: null, used };
}

export function LogOptionsScreen({
  vocab,
  entries,
  ratingWords,
  conditionNoun,
  onNounChange,
  onVocabChange,
  onRename,
  onRatingWordsChange,
  onClose,
}: {
  vocab: VocabItem[];
  entries: Entry[];
  ratingWords: string[];
  conditionNoun: string;
  onNounChange: (n: string) => void;
  onVocabChange: (v: VocabItem[]) => void;
  onRename: (
    item: VocabItem,
    newLabel: string,
    fields: Partial<VocabItem>,
    mergeInto: VocabItem | null
  ) => void;
  onRatingWordsChange: (words: string[]) => void;
  onClose: () => void;
}) {
  const [openDrawers, setOpenDrawers] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  // Usage = distinct entries that reference a label (symptoms/factors are sets; treatments are
  // de-duplicated per entry so one entry never double-counts).
  const counts = useMemo(() => {
    const sym = new Map<string, number>();
    const fac = new Map<string, number>();
    const tre = new Map<string, number>();
    const bump = (m: Map<string, number>, l: string) => l && m.set(l, (m.get(l) ?? 0) + 1);
    for (const e of entries) {
      new Set(e.symptoms.map((s) => s.trim().toLowerCase())).forEach((l) => bump(sym, l));
      new Set(e.factors.map((f) => f.trim().toLowerCase())).forEach((l) => bump(fac, l));
      new Set(e.treatments.map((a) => a.treatment.trim().toLowerCase())).forEach((l) => bump(tre, l));
    }
    return { symptom: sym, factor: fac, medication: tre, remedy: tre } as Record<ChipType, Map<string, number>>;
  }, [entries]);

  const countFor = (item: VocabItem) => counts[item.type].get(item.label.trim().toLowerCase()) ?? 0;

  const patch = (target: VocabItem, p: Partial<VocabItem>) =>
    onVocabChange(vocab.map((v) => (v === target ? { ...v, ...p } : v)));

  function runConfirm() {
    if (!confirm) return;
    if (confirm.action === 'archive') patch(confirm.item, { archived: true });
    else if (confirm.action === 'delete') onVocabChange(vocab.filter((v) => v !== confirm.item));
    else if (confirm.action === 'unmark') onVocabChange(setMedicationMark(vocab, confirm.item, false));
    else onRename(confirm.item, confirm.newLabel, confirm.fields, confirm.target);
    setConfirm(null);
  }

  /** Tapping the pill on a row. Marking is immediate; unmarking asks first, but ONLY when there is
   *  a limit to lose, because that is the one direction with a consequence. The edit sheet warns
   *  about the same thing in the same words. */
  function togglePill(item: VocabItem) {
    if (item.type === 'medication') {
      if (item.limit != null || item.dailyLimit != null) {
        setConfirm({ action: 'unmark', item });
        return;
      }
      onVocabChange(setMedicationMark(vocab, item, false));
      return;
    }
    onVocabChange(setMedicationMark(vocab, item, true));
  }

  /** A rename can collide one way now: `merge` = another option of the same identity already has
   *  this name, so the rename folds the two histories together. Treatments are ONE namespace, so a
   *  treatment collides with any other treatment whichever way each is marked. The old `clash`
   *  (a medication and a remedy cannot share a name, blocked) is gone with the two categories. */
  function analyzeName(item: VocabItem, name: string): VocabItem | null {
    const t = name.trim().toLowerCase();
    for (const v of vocab) {
      if (v === item || v.label.trim().toLowerCase() !== t) continue;
      if (isTreatmentType(item.type) ? isTreatmentType(v.type) : v.type === item.type) return v;
    }
    return null;
  }

  function saveEditor() {
    if (!editor) return;

    if (editor.mode === 'noun') {
      const n = normalizeNoun(editor.name);
      if (!n) {
        setEditor({ ...editor, error: 'Use a short singular word (letters only), like episode, headache, or flare.' });
        return;
      }
      onNounChange(n);
      setEditor(null);
      return;
    }

    if (editor.mode === 'rating') {
      const name = editor.name.trim();
      if (!name) {
        setEditor({ ...editor, error: 'Enter a description.' });
        return;
      }
      onRatingWordsChange(ratingWords.map((w, i) => (i === editor.level - 1 ? name : w)));
      setEditor(null);
      return;
    }

    // What the sheet would save besides the name: the mark, and each limit only when its box is
    // checked AND the thing is marked a medication. Unchecking a box is how you remove a limit.
    const type = editorType(editor);
    const isMed = type === 'medication';
    const fields: Partial<VocabItem> = {
      type,
      limit: isMed && editor.hasLimit ? parseLimit(editor.limit) : null,
      dailyLimit: isMed && editor.hasDaily ? parseLimit(editor.dailyLimit) : null,
    };

    if (editor.mode === 'edit') {
      const name = sanitizeLabel(editor.name); // strip reserved delimiters before the rename rewrites entries
      if (!name) {
        setEditor({ ...editor, error: 'Enter a name.' });
        return;
      }
      const merge = analyzeName(editor.item, name);
      const renamed = name !== editor.item.label;
      if (!renamed) {
        patch(editor.item, fields); // mark and limits, without touching any entry
        setEditor(null);
        return;
      }
      if (merge) {
        // A merge folds two histories together and drops an item — get an explicit yes first.
        setConfirm({ action: 'merge', item: editor.item, target: merge, newLabel: name, fields });
        setEditor(null);
        return;
      }
      onRename(editor.item, name, fields, null);
      setEditor(null);
      return;
    }

    // add — the manager surfaces the collision message; the shared resolver holds the rules.
    const label = sanitizeLabel(editor.name); // matches resolveAddItem's own sanitize; catches an all-delimiter input as empty
    if (!label) {
      setEditor({ ...editor, error: 'Enter a name.' });
      return;
    }
    const res = resolveAddItem(vocab, type, label, {
      type,
      limit: fields.limit,
      dailyLimit: fields.dailyLimit,
    });
    if (res.status === 'exists') {
      setEditor({ ...editor, error: 'That’s already an option.' });
      return;
    }
    onVocabChange(res.vocab); // created or revived
    setEditor(null);
  }

  /** What "unmarking drops the limits" says in the one place it can happen without you noticing:
   *  the edit sheet, where you turned the chip off and have not saved yet. Names what would
   *  actually go, rather than always claiming both. Row taps ask the same thing in a confirm box. */
  function unmarkNote(ed: Extract<Editor, { mode: 'edit' }>) {
    if (ed.item.type !== 'medication' || ed.medication) return null;
    const had: string[] = [];
    if (ed.item.dailyLimit != null) had.push('daily');
    if (ed.item.limit != null) had.push('monthly');
    if (!had.length) return null;
    const what = had.length === 2 ? 'both limits' : `its ${had[0]} limit`;
    return (
      <div className="mgr-warn">
        Saving without marking {ed.item.label} a medication drops {what}.
      </div>
    );
  }

  /** The amber heads-up shown while editing a NAME, before Save. A merge takes priority over the
   *  plain "this rewrites N entries" note. */
  function renameNote(ed: Extract<Editor, { mode: 'edit' }>) {
    const nm = ed.name.trim();
    if (nm === '' || nm === ed.item.label) return null;
    const merge = analyzeName(ed.item, nm);
    if (merge) {
      return (
        <div className="mgr-warn">
          There’s already {isTreatmentType(ed.item.type) ? 'a treatment' : `a ${ed.item.type}`}{' '}
          called “{merge.label}”. Saving merges “{ed.item.label}” into “{merge.label}”, keeping that
          name. You’ll confirm first.
        </div>
      );
    }
    const c = countFor(ed.item);
    if (c > 0) {
      return (
        <div className="mgr-warn">Saving also renames “{ed.item.label}” across {entriesWord(c)}.</div>
      );
    }
    return null;
  }

  function renderRow(item: VocabItem) {
    const count = countFor(item);
    const { limits, used } = subText(item, count);
    const isMed = item.type === 'medication';
    return (
      <div className="mgr-row" key={vocabKey(item.type, item.label)}>
        <div className="mgr-rowmain">
          <div className="mgr-lbl">{item.label}</div>
          <div className="mgr-sub">
            {limits && (
              <>
                {limits}
                <br />
              </>
            )}
            {used}
          </div>
        </div>
        {isTreatmentType(item.type) && (
          // The pill follows the eye on a factor exactly: an icon button on the row, muted when
          // off and in the app's accent when on, named in the group's explainer.
          <button
            type="button"
            className="mgr-ic"
            aria-pressed={isMed}
            aria-label={`${isMed ? 'Unmark' : 'Mark'} ${item.label} as a medication`}
            style={isMed ? { color: 'var(--accent)' } : undefined}
            onClick={() => togglePill(item)}
          >
            <PillIcon />
          </button>
        )}
        {item.type === 'factor' && (
          <button
            type="button"
            className="mgr-ic"
            aria-pressed={!!item.watched}
            aria-label={`${item.watched ? 'Stop watching' : 'Watch'} ${item.label}`}
            style={item.watched ? { color: 'var(--accent)' } : undefined}
            onClick={() => patch(item, { watched: !item.watched })}
          >
            <EyeIcon />
          </button>
        )}
        <button
          type="button"
          className="mgr-ic"
          aria-label={`Rename ${item.label}`}
          onClick={() => setEditor({ mode: 'edit', item, name: item.label, ...fieldsFor(item), error: null })}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="mgr-ic"
          aria-label={`${count === 0 ? 'Delete' : 'Archive'} ${item.label}`}
          onClick={() => setConfirm({ action: count === 0 ? 'delete' : 'archive', item })}
        >
          {count === 0 ? <XCircleIcon /> : <ArchiveBoxIcon />}
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll">
        <button type="button" className="back-btn" onClick={onClose}>
          ‹ back
        </button>
        <h1 className="screen-title">Log options</h1>
        <div className="mgr-hint">
          Tap the pencil to rename, archive to hide, or delete unused items. A rename updates every
          past entry.
        </div>

        <div className="mgr-sec">
          <div className="mgr-grp">What you track</div>
          <div className="mgr-expl">
            The word for the thing you log. Everything adapts to it: “Log {aNoun()}”, “{noun()}{' '}
            days”, “{noRatingLabel()}”. Use a singular word that pluralizes with an s, like
            episode, headache, or flare.
          </div>
          <div className="mgr-card">
            <div className="mgr-srow">
              <div style={{ flex: 1 }}>
                <span className="mgr-lbl">{conditionNoun}</span>
              </div>
              <button
                type="button"
                className="mgr-ic"
                aria-label="Change what you track"
                onClick={() => setEditor({ mode: 'noun', name: conditionNoun, error: null })}
              >
                <PencilIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="mgr-sec">
          <div className="mgr-grp">Rating</div>
          <div className="mgr-expl">
            Rename Ratings 1–5. A 0 (“{noRatingLabel()}”) is locked, and lets you log symptom-only
            days without counting {aNoun()}.
          </div>
          <div className="mgr-card">
            {[0, 1, 2, 3, 4, 5].map((n) => {
              const label = n === 0 ? noRatingLabel() : ratingWords[n - 1];
              if (n === 0) {
                return (
                  <div className="mgr-srow" key={n}>
                    <span className="mgr-num">0</span>
                    <div style={{ flex: 1 }}>
                      <span className="mgr-lbl">{label}</span>
                    </div>
                    <span className="mgr-ic" aria-label="Locked">
                      <PadlockIcon />
                    </span>
                  </div>
                );
              }
              return (
                <div className="mgr-srow" key={n}>
                  <span className="mgr-num">{n}</span>
                  <div style={{ flex: 1 }}>
                    <span className="mgr-lbl">{label}</span>
                  </div>
                  <button
                    type="button"
                    className="mgr-ic"
                    aria-label={`Rename rating ${n}, ${label}`}
                    onClick={() => setEditor({ mode: 'rating', level: n, name: label, error: null })}
                  >
                    <PencilIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {GROUPS().map((group) => {
          // A group can span more than one stored type: Treatments shows the medications and the
          // unmarked ones together, one alphabetical list, because that is what they are.
          const inGroup = (v: VocabItem) => group.kinds.includes(v.type);
          const active = vocab.filter((v) => inGroup(v) && !v.archived).sort(byLabelAsc);
          const archived = vocab.filter((v) => inGroup(v) && v.archived).sort(byLabelAsc);
          const drawerOpen = !!openDrawers[group.key];
          return (
            <div className="mgr-sec" key={group.key}>
              <div className="mgr-grp">{group.title}</div>
              {group.explainer && <div className="mgr-expl">{group.explainer}</div>}
              {active.length > 0 && <div className="mgr-card">{active.map(renderRow)}</div>}

              {archived.length > 0 && (
                <>
                  <button
                    type="button"
                    className={'mgr-drawer' + (drawerOpen ? ' open' : '')}
                    onClick={() => setOpenDrawers((d) => ({ ...d, [group.key]: !d[group.key] }))}
                  >
                    <ChevronDownIcon /> Archived ({archived.length})
                  </button>
                  {drawerOpen && (
                    <div className="mgr-card">
                      {archived.map((item) => (
                        <div className="mgr-row mgr-arch" key={vocabKey(item.type, item.label)}>
                          <div className="mgr-rowmain">
                            <div className="mgr-lbl">{item.label}</div>
                            <div className="mgr-sub">{entriesWord(countFor(item))}</div>
                          </div>
                          <button
                            type="button"
                            className="mgr-restore"
                            onClick={() => patch(item, { archived: false })}
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <button
                type="button"
                className="mgr-add"
                onClick={() => setEditor({ mode: 'add', group, name: '', ...NO_FIELDS, error: null })}
              >
                <PlusIcon /> {group.add}
              </button>
            </div>
          );
        })}
      </div>

      {confirm &&
        (() => {
          const c = confirm;
          const q =
            c.action === 'archive'
              ? `Archive ${c.item.label}?`
              : c.action === 'delete'
                ? `Delete ${c.item.label}?`
                : c.action === 'unmark'
                  ? `Unmark ${c.item.label} as a medication?`
                  : `Merge ${c.item.label} into ${c.target.label}?`;
          const unmarkLoses = (() => {
            const had: string[] = [];
            if (c.action === 'unmark' && c.item.dailyLimit != null) had.push('daily');
            if (c.action === 'unmark' && c.item.limit != null) had.push('monthly');
            return had.length === 2 ? 'both limits' : `its ${had[0]} limit`;
          })();
          const b =
            c.action === 'archive'
              ? 'It won’t appear as an option when you log, but your past entries keep it. You can restore it anytime from the Archived list.'
              : c.action === 'delete'
                ? 'It’s not used in any entries, so nothing is lost.'
                : c.action === 'unmark'
                  ? `Only a medication can have a limit, so this drops ${unmarkLoses}. Your entries are untouched.`
                  : `“${c.item.label}” (${entriesWord(countFor(c.item))}) and “${c.target.label}” (${entriesWord(countFor(c.target))}) become one, named “${c.target.label}”. Entries logged as “${c.item.label}” will read “${c.target.label}”.${c.target.type === 'medication' ? (c.target.limit != null ? ` The kept medication’s monthly limit of ${c.target.limit} stays.` : ` The kept medication has no monthly limit.`) : ''} This can’t be undone.`;
          const btn =
            c.action === 'archive'
              ? 'Archive'
              : c.action === 'delete'
                ? 'Delete'
                : c.action === 'unmark'
                  ? 'Unmark'
                  : 'Merge';
          return (
            <ModalOverlay labelId="confirm-q" onDismiss={() => setConfirm(null)}>
              <div className="confirm-q" id="confirm-q">{q}</div>
                <div className="confirm-b">{b}</div>
                <div className="mgr-modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" onClick={runConfirm}>
                    {btn}
                  </button>
                </div>
            </ModalOverlay>
          );
        })()}

      {editor && (
        <ModalOverlay labelId="editor-q" onDismiss={() => setEditor(null)}>
            <div className="confirm-q" id="editor-q">
              {editor.mode === 'add'
                ? `Add ${editor.group.addType === 'remedy' ? 'treatment' : editor.group.addType}`
                : editor.mode === 'rating'
                  ? `Rating ${editor.level}`
                  : editor.mode === 'noun'
                    ? 'What you track'
                    : `Edit ${isTreatmentType(editor.item.type) ? 'treatment' : editor.item.type}`}
            </div>
            <input
              type="text"
              className="mgr-input"
              placeholder={editor.mode === 'rating' ? 'Description' : editor.mode === 'noun' ? '' : 'Name'}
              autoFocus
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value, error: null })}
            />
            {(editor.mode === 'add' || editor.mode === 'edit') &&
              isTreatmentType(editor.mode === 'add' ? editor.group.addType : editor.item.type) && (
                <>
                  {/* The mark is a CHIP, the same control you tap when logging and the twin of the
                      pill on the row: it says what this treatment IS. The limits below are
                      checkboxes, because they say what you want counted. Three chips in a row,
                      one a category and two options, read as one undifferentiated set. */}
                  <div className="mgr-chiprow">
                    <button
                      type="button"
                      className={'mgr-medchip' + (editor.medication ? ' on' : '')}
                      aria-pressed={editor.medication}
                      onClick={() =>
                        setEditor({
                          ...editor,
                          medication: !editor.medication,
                          // Unmarking puts the limit boxes and their fields away; marking again
                          // brings back whatever was typed, so a mis-tap costs nothing. The typed
                          // numbers are kept either way, and re-checking follows them: without
                          // this, tapping the chip twice dropped the limits with the amber note
                          // gone too, so nothing on screen said they had been lost.
                          ...(editor.medication
                            ? { hasLimit: false, hasDaily: false }
                            : {
                                hasLimit: editor.limit.trim() !== '',
                                hasDaily: editor.dailyLimit.trim() !== '',
                              }),
                        })
                      }
                    >
                      <PillIcon size={18} />
                      Medication
                    </button>
                  </div>

                  {editor.medication && (
                    <div className="mgr-limitopts">
                      <label className="mgr-opt">
                        <input
                          type="checkbox"
                          checked={editor.hasDaily}
                          onChange={(e) => setEditor({ ...editor, hasDaily: e.target.checked })}
                        />
                        Daily limit
                      </label>
                      <label className="mgr-opt">
                        <input
                          type="checkbox"
                          checked={editor.hasLimit}
                          onChange={(e) => setEditor({ ...editor, hasLimit: e.target.checked })}
                        />
                        Monthly limit
                      </label>
                    </div>
                  )}

                  {/* Nothing is shown before it is asked for. A checked box brings its field and
                      its one line of explanation. The two captions differ in unit AND in place,
                      doses against days and while you log against on review, because drafted as
                      parallel sentences they read as one thing said twice. */}
                  {editor.medication && editor.hasDaily && (
                    <>
                      <label className="mgr-limit-field">
                        <span>Daily limit</span>
                        <input
                          type="number"
                          min={1}
                          placeholder="None"
                          value={editor.dailyLimit}
                          onChange={(e) => setEditor({ ...editor, dailyLimit: e.target.value })}
                          style={{ width: 80 }}
                        />
                      </label>
                      <div className="confirm-b">Doses in one day. The count shows while you log.</div>
                    </>
                  )}
                  {editor.medication && editor.hasLimit && (
                    <>
                      <label className="mgr-limit-field">
                        <span>Monthly limit</span>
                        <input
                          type="number"
                          min={1}
                          placeholder="None"
                          value={editor.limit}
                          onChange={(e) => setEditor({ ...editor, limit: e.target.value })}
                          style={{ width: 80 }}
                        />
                      </label>
                      <div className="confirm-b">
                        Days used in a month, not doses. The count shows in Stats and your report.
                      </div>
                    </>
                  )}
                </>
              )}
            {editor.mode === 'edit' && unmarkNote(editor)}
            {editor.mode === 'edit' && renameNote(editor)}
            {editor.error && <div className="mgr-error" role="alert">{editor.error}</div>}
            <div className="mgr-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveEditor}>
                Save
              </button>
            </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function ArchiveBoxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** The medication mark, drawn exactly as the signed-off mockup draws it: a horizontal capsule with
 *  its divider, on the same 24-box, stroke and caps as the eye it stands beside on a row. */
function PillIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" />
      <path d="M12 8.5v7" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PadlockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L18 10l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}
