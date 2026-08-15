import { useLayoutEffect, useRef } from 'react';

/**
 * Moves keyboard focus to the new screen's heading whenever the app navigates.
 *
 * Without this, switching tab or opening a form unmounts the whole subtree and focus falls to
 * `<body>`. A keyboard or switch user then has to tab from the top of the document to find where
 * they landed, and again on the way back out, with nothing announcing that the screen changed.
 *
 * This component sits OUTSIDE the keyed screen wrapper, so it survives the swap and its effect
 * runs after React has committed the new screen. A layout effect (not a plain one, and not a
 * requestAnimationFrame) is what keeps the focus move in the same frame as the swap: deferring it
 * let the browser hand focus to `<body>` first, which a screen reader announces as a page change.
 *
 * Nothing happens on launch: focusing a heading there would talk over the page load, and nobody
 * navigated to get there. That's done by remembering the last surface rather than burning a
 * "first render" flag, because StrictMode mounts effects twice in development and a flag gets
 * consumed by the first mount, making the second one fire on load.
 */
export function ScreenFocus({ surface }: { surface: string }) {
  const seen = useRef(surface);

  useLayoutEffect(() => {
    if (seen.current === surface) return; // initial mount, or a re-run without a navigation
    seen.current = surface;
    const h = document.querySelector<HTMLElement>('.screen h1, .screen h2');
    if (!h) return;
    // Headings aren't focusable by default; -1 allows programmatic focus without adding a tab
    // stop, so Tab order is unchanged for everyone else.
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }, [surface]);

  return null;
}
