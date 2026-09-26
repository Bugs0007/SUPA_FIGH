// Native resolution and integer scale factor (see DECISIONS.md D3).

export const VIEW_W = 640;
export const VIEW_H = 360;

/** Largest integer k such that 640k x 360k fits the window (min 1). */
export function computeScale(): number {
  const k = Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H));
  return Math.max(1, k);
}
