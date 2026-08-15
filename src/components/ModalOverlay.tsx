import { useEffect, useRef } from 'react';

/**
 * A real modal dialog: labelled, focus-trapped, Escape-dismissable, and restoring focus to
 * whatever opened it.
 *
 * The overlay markup this replaces was a plain div, so the page behind it stayed in the
 * accessible tree. A screen-reader user could swipe straight past the visual scrim into controls
 * they could no longer see, and focus never entered the dialog at all.
 *
 * `aria-modal` tells assistive tech the rest of the page is inert while this is open; the Tab
 * wrap below enforces the same thing for keyboards, since `aria-modal` alone doesn't stop Tab.
 */
export function ModalOverlay({
  labelId,
  onDismiss,
  children,
}: {
  /** id of the element holding the dialog's question/title, so it gets announced on open. */
  labelId: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;

    const focusables = (): HTMLElement[] =>
      Array.from(
        box?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => !el.hasAttribute('disabled'));

    // Focus the first control, unless a child already claimed it (the editor's autoFocus input).
    if (box && !box.contains(document.activeElement)) focusables()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      // Wrap at both ends, so Tab can never walk out into the page behind the scrim.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.(); // put the user back where they were
    };
  }, [onDismiss]);

  return (
    <div className="mgr-overlay" onClick={onDismiss}>
      <div
        ref={ref}
        className="mgr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
