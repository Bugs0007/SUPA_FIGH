import type { Appearance } from './appearance';
import type { PixelCanvas } from './canvas';
import type { Pose } from './fighterArt';
import type { HeroArt } from './heroArt';
import type { HeroMoveLook } from './heroMoves';
import { shade } from './palette';

export const ONE_PIECE_ART: Record<string, HeroArt> = {
  zoro: {
    look: { design: 'zoro', form: 0, skin: '#e7ac80', hair: 'none', hairColor: '#79c64f', face: 'plain', hat: 'none', hatColor: '#242033', top: 'openrobe', topColor: '#3e813f', accentColor: '#b4364a', pantsColor: '#293b35', shoesColor: '#232032' },
    forms: [
      { topColor: '#4f974e', trim: '#333145' },
      { hatColor: '#24232e', topColor: '#3d784c', accentColor: '#a2375c', trim: '#8752bc' },
      { hatColor: '#252534', topColor: '#38684b', accentColor: '#ca4158', trim: '#a4e879' },
      { hatColor: '#32233c', topColor: '#477e5d', accentColor: '#c96091', eyes: '#f6bbc7', trim: '#ed81cb' },
    ],
    fx: [
      { aura: ['#50896c', '#c4f9a6'], tails: 0, tailColors: ['#fff', '#fff'], power: 1 },
      { aura: ['#8058ad', '#dab3ff'], tails: 0, tailColors: ['#fff', '#fff'], power: 2, extra: 'fire' },
      { aura: ['#37a572', '#c4fc8c'], tails: 0, tailColors: ['#fff', '#fff'], power: 3, extra: 'lightning' },
      { aura: ['#934583', '#ffb9ed'], tails: 0, tailColors: ['#fff', '#fff'], power: 4, extra: 'lightning' },
    ],
  },
  sanji: {
    look: { design: 'sanji', form: 0, skin: '#e9b88d', hair: 'none', hairColor: '#efca62', face: 'plain', hat: 'none', hatColor: '#232239', top: 'suit', topColor: '#29293b', accentColor: '#c68f47', pantsColor: '#2c2a3b', shoesColor: '#212031' },
    forms: [
      { accentColor: '#f7b550', trim: '#e07832' },
      { topColor: '#3a263a', accentColor: '#e44a43', pantsColor: '#302431', trim: '#e0503c' },
      { topColor: '#43314a', accentColor: '#f0a64c', pantsColor: '#34283e', trim: '#f2b076' },
      { topColor: '#232e48', accentColor: '#a5def0', pantsColor: '#293552', shoesColor: '#4878a1', eyes: '#2c7295', trim: '#a8f5ff' },
    ],
    fx: [
      { aura: ['#dd6632', '#ffd98c'], tails: 0, tailColors: ['#fff', '#fff'], power: 1, extra: 'fire' },
      { aura: ['#c8323c', '#ffad56'], tails: 0, tailColors: ['#fff', '#fff'], power: 2, extra: 'fire' },
      { aura: ['#d26d4b', '#ffe0a4'], tails: 0, tailColors: ['#fff', '#fff'], power: 3, extra: 'steam' },
      { aura: ['#4385ea', '#bdfcff'], tails: 0, tailColors: ['#fff', '#fff'], power: 4, extra: 'lightning' },
    ],
  },
  law: {
    look: { design: 'law', form: 0, skin: '#d2a47c', hair: 'short', hairColor: '#302632', face: 'plain', hat: 'none', hatColor: '#ede3d3', top: 'jacket', topColor: '#242d43', accentColor: '#d2a044', pantsColor: '#67829b', shoesColor: '#342b37' },
    forms: [
      { topColor: '#2d3f52', accentColor: '#e0b150', trim: '#8ee2e6' },
      { topColor: '#344158', pantsColor: '#7288a4', accentColor: '#edb653', trim: '#75dce8' },
      { topColor: '#302f4f', accentColor: '#edc35a', pantsColor: '#514c70', trim: '#b7adf8' },
      { topColor: '#392b53', accentColor: '#f1bc67', pantsColor: '#626286', eyes: '#bba6e5', trim: '#e1c3ff' },
    ],
    fx: [
      { aura: ['#478ba3', '#9ee5e6'], tails: 0, tailColors: ['#fff', '#fff'], power: 1 },
      { aura: ['#5299c2', '#baf6f9'], tails: 0, tailColors: ['#fff', '#fff'], power: 2 },
      { aura: ['#637bd5', '#c8cbff'], tails: 0, tailColors: ['#fff', '#fff'], power: 3, extra: 'lightning' },
      { aura: ['#8761ca', '#ebd7ff'], tails: 0, tailColors: ['#fff', '#fff'], power: 4, extra: 'lightning' },
    ],
  },
};

