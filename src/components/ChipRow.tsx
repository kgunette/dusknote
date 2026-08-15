import { useState } from 'react';
import { cap } from '../lib';
import { Chip } from './Chip';

/**
 * A wrapping row of multi-select pill chips ending in "+ add".
 * For the treatments row, a new chip also asks medication-or-remedy
 * (the distinction drives the medication-days stat).
 */
export function ChipRow({
  options,
  selected,
  onToggle,
  onAdd,
  askTreatmentType,
  includeArchivedSelected,
}: {
  options: string[];
  selected: string[];
  onToggle: (label: string) => void;
  onAdd: (label: string, type?: 'medication' | 'remedy') => void;
  askTreatmentType?: boolean;
  /** Show a value that's on the entry but no longer an active option (archived) as a removable,
   *  "archived"-tagged pill, so it isn't stuck. Used by the symptom/factor rows (treatments carry
   *  their own remove on the attempt card, so they don't need this). */
  includeArchivedSelected?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  function commitText() {
    const label = cap(text.trim());
    setText('');
    if (!label) {
      setAdding(false);
      return;
    }
    const existing = options.find((o) => o.toLowerCase() === label.toLowerCase());
    if (existing) {
      // already exists — just select it
      if (!selected.includes(existing)) onToggle(existing);
      setAdding(false);
      return;
    }
    if (askTreatmentType) {
      setPending(label);
    } else {
      onAdd(label);
      setAdding(false);
    }
  }

  function commitPending(type: 'medication' | 'remedy') {
    if (pending) onAdd(pending, type);
    setPending(null);
    setAdding(false);
  }

  // Values on the entry that are no longer active options (archived, or otherwise removed from the
  // vocab). Shown so they can be taken off; the option list would otherwise hide them permanently.
  const archivedSelected = includeArchivedSelected
    ? selected.filter((s) => !options.some((o) => o.toLowerCase() === s.toLowerCase()))
    : [];

  return (
    <div className="col">
      <div className="chip-row">
        {options.map((label) => (
          <Chip
            key={label}
            label={label}
            selected={selected.includes(label)}
            onTap={() => onToggle(label)}
          />
        ))}
        {archivedSelected.map((label) => (
          <Chip key={label} label={label} selected archived onTap={() => onToggle(label)} />
        ))}
        {adding && !pending ? (
          <input
            className="chip-input"
            type="text"
            value={text}
            placeholder="name it"
            autoFocus
            enterKeyHint="done"
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') {
                setText('');
                setAdding(false);
              }
            }}
          />
        ) : !pending ? (
          <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
            <span className="chip-face">+ add</span>
            <span className="chip-ghost" aria-hidden="true">
              + add
            </span>
          </button>
        ) : null}
      </div>
      {pending && (
        <div className="helped-row">
          <span className="helped-label">{pending}: medication or remedy?</span>
          <Chip label="medication" small selected={false} onTap={() => commitPending('medication')} />
          <Chip label="remedy" small selected={false} onTap={() => commitPending('remedy')} />
        </div>
      )}
    </div>
  );
}
