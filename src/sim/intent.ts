// The one and only way to drive a fighter. Humans (keyboard/gamepad) and bots both produce this
// every tick. It is raw "button state"; edge detection (pressed/released) happens in the sim by
// comparing with the previous tick's intent, so intents can be recorded/replayed/sent over a network.

export interface Intent {
  /** -1 (left) .. 1 (right) */
  moveX: number;
  /** -1 (up) .. 1 (down). Also sweeps the aim angle while attack is held. */
  moveY: number;
  jump: boolean;
  /** hold = aim (guns) / swing (melee) */
  attack: boolean;
  kick: boolean;
  /** pick up / swap weapon, grab enemy, pick up prop */
  interact: boolean;
  /** cycle active weapon slot */
  cycle: boolean;
}

export function emptyIntent(): Intent {
  return { moveX: 0, moveY: 0, jump: false, attack: false, kick: false, interact: false, cycle: false };
}

export function copyIntent(dst: Intent, src: Intent): Intent {
  dst.moveX = src.moveX;
  dst.moveY = src.moveY;
  dst.jump = src.jump;
  dst.attack = src.attack;
  dst.kick = src.kick;
  dst.interact = src.interact;
  dst.cycle = src.cycle;
  return dst;
}

/** Compact encoding (for replays/netcode): 7 bits of buttons + quantized axes. */
export function packIntent(i: Intent): number {
  const ax = Math.round((i.moveX + 1) * 7) & 15;
  const ay = Math.round((i.moveY + 1) * 7) & 15;
  const b =
    (i.jump ? 1 : 0) |
    (i.attack ? 2 : 0) |
    (i.kick ? 4 : 0) |
    (i.interact ? 8 : 0) |
    (i.cycle ? 16 : 0);
  return (b << 8) | (ay << 4) | ax;
}

export function unpackIntent(v: number, out: Intent = emptyIntent()): Intent {
  out.moveX = (v & 15) / 7 - 1;
  out.moveY = ((v >> 4) & 15) / 7 - 1;
  const b = v >> 8;
  out.jump = (b & 1) !== 0;
  out.attack = (b & 2) !== 0;
  out.kick = (b & 4) !== 0;
  out.interact = (b & 8) !== 0;
  out.cycle = (b & 16) !== 0;
  return out;
}
