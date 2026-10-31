// On-screen touch controls for phones and tablets.
//
// A DOM overlay (pointer events, so several fingers work at once) that presses and releases the SAME keys a
// keyboard player would, through Keyboard.press/release. Nothing downstream knows about touch: the match reads
// Player 1's key bindings (rebinding still works), menus read arrows / Enter / Escape.
//
//   'game'  fixed 8-way arrow pad bottom-left (up = jump, hold + attack = aim), action buttons on the right
//   'menu'  D-pad + OK + BACK (auto-repeat on the arrows)
//   'skip'  one big button (instant replays: tap to skip)
//   'off'   nothing (boot, trailer)

import { keyboardBinds, type Action } from './bindings';
import { inputDevice } from './devices';
import { keyboard } from './keyboard';

export type TouchMode = 'off' | 'menu' | 'game' | 'skip';

interface ButtonDef {
  id: string;
  label: string;
  /** keys pressed while held (game actions are resolved through P1's bindings at press time) */
  actions?: Action[];
  codes?: string[];
  cls: string;
  /** only heroes have these */
  hero?: boolean;
  /** menu buttons repeat while held */
  repeat?: boolean;
  /** tapped (down + up), not held */
  tap?: boolean;
  /** small second line under the label */
  sub?: string;
}

const GAME_BUTTONS: ButtonDef[] = [
  // the far right column: the same keys as the arrow pad's up / down, for a thumb that stays on the right
  { id: 'jump', label: 'JUMP', actions: ['up'], cls: 'b-jump' },
  { id: 'crouch', label: 'CROUCH', actions: ['down'], cls: 'b-crouch' },
  { id: 'attack', label: 'ATK', sub: 'HOLD=BLOCK', actions: ['attack'], cls: 'b-attack' },
  { id: 'kick', label: 'KICK', actions: ['kick'], cls: 'b-kick' },
  { id: 'ability', label: 'ABIL', actions: ['ability'], cls: 'b-ability', hero: true },
  { id: 'super', label: 'SUPER', actions: ['ability', 'kick'], cls: 'b-super', hero: true },
  { id: 'interact', label: 'GRAB', actions: ['interact'], cls: 'b-grab' },
  { id: 'cycle', label: 'SWAP', actions: ['cycle'], cls: 'b-swap' },
  { id: 'gadget', label: 'MED', actions: ['gadget'], cls: 'b-med' },
  { id: 'pause', label: 'II', codes: ['Escape'], cls: 'b-pause', tap: true },
];

const MENU_BUTTONS: ButtonDef[] = [
  { id: 'm-up', label: '▲', codes: ['ArrowUp'], cls: 'm-up', repeat: true },
  { id: 'm-down', label: '▼', codes: ['ArrowDown'], cls: 'm-down', repeat: true },
  { id: 'm-left', label: '◀', codes: ['ArrowLeft'], cls: 'm-left', repeat: true },
  { id: 'm-right', label: '▶', codes: ['ArrowRight'], cls: 'm-right', repeat: true },
  { id: 'm-ok', label: 'OK', codes: ['Enter'], cls: 'm-ok', tap: true },
  { id: 'm-back', label: 'BACK', codes: ['Escape'], cls: 'm-back', tap: true },
];

