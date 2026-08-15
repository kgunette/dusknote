import { useMemo, useState } from 'react';
import './logoptions.css';
import type { ChipType, Entry, VocabItem } from '../types';
import { byLabelAsc, resolveAddItem, sanitizeLabel, vocabKey } from '../vocab';
import { XCircleIcon } from '../components/icons';
import { ModalOverlay } from '../components/ModalOverlay';
import { aNoun, normalizeNoun, noRatingLabel, noun } from '../config';

// D1a: the manager screen + the safe/reversible actions (archive/restore, delete-when-unused,
// add, edit a medication's limit). Rename (rewrites past entries) is D1b; editable rating words
// are D2, so the Rating group isn't here yet. Reached from the Log options card in Settings.

// A function, not a const: the factor explainer embeds the condition noun, which can change
// at runtime (Log options → What you track), so the strings must build per render.
const GROUPS = (): { kind: ChipType; title: string; add: string; explainer?: string }[] => [
  { kind: 'symptom', title: 'Symptoms', add: 'Add symptom' },
  {
    kind: 'medication',
    title: 'Medications',
    add: 'Add medication',
    explainer:
      'Medications (drugs) you take. Only a medication can have a monthly limit, which is what ' +
      'counts it in Stats and Reports. A limit counts the days you used it, not doses: two ' +
      'doses on one day is one day.',
  },
  {
    kind: 'remedy',
    title: 'Remedies',
    add: 'Add remedy',
    explainer: 'Non-drug things you do, like coffee or a hot shower. Never counted in Stats or Reports.',
  },
  {
    kind: 'factor',
    title: 'Other factors',
    add: 'Add factor',
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
  | { action: 'merge'; item: VocabItem; target: VocabItem; newLabel: string; newLimit: number | null };
type Editor =
  | { mode: 'add'; type: ChipType; name: string; limit: string; error: string | null }
  | { mode: 'edit'; item: VocabItem; name: string; limit: string; error: string | null }
  | { mode: 'rating'; level: number; name: string; error: string | null }
  | { mode: 'noun'; name: string; error: string | null };

/** A blank string, or a whole number >= 1, becomes a limit; anything else is "no limit" (null). */
function parseLimit(s: string): number | null {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
}

function entriesWord(n: number): string {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
}

/** The caption under an item: its usage (distinct entries), a med's limit, a factor's watch. */
function subText(item: VocabItem, count: number): string {
  const used = count === 0 ? 'never used' : entriesWord(count);
  if (item.type === 'medication' && count > 0) {
    const lim = item.limit != null ? `Limit ${item.limit} days/mo` : 'No limit';
    return `${lim} · ${used}`;
  }
  if (item.type === 'factor' && item.watched) return `Watching · ${used}`;
  return used;
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
  onRename: (item: VocabItem, newLabel: string, newLimit: number | null, mergeInto: VocabItem | null) => void;
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
    else onRename(confirm.item, confirm.newLabel, confirm.newLimit, confirm.target);
    setConfirm(null);
  }

  // A rename can collide two ways. `merge` = a same-type item already has this name (rename folds
  // the two histories together). `clash` = the OTHER treatment kind already has this name; since
  // entries store bare treatment names, a med and a remedy can't share one, so this is blocked.
  function analyzeName(item: VocabItem, name: string): { merge: VocabItem | null; clash: VocabItem | null } {
    const t = name.trim().toLowerCase();
    const isTreatment = item.type === 'medication' || item.type === 'remedy';
    let merge: VocabItem | null = null;
    let clash: VocabItem | null = null;
    for (const v of vocab) {
      if (v === item || v.label.trim().toLowerCase() !== t) continue;
      if (v.type === item.type) merge = v;
      else if (isTreatment && (v.type === 'medication' || v.type === 'remedy')) clash = v;
    }
    return { merge, clash };
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

    if (editor.mode === 'edit') {
      const name = sanitizeLabel(editor.name); // strip reserved delimiters before the rename rewrites entries
      if (!name) {
        setEditor({ ...editor, error: 'Enter a name.' });
        return;
      }
      const { merge, clash } = analyzeName(editor.item, name);
      if (clash) return; // blocked; the inline amber note already explains why
      const limit = editor.item.type === 'medication' ? parseLimit(editor.limit) : null;
      const renamed = name !== editor.item.label;
      if (!renamed) {
        if (editor.item.type === 'medication') patch(editor.item, { limit }); // limit-only edit
        setEditor(null);
        return;
      }
      if (merge) {
        // A merge folds two histories together and drops an item — get an explicit yes first.
        setConfirm({ action: 'merge', item: editor.item, target: merge, newLabel: name, newLimit: limit });
        setEditor(null);
        return;
      }
      onRename(editor.item, name, limit, null);
      setEditor(null);
      return;
    }

    // add — the manager surfaces the collision messages; the shared resolver holds the rules.
    const label = sanitizeLabel(editor.name); // matches resolveAddItem's own sanitize; catches an all-delimiter input as empty
    if (!label) {
      setEditor({ ...editor, error: 'Enter a name.' });
      return;
    }
    const limit = editor.type === 'medication' ? parseLimit(editor.limit) : null;
    const res = resolveAddItem(vocab, editor.type, label, limit);
    if (res.status === 'clash') {
      setEditor({ ...editor, error: `There’s already a ${res.conflict.type} called “${res.conflict.label}”. Give it a different name.` });
      return;
    }
    if (res.status === 'exists') {
      setEditor({ ...editor, error: 'That’s already an option.' });
      return;
    }
    onVocabChange(res.vocab); // created or revived
    setEditor(null);
  }

  // The amber heads-up shown while editing a name, before Save. Merge and clash take priority
  // over the plain "this rewrites N entries" note.
  function renameNote(ed: Extract<Editor, { mode: 'edit' }>) {
    const nm = ed.name.trim();
    if (nm === '' || nm === ed.item.label) return null;
    const { merge, clash } = analyzeName(ed.item, nm);
    if (clash) {
      return (
        <div className="mgr-warn">
          There’s already a {clash.type} called “{clash.label}”. Pick another name.
        </div>
      );
    }
    if (merge) {
      return (
        <div className="mgr-warn">
          There’s already a {ed.item.type} called “{merge.label}”. Saving merges “{ed.item.label}”
          into “{merge.label}”, keeping that name. You’ll confirm first.
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
    return (
      <div className="mgr-row" key={vocabKey(item.type, item.label)}>
        <div className="mgr-rowmain">
          <div className="mgr-lbl">{item.label}</div>
          <div className="mgr-sub">{subText(item, count)}</div>
        </div>
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
          onClick={() =>
            setEditor({ mode: 'edit', item, name: item.label, limit: item.limit?.toString() ?? '', error: null })
          }
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
          const active = vocab.filter((v) => v.type === group.kind && !v.archived).sort(byLabelAsc);
          const archived = vocab.filter((v) => v.type === group.kind && v.archived).sort(byLabelAsc);
          const drawerOpen = !!openDrawers[group.kind];
          return (
            <div className="mgr-sec" key={group.kind}>
              <div className="mgr-grp">{group.title}</div>
              {group.explainer && <div className="mgr-expl">{group.explainer}</div>}
              {active.length > 0 && <div className="mgr-card">{active.map(renderRow)}</div>}

              {archived.length > 0 && (
                <>
                  <button
                    type="button"
                    className={'mgr-drawer' + (drawerOpen ? ' open' : '')}
                    onClick={() => setOpenDrawers((d) => ({ ...d, [group.kind]: !d[group.kind] }))}
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
                onClick={() => setEditor({ mode: 'add', type: group.kind, name: '', limit: '', error: null })}
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
                : `Merge ${c.item.label} into ${c.target.label}?`;
          const b =
            c.action === 'archive'
              ? 'It won’t appear as an option when you log, but your past entries keep it. You can restore it anytime from the Archived list.'
              : c.action === 'delete'
                ? 'It’s not used in any entries, so nothing is lost.'
                : `“${c.item.label}” (${entriesWord(countFor(c.item))}) and “${c.target.label}” (${entriesWord(countFor(c.target))}) become one, named “${c.target.label}”. Entries logged as “${c.item.label}” will read “${c.target.label}”.${c.target.type === 'medication' ? (c.target.limit != null ? ` The kept medication’s monthly limit of ${c.target.limit} stays.` : ` The kept medication has no monthly limit.`) : ''} This can’t be undone.`;
          const btn = c.action === 'archive' ? 'Archive' : c.action === 'delete' ? 'Delete' : 'Merge';
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
                ? `Add ${editor.type}`
                : editor.mode === 'rating'
                  ? `Rating ${editor.level}`
                  : editor.mode === 'noun'
                    ? 'What you track'
                    : `Edit ${editor.item.type}`}
            </div>
            <input
              type="text"
              className="mgr-input"
              placeholder={editor.mode === 'rating' ? 'Description' : editor.mode === 'noun' ? '' : 'Name'}
              autoFocus
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value, error: null })}
            />
            {(editor.mode === 'add' && editor.type === 'medication') ||
            (editor.mode === 'edit' && editor.item.type === 'medication') ? (
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
                  A monthly limit is what counts this medication in Stats and Reports, and flags
                  months you go over. Leave it blank to keep it a log-only option.
                </div>
              </>
            ) : null}
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
