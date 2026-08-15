import { useRef, useState } from 'react';
import { noRatingLabel } from '../config';

const HOLD_MS = 300;

/**
 * Six 48px circles in one row, 0 (the locked "No episode" label) through 5. Tap selects
 * (tap again deselects — blank is valid). Hover or press-and-hold previews
 * the word, shown right-aligned on the label line so nothing ever shifts.
 * `words` are the editable 1–5 labels; they also serve as the
 * screen-reader label, so what you set is exactly what's announced.
 */
export function RatingPicker({
  value,
  onChange,
  words,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  words: readonly string[];
}) {
  const word = (n: number) => (n === 0 ? noRatingLabel() : words[n - 1]);
  const [preview, setPreview] = useState<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);

  function pointerDown(n: number) {
    held.current = false;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setPreview(n);
    }, HOLD_MS);
  }

  function pointerEnd() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function tap(n: number) {
    if (held.current) {
      // a hold is a preview, not a selection; the caption already shows the word
      held.current = false;
      return;
    }
    setPreview(null);
    onChange(value === n ? null : n);
  }

  const shown = preview ?? value;

  return (
    <div className="col">
      <div className="row-between">
        <span className="section-label" id="rating-q">How bad, at its worst?</span>
        <span className="sev-caption" aria-hidden="true">
          {shown != null ? word(shown) : ''}
        </span>
      </div>
      <div className="sev-row" role="group" aria-labelledby="rating-q">
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          const previewed = !selected && preview === n;
          return (
            <button
              key={n}
              type="button"
              className={
                'sev-circle' + (selected ? ' selected' : '') + (previewed ? ' previewed' : '')
              }
              aria-pressed={selected}
              aria-label={`${word(n)}, rating ${n} of 5`}
              onMouseEnter={() => setPreview(n)}
              onMouseLeave={() => setPreview(null)}
              onPointerDown={() => pointerDown(n)}
              onPointerUp={pointerEnd}
              onPointerCancel={pointerEnd}
              onClick={() => tap(n)}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