const CSS = `
#touch{position:fixed;inset:0;z-index:10;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;
  --u:min(1vw,1.78vh);font-family:monospace;color:#fff}
#touch[data-mode=off]{display:none}
/* nothing on a phone is text to select: a double tap or a held finger must never start a selection (or its magnifier) */
html.touch,html.touch *,#touch,#touch *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;-webkit-user-drag:none}
#touch *{touch-action:none}
#touch .tb{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;pointer-events:auto;touch-action:none;
  background:rgba(20,15,30,.46);border:2px solid rgba(255,255,255,.4);font-weight:bold;letter-spacing:0;font-size:calc(var(--u)*2.3);
  text-shadow:0 1px 2px #000;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#touch .tb.on{background:rgba(248,200,64,.62);border-color:#fff}
#touch .tb.sub{flex-direction:column;line-height:1.05}
#touch .tb small{font-size:calc(var(--u)*1.25);opacity:.85;font-weight:bold}
#touch[data-mode=menu] .g,#touch[data-mode=game] .m{display:none}
#touch:not([data-hero=on]) .hero{display:none}
/* game buttons: offsets from the bottom-right corner, in units of the screen height (--u = 1% of the short side) */
.b-jump{right:calc(var(--u)*2 + var(--sr,0px));bottom:calc(var(--u)*17 + var(--sb,0px));width:calc(var(--u)*12);height:calc(var(--u)*12);background:rgba(90,200,90,.5)!important;font-size:calc(var(--u)*2.1)!important}
.b-crouch{right:calc(var(--u)*2 + var(--sr,0px));bottom:calc(var(--u)*3 + var(--sb,0px));width:calc(var(--u)*12);height:calc(var(--u)*12);background:rgba(150,110,220,.5)!important;font-size:calc(var(--u)*1.6)!important}
.b-attack{right:calc(var(--u)*15 + var(--sr,0px));bottom:calc(var(--u)*4 + var(--sb,0px));width:calc(var(--u)*14);height:calc(var(--u)*14);background:rgba(234,74,74,.5)!important;font-size:calc(var(--u)*2.6)!important}
.b-kick{right:calc(var(--u)*30 + var(--sr,0px));bottom:calc(var(--u)*3 + var(--sb,0px));width:calc(var(--u)*11);height:calc(var(--u)*11)}
.b-ability{right:calc(var(--u)*17 + var(--sr,0px));bottom:calc(var(--u)*20 + var(--sb,0px));width:calc(var(--u)*11);height:calc(var(--u)*11);background:rgba(74,138,240,.5)!important}
.b-super{right:calc(var(--u)*30 + var(--sr,0px));bottom:calc(var(--u)*17 + var(--sb,0px));width:calc(var(--u)*9);height:calc(var(--u)*9);background:rgba(248,200,64,.45)!important;font-size:calc(var(--u)*1.6)!important}
.b-grab{right:calc(var(--u)*43 + var(--sr,0px));bottom:calc(var(--u)*4 + var(--sb,0px));width:calc(var(--u)*9);height:calc(var(--u)*9);font-size:calc(var(--u)*1.7)!important}
.b-swap{right:calc(var(--u)*42 + var(--sr,0px));bottom:calc(var(--u)*15 + var(--sb,0px));width:calc(var(--u)*8.5);height:calc(var(--u)*8.5);font-size:calc(var(--u)*1.7)!important}
.b-med{right:calc(var(--u)*17 + var(--sr,0px));bottom:calc(var(--u)*33 + var(--sb,0px));width:calc(var(--u)*8);height:calc(var(--u)*8);background:rgba(90,200,90,.4)!important;font-size:calc(var(--u)*1.7)!important}
.b-pause{right:calc(var(--u)*2 + var(--sr,0px));top:calc(var(--u)*2 + var(--st,0px));width:calc(var(--u)*6.5);height:calc(var(--u)*6.5);border-radius:20%}
/* the 8-way arrow pad: one round touch area, the thumb slides between the arrows */
#touch .pad{position:absolute;left:calc(var(--u)*3 + var(--sl,0px));bottom:calc(var(--u)*4 + var(--sb,0px));width:calc(var(--u)*25);height:calc(var(--u)*25);
  border-radius:50%;pointer-events:auto;touch-action:none;background:rgba(20,15,30,.34);border:2px solid rgba(255,255,255,.35);box-sizing:border-box}
#touch .pad i{position:absolute;left:50%;top:50%;width:calc(var(--u)*6.8);height:calc(var(--u)*6.8);margin:calc(var(--u)*-3.4);display:flex;align-items:center;
  justify-content:center;font-style:normal;font-weight:bold;font-size:calc(var(--u)*3);color:rgba(255,255,255,.75);border-radius:50%;pointer-events:none;
  transform:rotate(var(--a)) translateY(calc(var(--u)*-9)) rotate(calc(var(--a)*-1))}
#touch .pad i.on{background:rgba(248,200,64,.65);color:#fff}
/* menu pad: a small D-pad bottom-left, OK / BACK bottom-right (translucent: the menu stays readable behind it) */
#touch[data-mode=menu] .tb,#touch[data-mode=skip] .tb{background:rgba(20,15,30,.34)}
.m-up,.m-down,.m-left,.m-right{width:calc(var(--u)*10);height:calc(var(--u)*10);border-radius:22%!important}
.m-up{left:calc(var(--u)*13 + var(--sl,0px));bottom:calc(var(--u)*24 + var(--sb,0px))}
.m-down{left:calc(var(--u)*13 + var(--sl,0px));bottom:calc(var(--u)*4 + var(--sb,0px))}
.m-left{left:calc(var(--u)*3 + var(--sl,0px));bottom:calc(var(--u)*14 + var(--sb,0px))}
.m-right{left:calc(var(--u)*23 + var(--sl,0px));bottom:calc(var(--u)*14 + var(--sb,0px))}
.m-ok{right:calc(var(--u)*4 + var(--sr,0px));bottom:calc(var(--u)*6 + var(--sb,0px));width:calc(var(--u)*16);height:calc(var(--u)*16);background:rgba(90,200,90,.5)!important;font-size:calc(var(--u)*3)!important}
.m-back{right:calc(var(--u)*22 + var(--sr,0px));bottom:calc(var(--u)*4 + var(--sb,0px));width:calc(var(--u)*11);height:calc(var(--u)*11);background:rgba(234,74,74,.45)!important;font-size:calc(var(--u)*2)!important}
#touch[data-mode=skip] .m:not(.m-ok){display:none}
#touch[data-mode=skip] .g{display:none}
`;