/** Give generic hit sparks and guard feedback the same colours as the bespoke attacks. */
export const ONE_PIECE_MOVES: Record<string, readonly HeroMoveLook[]> = Object.fromEntries(
  Object.entries(ONE_PIECE_ART).map(([id, art]) => {
    const palettes = [art.fx[0].aura, ...art.fx.map(form => form.aura)];
    return [id, palettes.map(([rim, spark], level): HeroMoveLook => ({
      name: `${id}-${level}`,
      core: 0xfff5e3,
      rim: parseInt(rim.slice(1), 16),
      spark: parseInt(spark.slice(1), 16),
      helpers: 0,
      shapingArms: 0,
      lightning: level >= 3 ? 2 : 0,
      rubber: 'plain',
    }))];
  }),
);

export function drawOnePieceBody(pc: PixelCanvas, ox: number, oy: number, p: Pose, a: Appearance): void {
  const x = ox + 13 + p.lean;
  const y = oy + p.hipY - p.torsoH;
  const waist = oy + p.hipY;
  const hem = Math.min(waist + 6, oy + 30);
  const level = a.form ?? 0;
  if (a.design === 'zoro') {
    const robeShade = shade(a.topColor, -0.22);
    // Open green robe, red sash and chest scar, followed by three distinct sheaths at the hip.
    pc.line(x, y + 1, ox + 12, Math.min(waist + 3, hem - 1), robeShade, 2);
    pc.line(x + 5, y + 1, ox + 18, Math.min(waist + 2, hem - 1), a.topColor, 2);
    pc.line(x + 1, y + 1, x + 3, y + 3, shade(a.topColor, 0.22));
    pc.line(x + 4, y + 2, x + 3, y + 5, '#9e503f');
    pc.rect(ox + 12, waist - 1, 8, 2, a.accentColor);
    pc.rect(ox + 13, waist - 1, 6, 1, shade(a.accentColor, 0.22));
    pc.line(ox + 19, waist, ox + 21, Math.min(waist + 3, hem), a.accentColor);
    const sheaths = ['#e8ddd4', '#af4338', level > 1 ? '#aa77d5' : '#494559'];
    sheaths.forEach((color, i) => {
      const hiltX = ox + 11 + i * 2;
      pc.line(hiltX, waist - 2, hiltX - 6, hem, color);
      pc.set(hiltX - 1, waist, '#e1b35f');
      pc.set(hiltX, waist - 3, i === 0 ? '#e8ddd4' : '#342636');
    });
    if (level >= 3) pc.set(ox + 14, waist - 4, a.trim ?? '#a4e879');
  } else if (a.design === 'sanji') {
    const seam = shade(a.topColor, 0.23);
    pc.line(x + 1, y, x + 3, y + 3, seam);
    pc.line(x + 5, y, x + 4, y + 3, seam);
    pc.rect(x + 3, y, 1, 3, a.accentColor);
    pc.set(x + 4, y + 4, '#cca659');
    if (p.torsoH >= 6) pc.set(x + 4, y + 6, '#cca659');
    if (level > 0) {
      const leg = p.front;
      const bootX = ox + leg.fx;
      const bootY = oy + leg.fy;
      const fire = level === 4 ? '#3f80d8' : level === 2 ? '#c74332' : '#e77a3e';
      const core = level === 4 ? '#bbf9ff' : '#ffd580';
      pc.line(ox + leg.kx + 1, oy + leg.ky, bootX + 1, bootY, fire, 2);
      pc.set(bootX + 1, bootY, core);
      pc.set(bootX + 2, bootY - 1, core);
      pc.set(bootX + 3, Math.min(bootY + 1, oy + 31), fire);
    }
  } else if (a.design === 'law') {
    const fold = shade(a.topColor, 0.28);
    pc.rect(x - 1, y, 2, 3, a.topColor);
    pc.set(x, y, fold);
    pc.line(x - 1, y + 1, ox + 11, Math.min(waist + 5, hem - 1), a.topColor, 2);
    pc.line(x + 5, y + 2, ox + 20, Math.min(waist + 4, hem - 1), a.topColor, 2);
    pc.line(x + 1, y + 1, x + 2, y + 3, fold);
    pc.set(x + 4, y + 4, '#674a36');
    pc.set(x + 3, y + 5, '#674a36');
    // Kikoku's long black sheath and gold oval hand guard.
    pc.line(ox + 12, waist - 3, ox + 5, hem - 1, '#302739', 2);
    pc.line(ox + 11, waist - 2, ox + 6, hem - 1, '#58415a');
    pc.line(ox + 13, waist - 4, ox + 15, waist - 7, '#e0c4d4');
    pc.rect(ox + 11, waist - 4, 4, 1, '#d4ad6a');
    for (const leg of [p.back, p.front]) pc.set(ox + leg.kx, oy + leg.ky + 1, shade(a.pantsColor, -0.45));
  }
}

