import React from 'react';

/** A section that stays out of the way until opened, and can be closed again.
 *  Collapsed, it shows a summary of what's inside so nothing is ever hidden.
 *  Shared by the log form's optional fields and the Stats "What helped" card. */
export function RevealSection({
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="col">
      <button type="button" className="card reveal-row" onClick={onToggle} aria-expanded={open}>
        <span>{label}</span>
        <span className="muted small reveal-hint">{open ? 'hide' : summary}</span>
      </button>
      {open && children}
    </div>
  );
}