/** keep receiving a finger's events after it slides off the element (not possible for synthetic test events) */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* no such active pointer */
  }
}

/** arrow glyphs for the 8 directions, clockwise from up */
const ARROWS = ['▲', '◥', '▶', '◢', '▼', '◣', '◀', '◤'];
/** left, right, up, down for each of the 8 sectors (clockwise from up) */
const SECTOR_DIRS: [boolean, boolean, boolean, boolean][] = [
  [false, false, true, false],
  [false, true, true, false],
  [false, true, false, false],
  [false, true, false, true],
  [false, false, false, true],
  [true, false, false, true],
  [true, false, false, false],
  [true, false, true, false],
];
/** the middle of the pad (as a fraction of its radius) where nothing is pressed */
const PAD_DEAD = 0.2;

/** which of the 8 arrows (0 = up, clockwise, 45 degrees each) a thumb offset from the pad centre points at */
export function directionSector(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up, clockwise
  return Math.round((deg + 360) / 45) % 8;
}

class TouchUI {
  private root: HTMLDivElement | null = null;
  private mode: TouchMode = 'off';
  private held = new Map<string, number>();
  private pad!: HTMLDivElement;
  private arrows: HTMLElement[] = [];
  private padId: number | null = null;
  private dirs = { left: false, right: false, up: false, down: false };
  private timers = new Map<string, number>();
  /** how many fingers / buttons hold each key right now (JUMP and the pad's up arrow press the same key) */
  private refs = new Map<string, number>();

  private press(code: string): void {
    const n = (this.refs.get(code) ?? 0) + 1;
    this.refs.set(code, n);
    if (n === 1) keyboard.press(code);
  }

  private release(code: string): void {
    const n = (this.refs.get(code) ?? 0) - 1;
    if (n > 0) this.refs.set(code, n);
    else {
      this.refs.delete(code);
      keyboard.release(code);
    }
  }