export function drawOnePieceHead(pc: PixelCanvas, ox: number, oy: number, a: Appearance, mode: number): void {
  if (a.design === 'zoro') {
    const greens = { G: a.hairColor, H: shade(a.hairColor, 0.32), S: shade(a.hairColor, -0.32) };
    if ((a.form ?? 0) < 2) {
      // A short, jagged crop with a solid green crown and a darker sideburn.
      pc.ascii(ox + 4, oy + 3, [
        '..H..G..',
        '.HHGHHG.',
        'SHGHHGGS',
        'SGGGGGGS',
        '.SS..S..',
        '.S......',
      ], greens);
    } else {
      // Leave green above the fold and at the temple, with the knot tucked behind his head.
      pc.ascii(ox + 2, oy + 3, [
        '....H..G..',
        '...HGHHGG.',
        '..BBBLBBBB',
        '..LLBBBBBD',
        '.BDDDDDDD.',
        'DB.GS.....',
        '..D.S.....',
      ], { ...greens, B: a.hatColor, L: shade(a.hatColor, 0.4), D: shade(a.hatColor, -0.32) });
    }
    pc.line(ox + 10, oy + 6, ox + 9, oy + 10, '#a05448');
    if (mode === 0) pc.rect(ox + 9, oy + 8, 2, 1, '#44313b');
    for (let i = 0; i < 3; i++) pc.set(ox + 4 + i, oy + 11 + (i % 2), '#e7bf60');
  } else if (a.design === 'sanji') {
    pc.ascii(ox + 4, oy + 3, [
      '..HGHH...',
      '.HHHHGG..',
      'HHHGGGSS.',
      'HGGGGSSG.',
      'SSGGGS...',
      '.SGGS....',
      '.SGS.....',
      '..S......',
    ], { H: shade(a.hairColor, 0.25), G: a.hairColor, S: shade(a.hairColor, -0.24) });
    if (mode === 0) {
      pc.line(ox + 9, oy + 7, ox + 11, oy + 7, '#845630');
      pc.set(ox + 11, oy + 6, '#845630');
      pc.set(ox + 9, oy + 8, '#e0a35a');
    }
    pc.set(ox + 9, oy + 12, '#7e593e');
  } else if (a.design === 'law') {
    pc.ascii(ox + 2, oy + 2, [
      '...HHHH...',
      '..HHHHHH..',
      '.HDSHHHHS.',
      '.HHSHDHHS.',
      'SSHHSSHDSS',
      '.SSSSSSSSS',
    ], { H: a.hatColor, S: '#b9b1b6', D: '#4f4350' });
    pc.set(ox + 11, oy + 6, '#4f4350');
    pc.set(ox + 9, oy + 12, '#483444');
    pc.set(ox + 10, oy + 12, '#483444');
  }
}
