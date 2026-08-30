import './importreview.css';
import type { ChipType } from '../types';
import { docUrl } from '../config';
import type { ItemChange, NewItem, PrefChanges } from '../importPrefs';
import { isEmptyChanges } from '../importPrefs';

// What a Preferences file would change, shown before anything changes. Cancel leaves everything
// exactly as it was: opening a file to look at it must never alter anything.
//
// Card order has a method. Things that change something you already have come first, because
// those are what a person might refuse, and within that it follows the order of the Log options
// screen itself, so it reads in the same sequence as the screen you would go and check
// afterwards. New options land last.
//
// No counts in the headings: the risk is each individual change, not how many there are.

/** The external-link glyph, the same mark Settings puts on a link that leaves the app. */
function ExternalLinkIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 5h5v5" />
      <path d="M19 5l-8.5 8.5" />
      <path d="M18.5 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 18V7.5A1.5 1.5 0 0 1 6.5 6H11" />
    </svg>
  );
}

function limitWord(n: number | null): string {
  return n == null ? 'no limit' : `${n} days a month`;
}

/** One change, worded. The screen shows the old value and the new one, never just the new one. */
function moveWords(c: ItemChange): { from: string; to: string } {
  switch (c.field) {
    case 'type':
      return { from: c.from, to: c.to };
    case 'limit':
      return { from: limitWord(c.from), to: limitWord(c.to) };
    case 'archived':
      return { from: c.from ? 'archived' : 'active', to: c.to ? 'archived' : 'active' };
    case 'watched':
      return { from: c.from ? 'watched' : 'not watched', to: c.to ? 'watched' : 'not watched' };
  }
}

/** "Coffee · medication → remedy", with the old value quiet and the new one bold. */
function Move({ from, to }: { from: string; to: string }) {
  return (
    <span className="chg-move">
      {from} <span className="sr-only">changes to</span>
      <span aria-hidden="true">→</span> <span className="chg-to">{to}</span>
    </span>
  );
}

function newItemWords(n: NewItem): string {
  // A file can carry an option that is already archived. Worth saying, or you would go looking
  // for it on the list you tap every day.
  return n.archived ? `${n.type} · archived` : n.type;
}

const isTreatment = (t: ChipType) => t === 'medication' || t === 'remedy';

export function ImportReviewScreen({
  changes,
  fileName,
  onApply,
  onCancel,
}: {
  changes: PrefChanges;
  fileName: string;
  onApply: () => void;
  onCancel: () => void;
}) {
  const empty = isEmptyChanges(changes);

  if (empty) {
    return (
      <div className="screen">
        <div className="scroll">
          <button type="button" className="back-btn" onClick={onCancel}>
            ‹ back
          </button>
          <h1 className="screen-title">Nothing to change</h1>
          <div className="caption" style={{ marginTop: -10 }}>
            From {fileName}
          </div>
          <div className="card col">
            <div>This file matches your log options exactly. Nothing was changed.</div>
          </div>
          <div className="btn-stack">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // The medication note goes under the LAST options card on screen, against the labels it
  // explains, and only when a medication or a remedy is actually in the list.
  const noteOnAdded = changes.added.some((n) => isTreatment(n.type));
  const noteOnChanged =
    !changes.added.length && changes.changed.some((c) => isTreatment(c.type));
  const note = (
    <div className="chg-note">
      A medication can be counted in Stats and your report. A remedy never is.{' '}
      <a
        href={docUrl('using-dusknote.md', '#medication-limits')}
        target="_blank"
        rel="noreferrer"
      >
        How limits work
        <ExternalLinkIcon />
      </a>
    </div>
  );

  return (
    <div className="screen">
      <div className="scroll">
        {/* Capital C: the app uses "‹ back" where nothing is pending and switches to "‹ Cancel"
            the moment leaving would discard something. This screen always has a decision on it. */}
        <button type="button" className="back-btn" onClick={onCancel}>
          ‹ Cancel
        </button>
        <h1 className="screen-title">Review these changes</h1>
        <div className="caption" style={{ marginTop: -10 }}>
          From {fileName}
        </div>

        {changes.noun && (
          <div className="card col">
            <div className="card-title">The word you track</div>
            <div>
              <div className="chg-row">
                <Move from={changes.noun.from} to={changes.noun.to} />
              </div>
            </div>
            <div className="caption">This changes the wording everywhere in the app.</div>
          </div>
        )}

        {changes.name && (
          <div className="card col">
            <div className="card-title">The name on your report</div>
            <div>
              <div className="chg-row">
                <Move from={changes.name.from || 'not set'} to={changes.name.to} />
              </div>
            </div>
          </div>
        )}

        {changes.ratings.length > 0 && (
          <div className="card col">
            <div className="card-title">Rating words</div>
            <div>
              {changes.ratings.map((r) => (
                <div className="chg-row" key={r.level}>
                  <span className="chg-label">{r.level}</span>
                  <Move from={r.from} to={r.to} />
                </div>
              ))}
            </div>
          </div>
        )}

        {changes.changed.length > 0 && (
          <div className="card col">
            <div className="card-title">Changes to your options</div>
            <div>
              {changes.changed.map((c) => {
                const w = moveWords(c);
                return (
                  <div className="chg-row" key={`${c.label}-${c.field}`}>
                    <span className="chg-label">{c.label}</span>
                    <Move from={w.from} to={w.to} />
                  </div>
                );
              })}
            </div>
            {noteOnChanged && note}
          </div>
        )}

        {changes.added.length > 0 && (
          <div className="card col">
            <div className="card-title">New options</div>
            <div>
              {changes.added.map((n) => (
                <div className="chg-row" key={`${n.type}-${n.label}`}>
                  <span className="chg-label">{n.label}</span>
                  <span className="chg-kind">{newItemWords(n)}</span>
                </div>
              ))}
            </div>
            {noteOnAdded && note}
          </div>
        )}

        <div className="caption" style={{ marginTop: -8 }}>
          Anything outside of this list remains unchanged. You can change any of it later in
          Settings.
        </div>

        {/* Apply on top, Cancel below: the app puts the main action last on the screen. */}
        <div className="btn-stack">
          <button type="button" className="btn-primary" onClick={onApply}>
            Apply changes
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