  attach(): void {
    if (this.root) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'touch';
    root.dataset.mode = 'off';
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root = root;

    this.pad = document.createElement('div');
    this.pad.className = 'pad g';
    ARROWS.forEach((glyph, i) => {
      const el = document.createElement('i');
      el.textContent = glyph;
      el.style.setProperty('--a', `${i * 45}deg`);
      this.pad.appendChild(el);
      this.arrows.push(el);
    });
    root.appendChild(this.pad);
    this.pad.addEventListener('pointerdown', (e) => this.padDown(e));
    this.pad.addEventListener('pointermove', (e) => this.padMove(e));
    const up = (e: PointerEvent) => this.padUp(e);
    this.pad.addEventListener('pointerup', up);
    this.pad.addEventListener('pointercancel', up);
    this.pad.addEventListener('lostpointercapture', up);

    for (const b of GAME_BUTTONS) root.appendChild(this.button(b, 'g'));
    for (const b of MENU_BUTTONS) root.appendChild(this.button(b, 'm'));
    document.body.appendChild(root);

    // The browser's own gestures must never reach the game: double-tap zoom and its magnifier loupe, press-and-hold
    // text selection, the context menu, pinch and rubber-band scroll. Calling preventDefault on the touch events of
    // the overlay (the buttons and the pad are DOM, not canvas) is what stops them on Android and iOS alike; the
    // buttons themselves run on pointer events, which this does not cancel.
    const stop = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    for (const t of ['touchstart', 'touchend', 'touchcancel']) root.addEventListener(t, stop, { passive: false });
    document.addEventListener('touchmove', stop, { passive: false });
    for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'selectstart', 'dragstart', 'contextmenu']) document.addEventListener(t, stop);
    // a second tap shortly after the first, anywhere (the canvas included): no double-tap zoom
    let lastTap = 0;
    document.addEventListener(
      'touchend',
      (e) => {
        const now = e.timeStamp;
        if (now - lastTap < 400) stop(e);
        lastTap = now;
      },
      { passive: false },
    );
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) sel.removeAllRanges();
    });
    // a lifted finger we never heard about must not leave a key stuck
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  setMode(m: TouchMode): void {
    if (!this.root || m === this.mode) return;
    this.mode = m;
    this.root.dataset.mode = m;
    const ok = this.root.querySelector('.m-ok');
    if (ok) ok.textContent = m === 'skip' ? 'SKIP' : 'OK';
    this.releaseAll();
  }

  setHero(h: boolean): void {
    if (this.root) this.root.dataset.hero = h ? 'on' : 'off';
  }

  get current(): TouchMode {
    return this.mode;
  }

  // ------------------------------------------------------------------ buttons

  private button(b: ButtonDef, group: 'g' | 'm'): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `tb ${group} ${b.cls}${b.hero ? ' hero' : ''}${b.sub ? ' sub' : ''}`;
    el.textContent = b.label;
    if (b.sub) {
      const s = document.createElement('small');
      s.textContent = b.sub;
      el.appendChild(s);
    }
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(el, e.pointerId);
      el.classList.add('on');
      inputDevice.note('touch');
      this.buzz(8);
      this.down(b);
    });
    const end = (e: PointerEvent) => {
      if (!el.classList.contains('on')) return;
      e.preventDefault();
      el.classList.remove('on');
      this.up(b);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    return el;
  }

  private codesOf(b: ButtonDef): string[] {
    const out = [...(b.codes ?? [])];
    for (const a of b.actions ?? []) out.push(keyboardBinds[0][a][0]);
    return out.filter(Boolean);
  }

  private down(b: ButtonDef): void {
    if (b.tap) {
      // a tap = down now, up a moment later (so the game sees a clean edge even from a 1-frame touch)
      for (const c of this.codesOf(b)) this.press(c);
      window.setTimeout(() => this.codesOf(b).forEach((c) => this.release(c)), 70);
      return;
    }
    const codes = this.codesOf(b);
    this.held.set(b.id, codes.length);
    this.holdCodes.set(b.id, codes);
    for (const c of codes) this.press(c);
    if (b.repeat) {
      const pulse = () => {
        for (const c of codes) {
          // a fresh key edge for auto-repeat (menus only: nothing else holds these keys)
          this.release(c);
          this.press(c);
        }
      };
      const t = window.setTimeout(() => {
        const iv = window.setInterval(pulse, 110);
        this.timers.set(b.id, iv);
      }, 380);
      this.delays.set(b.id, t);
    }
  }

  private holdCodes = new Map<string, string[]>();
  private delays = new Map<string, number>();

  private up(b: ButtonDef): void {
    const codes = this.holdCodes.get(b.id);
    this.holdCodes.delete(b.id);
    this.held.delete(b.id);
    if (codes) for (const c of codes) this.release(c);
    const d = this.delays.get(b.id);
    if (d !== undefined) window.clearTimeout(d);
    const t = this.timers.get(b.id);
    if (t !== undefined) window.clearInterval(t);
    this.delays.delete(b.id);
    this.timers.delete(b.id);
  }

  private releaseAll(): void {
    for (const code of this.refs.keys()) keyboard.release(code);
    this.refs.clear();
    this.holdCodes.clear();
    this.held.clear();
    for (const t of this.delays.values()) window.clearTimeout(t);
    for (const t of this.timers.values()) window.clearInterval(t);
    this.delays.clear();
    this.timers.clear();
    this.root?.querySelectorAll('.tb.on').forEach((e) => e.classList.remove('on'));
    this.padId = null;
    this.setSector(-1);
  }

  private buzz(ms: number): void {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* not supported */
    }
  }

  // ------------------------------------------------------------------ 8-way pad

  private padDown(e: PointerEvent): void {
    if (this.padId !== null) return;
    e.preventDefault();
    this.padId = e.pointerId;
    inputDevice.note('touch');
    capture(this.pad, e.pointerId);
    this.padMove(e);
  }

  private padMove(e: PointerEvent): void {
    if (e.pointerId !== this.padId) return;
    e.preventDefault();
    const r = this.pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    this.setSector(Math.hypot(dx, dy) < (r.width / 2) * PAD_DEAD ? -1 : directionSector(dx, dy));
  }

  private padUp(e: PointerEvent): void {
    if (e.pointerId !== this.padId) return;
    this.padId = null;
    this.setSector(-1);
  }

  private sector = -1;

  /** light the arrow under the thumb and press its keys (-1 = centre / released) */
  private setSector(s: number): void {
    if (s === this.sector) return;
    if (s >= 0 && this.sector < 0) this.buzz(6);
    this.sector = s;
    this.arrows.forEach((el, i) => el.classList.toggle('on', i === s));
    const [l, r, u, d] = s < 0 ? [false, false, false, false] : SECTOR_DIRS[s];
    this.setDirs(l, r, u, d);
  }

  private setDirs(left: boolean, right: boolean, up: boolean, down: boolean): void {
    const next = { left, right, up, down };
    for (const a of ['left', 'right', 'up', 'down'] as const) {
      if (next[a] === this.dirs[a]) continue;
      this.dirs[a] = next[a];
      for (const c of keyboardBinds[0][a].slice(0, 1)) {
        if (next[a]) this.press(c);
        else this.release(c);
      }
    }
  }
}

export const touchUI = new TouchUI();
