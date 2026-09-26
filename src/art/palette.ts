// Master palette. Keeping (mostly) to a fixed set of colors keeps procedural art cohesive.

export const P = {
  ink: '#140f1e', // outlines
  ink2: '#221a30',
  night: '#1b1628',
  shadow: '#2d2640',
  steel0: '#2e3244',
  steel1: '#464b63',
  steel2: '#646b87',
  steel3: '#8d95b0',
  steel4: '#c3c9dc',
  white: '#f4f1ea',
  concrete0: '#3b3a45',
  concrete1: '#55545f',
  concrete2: '#72717b',
  concrete3: '#94939b',
  brick0: '#5a2a28',
  brick1: '#7e3a32',
  brick2: '#a44f3c',
  wood0: '#4a2c1c',
  wood1: '#6e4228',
  wood2: '#94603a',
  wood3: '#b98450',
  dirt0: '#3c2a22',
  dirt1: '#5a4030',
  dirt2: '#7a5a40',
  glass0: '#5fa8c8',
  glass1: '#9fd8ec',
  glass2: '#dff6ff',
  water0: '#1d3a6a',
  water1: '#2d5a9a',
  water2: '#5a8ed0',
  red0: '#7a1a26',
  red1: '#b8283a',
  red2: '#ea4a4a',
  orange: '#f07a2a',
  yellow: '#f8c840',
  yellow2: '#fff4a0',
  green0: '#1f5a3a',
  green1: '#2f8a4a',
  green2: '#5ac85a',
  blue0: '#1f3a7a',
  blue1: '#2f5ab8',
  blue2: '#4a8af0',
  purple0: '#4a2a7a',
  purple1: '#7a4ab8',
  pink: '#e05aa6',
  teal: '#2ab8a8',
  brass: '#d8a040',
  blood: '#b01020',
  blood2: '#7a0a18',
} as const;

export const SKIN_TONES = ['#f6d2b0', '#eab48a', '#d09060', '#a86a40', '#7a4a2c', '#553222'];
export const HAIR_COLORS = ['#1e1614', '#4a2e1c', '#7a3a1a', '#d8b050', '#c8602a', '#e8e4dc', '#8a8a90', '#3a6ad0', '#e05aa6', '#3fbf5a', '#8a4fd0'];
export const CLOTH_COLORS = [
  '#b8283a',
  '#2f5ab8',
  '#2f8a4a',
  '#f8c840',
  '#f07a2a',
  '#7a4ab8',
  '#2ab8a8',
  '#e05aa6',
  '#1e1e28',
  '#f4f1ea',
  '#646b87',
  '#6e4228',
  '#94603a',
  '#1f3a7a',
  '#5a2a28',
  '#3a4a2a',
];

/** Team colors 1..4 (index 0 = solo/neutral). */
export const TEAM_COLORS = ['#f4f1ea', '#ea4a4a', '#4a8af0', '#5ac85a', '#f8c840'];
export const TEAM_NAMES = ['SOLO', 'RED', 'BLUE', 'GREEN', 'GOLD'];

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** amount -1..1: negative darkens toward ink, positive lightens toward white. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amount < 0) {
    const [ir, ig, ib] = hexToRgb(P.ink);
    const t = -amount;
    return rgbToHex(r + (ir - r) * t, g + (ig - g) * t, b + (ib - b) * t);
  }
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

export function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}
