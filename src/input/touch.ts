// On-screen touch controls for phones and tablets.
//
// A DOM overlay (pointer events, so several fingers work at once) that presses and releases the SAME keys a
// keyboard player would, through Keyboard.press/release. Nothing downstream knows about touch: the match reads
// Player 1's key bindings (rebinding still works), menus read arrows / Enter / Escape.
//
//   'game'  floating stick on the left half (up = jump, hold + attack = aim), action buttons on the right
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
}

const GAME_BUTTONS: ButtonDef[] = [
  { id: 'attack', label: 'ATK', actions: ['attack'], cls: 'b-attack' },
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
#touch .tb{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;pointer-events:auto;touch-action:none;
  background:rgba(20,15,30,.46);border:2px solid rgba(255,255,255,.4);font-weight:bold;letter-spacing:0;font-size:calc(var(--u)*2.3);
  text-shadow:0 1px 2px #000;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#touch .tb.on{background:rgba(248,200,64,.62);border-color:#fff}
#touch[data-mode=menu] .g,#touch[data-mode=game] .m{display:none}
#touch:not([data-hero=on]) .hero{display:none}
/* game buttons: offsets from the bottom-right corner, in units of the screen height (--u = 1% of the short side) */
.b-attack{right:calc(var(--u)*2 + var(--sr,0px));bottom:calc(var(--u)*4 + var(--sb,0px));width:calc(var(--u)*14);height:calc(var(--u)*14);background:rgba(234,74,74,.5)!important;font-size:calc(var(--u)*2.6)!important}
.b-kick{right:calc(var(--u)*17 + var(--sr,0px));bottom:calc(var(--u)*3 + var(--sb,0px));width:calc(var(--u)*11);height:calc(var(--u)*11)}
.b-ability{right:calc(var(--u)*4 + var(--sr,0px));bottom:calc(var(--u)*20 + var(--sb,0px));width:calc(var(--u)*11);height:calc(var(--u)*11);background:rgba(74,138,240,.5)!important}
.b-super{right:calc(var(--u)*17 + var(--sr,0px));bottom:calc(var(--u)*17 + var(--sb,0px));width:calc(var(--u)*9);height:calc(var(--u)*9);background:rgba(248,200,64,.45)!important;font-size:calc(var(--u)*1.6)!important}
.b-grab{right:calc(var(--u)*30 + var(--sr,0px));bottom:calc(var(--u)*4 + var(--sb,0px));width:calc(var(--u)*9);height:calc(var(--u)*9);font-size:calc(var(--u)*1.7)!important}
.b-swap{right:calc(var(--u)*29 + var(--sr,0px));bottom:calc(var(--u)*15 + var(--sb,0px));width:calc(var(--u)*8.5);height:calc(var(--u)*8.5);font-size:calc(var(--u)*1.7)!important}
.b-med{right:calc(var(--u)*4 + var(--sr,0px));bottom:calc(var(--u)*33 + var(--sb,0px));width:calc(var(--u)*8);height:calc(var(--u)*8);background:rgba(90,200,90,.4)!important;font-size:calc(var(--u)*1.7)!important}
.b-pause{right:calc(var(--u)*2 + var(--sr,0px));top:calc(var(--u)*2 + var(--st,0px));width:calc(var(--u)*6.5);height:calc(var(--u)*6.5);border-radius:20%}
/* the stick */
#touch .zone{position:absolute;left:0;bottom:0;width:48%;height:78%;pointer-events:auto;touch-action:none}
#touch .base,#touch .knob{position:absolute;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);box-sizing:border-box}
#touch .base{width:calc(var(--u)*20);height:calc(var(--u)*20);border:2px solid rgba(255,255,255,.35);background:rgba(20,15,30,.28)}
#touch .knob{width:calc(var(--u)*9);height:calc(var(--u)*9);background:rgba(255,255,255,.5);border:2px solid rgba(255,255,255,.8)}
#touch .base.idle,#touch .knob.idle{opacity:.45}
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

const STICK_R = 0.1; // stick radius as a fraction of the short side

class TouchUI {
  private root: HTMLDivElement | null = null;
  private mode: TouchMode = 'off';
  private held = new Map<string, number>();
  private zone!: HTMLDivElement;
  private base!: HTMLDivElement;
  private knob!: HTMLDivElement;
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  private dirs = { left: false, right: false, up: false, down: false };
  private timers = new Map<string, number>();

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

    this.zone = document.createElement('div');
    this.zone.className = 'zone g';
    this.base = document.createElement('div');
    this.base.className = 'base g idle';
    this.knob = document.createElement('div');
    this.knob.className = 'knob g idle';
    root.append(this.zone, this.base, this.knob);
    this.restStick();
    this.zone.addEventListener('pointerdown', (e) => this.stickDown(e));
    this.zone.addEventListener('pointermove', (e) => this.stickMove(e));
    const up = (e: PointerEvent) => this.stickUp(e);
    this.zone.addEventListener('pointerup', up);
    this.zone.addEventListener('pointercancel', up);
    this.zone.addEventListener('lostpointercapture', up);

    for (const b of GAME_BUTTONS) root.appendChild(this.button(b, 'g'));
    for (const b of MENU_BUTTONS) root.appendChild(this.button(b, 'm'));
    document.body.appendChild(root);

    // iOS: block the page's own gestures (pinch, double-tap zoom, rubber-band scroll)
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    // a lifted finger we never heard about must not leave a key stuck
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    window.addEventListener('resize', () => this.restStick());
    window.addEventListener('orientationchange', () => this.restStick());
  }

  setMode(m: TouchMode): void {
    if (!this.root || m === this.mode) return;
    this.mode = m;
    this.root.dataset.mode = m;
    const ok = this.root.querySelector('.m-ok');
    if (ok) ok.textContent = m === 'skip' ? 'SKIP' : 'OK';
    this.releaseAll();
    this.restStick();
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
    el.className = `tb ${group} ${b.cls}${b.hero ? ' hero' : ''}`;
    el.textContent = b.label;
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
      for (const c of this.codesOf(b)) keyboard.press(c);
      window.setTimeout(() => this.codesOf(b).forEach((c) => keyboard.release(c)), 70);
      return;
    }
    const codes = this.codesOf(b);
    this.held.set(b.id, codes.length);
    this.holdCodes.set(b.id, codes);
    for (const c of codes) keyboard.press(c);
    if (b.repeat) {
      const pulse = () => {
        for (const c of codes) {
          keyboard.release(c);
          keyboard.press(c);
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
    if (codes) for (const c of codes) keyboard.release(c);
    const d = this.delays.get(b.id);
    if (d !== undefined) window.clearTimeout(d);
    const t = this.timers.get(b.id);
    if (t !== undefined) window.clearInterval(t);
    this.delays.delete(b.id);
    this.timers.delete(b.id);
  }

  private releaseAll(): void {
    for (const [, codes] of this.holdCodes) for (const c of codes) keyboard.release(c);
    this.holdCodes.clear();
    this.held.clear();
    for (const t of this.delays.values()) window.clearTimeout(t);
    for (const t of this.timers.values()) window.clearInterval(t);
    this.delays.clear();
    this.timers.clear();
    this.root?.querySelectorAll('.tb.on').forEach((e) => e.classList.remove('on'));
    this.stickId = null;
    this.setDirs(false, false, false, false);
  }

  private buzz(ms: number): void {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* not supported */
    }
  }

  // ------------------------------------------------------------------ stick

  private radius(): number {
    return Math.min(window.innerWidth, window.innerHeight) * STICK_R;
  }

  /** the faint resting stick (bottom-left) shows where to put the thumb */
  private restStick(): void {
    if (!this.root) return;
    const m = Math.min(window.innerWidth, window.innerHeight);
    this.place(m * 0.2, window.innerHeight - m * 0.26, m * 0.2, window.innerHeight - m * 0.26);
    this.base.classList.add('idle');
    this.knob.classList.add('idle');
  }

  private place(bx: number, by: number, kx: number, ky: number): void {
    this.base.style.left = `${bx}px`;
    this.base.style.top = `${by}px`;
    this.knob.style.left = `${kx}px`;
    this.knob.style.top = `${ky}px`;
  }

  private stickDown(e: PointerEvent): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    inputDevice.note('touch');
    capture(this.zone, e.pointerId);
    const r = this.radius();
    this.ox = Math.max(r, Math.min(window.innerWidth * 0.5, e.clientX));
    this.oy = Math.max(r, Math.min(window.innerHeight - r * 0.6, e.clientY));
    this.base.classList.remove('idle');
    this.knob.classList.remove('idle');
    this.place(this.ox, this.oy, this.ox, this.oy);
    this.stickMove(e);
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    e.preventDefault();
    const r = this.radius();
    let dx = e.clientX - this.ox;
    let dy = e.clientY - this.oy;
    const len = Math.hypot(dx, dy);
    if (len > r) {
      // drag the base along so the thumb never runs out of room
      const k = (len - r) / len;
      this.ox += dx * k;
      this.oy += dy * k;
      dx = e.clientX - this.ox;
      dy = e.clientY - this.oy;
    }
    this.place(this.ox, this.oy, this.ox + dx, this.oy + dy);
    // up is the jump: it takes a smaller push than down (a sliding thumb should jump easily)
    this.setDirs(dx < -r * 0.38, dx > r * 0.38, dy < -r * 0.42, dy > r * 0.55);
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.setDirs(false, false, false, false);
    this.restStick();
  }

  private setDirs(left: boolean, right: boolean, up: boolean, down: boolean): void {
    const next = { left, right, up, down };
    for (const a of ['left', 'right', 'up', 'down'] as const) {
      if (next[a] === this.dirs[a]) continue;
      this.dirs[a] = next[a];
      for (const c of keyboardBinds[0][a].slice(0, 1)) {
        if (next[a]) keyboard.press(c);
        else keyboard.release(c);
      }
    }
  }
}

export const touchUI = new TouchUI();
