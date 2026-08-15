export function Chip({
  label,
  selected,
  small,
  onTap,
  ariaLabel,
  archived,
}: {
  label: string;
  selected: boolean;
  small?: boolean;
  onTap: () => void;
  ariaLabel?: string;
  /** An archived value still on this entry: shows a muted "archived" text tag and reads as such.
   *  A quiet heads-up that removing it is one-way (it won't return as an option). */
  archived?: boolean;
}) {
  const tag = archived ? <span className="chip-archived"> archived</span> : null;
  // aria-pressed carries the selected state; a ", selected" suffix on the label made screen
  // readers announce it twice.
  return (
    <button
      type="button"
      className={'chip' + (small ? ' chip-small' : '') + (selected ? ' chip-sel' : '')}
      aria-pressed={selected}
      aria-label={ariaLabel ?? `${label}${archived ? ', archived' : ''}`}
      onClick={onTap}
    >
      <span className="chip-face">
        {label}
        {tag}
      </span>
      <span className="chip-ghost" aria-hidden="true">
        {label}
        {tag}
      </span>
    </button>
  );
}
