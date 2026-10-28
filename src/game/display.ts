// Native resolution and integer scale factor (see DECISIONS.md D3).

export const VIEW_W = 640;
export const VIEW_H = 360;

let touch: boolean | null = null;

/**
 * A phone / tablet: on-screen controls, fit-to-screen canvas. Detected from the primary pointer;
 * ?touch=1 forces it on (testing on a desktop), ?touch=0 off.
 */
export function isTouchDevice(): boolean {
  if (touch !== null) return touch;
  if (typeof window === 'undefined') return false; // (unit tests, headless sims)
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1' || q === '0') return (touch = q === '1');
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return (touch = coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window));
}

/** Fractional factor that fits the whole 640x360 view in the window. */
export function fitFactor(): number {
  return Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
}

/**
 * Desktop: largest integer k such that 640k x 360k fits the window (min 1), shown 1:1.
 * Touch screens are small and rarely a whole multiple: render at the next integer up (crisp, at most 3x) and
 * let CSS shrink the canvas to fill the screen (see main.ts).
 */
export function computeScale(): number {
  if (isTouchDevice()) return Math.max(1, Math.min(3, Math.ceil(fitFactor())));
  const k = Math.floor(fitFactor());
  return Math.max(1, k);
}
