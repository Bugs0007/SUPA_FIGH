import { applyHit, hitWasBlocked, sameTeam } from './combat';
import { DT, GROUND_DECEL } from './constants';
import type { RosterSpecial } from './data/rosterSpecials';
import type { Fighter } from './fighter';
import { meleeMuls } from './hero';
import { deployedPartner } from './pokemon';
import type { World } from './world';

const chest = (f: Fighter) => f.y - f.h / 2;
const specialHero = (f: Fighter) => f.hero || 'scrapper';

function canReach(w: World, f: Fighter, o: Fighter): boolean {
  return o !== f && o.alive && !o.gone && !o.trainer?.mounted && o.master !== f.id &&
    (w.settings.friendlyFire || !sameTeam(f, o)) && !w.map.raycastSolid(f.x, chest(f), o.x, chest(o));
}

function hit(w: World, f: Fighter, o: Fighter, damage: number, vx: number, vy: number, stun: number,
  knockdown = false, kind: 'melee' | 'kick' | 'explosion' = 'melee'): boolean {
  const mul = meleeMuls(f);
  return applyHit(w, o, {
    damage: damage * mul.dmg, kbX: vx * mul.knock, kbY: vy * mul.knock, stun, knockdown,
    x: o.x, y: chest(o), attacker: f.id, weapon: specialHero(f) + ':special', kind,
  }) && !hitWasBlocked();
}

function zone(w: World, f: Fighter, x: number, y: number, radius: number, height: number,
  visit: (o: Fighter) => void): void {
  for (const o of w.fighters) {
    if (!canReach(w, f, o) || Math.hypot((o.x - x) / radius, (chest(o) - y) / height) > 1) continue;
    visit(o);
    if (f.state !== 'special') break;
  }
}

function markTarget(w: World, f: Fighter, reach: number): Fighter | undefined {
  let target: Fighter | undefined;
  let best = reach;
  const distance = (o: Fighter): number => {
    const dx = (o.x - f.x) * f.facing;
    return dx < -5 || o.pokemon?.move === 'recall' || !canReach(w, f, o) ? Infinity : Math.hypot(dx, chest(o) - chest(f));
  };
  for (const o of w.fighters) {
    const d = distance(o);
    if (d <= best) {
      target = o;
      best = d;
    }
  }
  const primary = target && deployedPartner(w, target);
  if (primary && distance(primary) <= reach) return primary;
  return target;
}

function absorbShots(w: World, f: Fighter, x: number, y: number, radius: number, energyOnly: boolean): void {
  for (const b of w.bullets) {
    if (!b.active || b.owner === f.id || (energyOnly && b.kind !== 'ki' && b.kind !== 'chakra')) continue;
    const owner = w.fighters[b.owner];
    if (owner && (owner.master === f.id || (!w.settings.friendlyFire && sameTeam(f, owner)))) continue;
    const dx = b.vx * DT, dy = b.vy * DT;
    const t = Math.max(0, Math.min(1, ((x - b.x) * dx + (y - b.y) * dy) / (dx * dx + dy * dy || 1)));
    const bx = b.x + dx * t, by = b.y + dy * t;
    if (Math.hypot(bx - x, by - y) > radius || !w.map.clearShot(x, y, bx, by)) continue;
    b.active = false;
    w.emit({ t: 'projectileFizzle', x: bx, y: by });
  }
}

/** The marked point is locked at cast time so a rival can move out of a telegraphed area. */
export function beginRosterSpecial(w: World, f: Fighter, spec: RosterSpecial): void {
  f.formComboCd = spec.cooldown;
  f.charge = 0;
  const marked = ['law', 'rukia', 'byakuya', 'yuno'].includes(f.hero);
  const target = marked ? markTarget(w, f, spec.reach) : undefined;
  f.lockOn = target?.id ?? -1;
  f.anchorX = target?.x ?? f.x + f.facing * (marked ? spec.reach * 0.7 : spec.reach * 0.55);
  f.anchorY = f.hero === 'rukia' ? (target?.y ?? f.y) - 1 : target ? chest(target) : chest(f);
  emit(w, f, spec, 'start', 0);
}

function focusRadius(f: Fighter, spec: RosterSpecial, pulse: number): number {
  switch (f.hero) {
    case 'zoro': return spec.reach;
    case 'sanji': return 27;
    case 'law': return 24;
    case 'rukia': return 26;
    case 'byakuya': return 39;
    case 'yuno': return pulse === 0 ? 42 : 34;
    case 'yami': return 34;
    case 'asta': return 38;
    case 'vegeta': return pulse === 0 ? 20 : 30;
    default: return spec.reach * 0.65;
  }
}

function emit(w: World, f: Fighter, spec: RosterSpecial, phase: 'start' | 'active' | 'end', pulse: number): void {
  w.emit({ t: 'rosterSpecial', f: f.id, hero: specialHero(f), level: f.powerLevel, phase,
    ox: f.x, oy: chest(f), x: f.anchorX, y: f.anchorY, facing: f.facing, radius: focusRadius(f, spec, pulse), pulse });
}

function resolveBeat(w: World, f: Fighter, spec: RosterSpecial, pulse: number): void {
  const facing = f.facing;
  const y = chest(f);
  const forward = (distance: number) => f.x + distance * facing;
  const radius = focusRadius(f, spec, pulse);

  // Motion-based moves keep their effects attached to the current contact point.
  if (f.hero === 'sanji' || f.hero === 'ichigo') {
    f.anchorX = forward(f.hero === 'sanji' ? 8 : 16);
    f.anchorY = y;
  }
  if (f.hero === 'zoro') {
    const wall = w.map.raycastSolid(f.x, y, forward(spec.reach), y);
    const span = wall ? Math.max(0, spec.reach * wall.t - f.w / 2) : spec.reach;
    f.anchorX = forward(span);
    f.anchorY = y;
  }
  if (f.hero === 'vegeta' && pulse === 1 && !f.swingHit.length) return;
  if (f.hero === 'law' && pulse === 1) {
    const lifted = w.fighters[f.lockOn];
    if (!lifted || !f.swingHit.includes(lifted.id) || !canReach(w, f, lifted)) return;
    if (Math.hypot(lifted.x - f.anchorX, chest(lifted) - f.anchorY) > 52) return;
    f.anchorX = lifted.x;
    f.anchorY = chest(lifted);
  }
  emit(w, f, spec, 'active', pulse);

  const { anchorX: x, anchorY: center } = f;
  switch (f.hero) {
    case 'vegeta': {
      if (pulse === 0) {
        zone(w, f, forward(17), y, radius, 16, o => {
          if (!hit(w, f, o, 7, 32 * facing, 0, 0.23)) return;
          if (!f.swingHit.length) {
            f.anchorX = o.x;
            f.anchorY = chest(o);
          }
          f.swingHit.push(o.id);
        });
      } else zone(w, f, x, center, radius, 28, o => hit(w, f, o, 15, 220 * Math.sign(o.x - f.x || facing), -95, 0.26, true, 'explosion'));
      break;
    }
    case 'zoro': {
      const span = Math.abs(x - f.x);
      zone(w, f, (x + f.x) / 2, center, Math.max(1, span / 2), 14,
        o => hit(w, f, o, 21, 85 * facing, -30, 0.34));
      break;
    }
    case 'sanji': {
      const last = pulse === 2;
      zone(w, f, x, center, radius, 24, o => hit(w, f, o, last ? 9 : 5,
        (last ? 110 : 20) * facing, last ? -270 : -20, last ? 0.30 : 0.16, last, 'kick'));
      break;
    }
    case 'law': {
      const o = w.fighters[f.lockOn];
      if (!o || !canReach(w, f, o)) break;
      if (pulse === 0 && Math.hypot(o.x - x, chest(o) - center) <= radius) {
        if (hit(w, f, o, 5, 0, -188, 0.24)) f.swingHit.push(o.id);
      } else if (pulse === 1) hit(w, f, o, 15, 0, 385 - o.vy, 0.32, true);
      break;
    }
    case 'ichigo':
      zone(w, f, x, center - pulse * 11, pulse ? 30 : 24, pulse ? 29 : 17,
        o => hit(w, f, o, pulse ? 13 : 8, (pulse ? 115 : 35) * facing, pulse ? 260 - o.vy : -150, 0.25, pulse === 1));
      break;
    case 'rukia':
      zone(w, f, x, center - 10, radius, pulse ? 30 : 13, o => {
        if (pulse === 0 && hit(w, f, o, 4, 0, 0, 0.23)) o.vx *= 0.15;
        else if (pulse === 1) hit(w, f, o, 16, 0, -242, 0.28, true);
      });
      break;
    case 'byakuya':
      zone(w, f, x, center - pulse * 2, radius, 34,
        o => hit(w, f, o, pulse === 2 ? 9 : 5, 38 * facing, pulse === 2 ? 138 : 12, 0.19));
      break;
    case 'asta':
      absorbShots(w, f, x, center, radius, true);
      if (f.burn > 0) {
        f.burn = f.burnAcc = 0;
        f.burnBy = -1;
        f.burnStyle = 'fire';
        w.emit({ t: 'extinguish', f: f.id });
      }
      zone(w, f, x, center, radius * 0.6, 22, o => hit(w, f, o, 16, 150 * facing, -40, 0.29));
      break;
    case 'yuno':
      zone(w, f, x, center, radius, 32, o => {
        const final = pulse === 2;
        hit(w, f, o, final ? 11 : 4, final ? 25 * facing : (x - o.x) * 5 - o.vx * 0.5,
          final ? -295 : -40, final ? 0.32 : 0.18, final);
      });
      break;
    case 'yami':
      if (pulse === 1) zone(w, f, x, center, radius, 22, o => hit(w, f, o, 21, 170 * facing, -55, 0.32));
      break;
    default:
      zone(w, f, forward(18), y, radius, 18, o => hit(w, f, o, 13, 235 * facing, -90, 0.26, true));
  }
}

/** Update scheduled hits and movement. The fighter state handles ordinary physics and recovery. */
export function stepRosterSpecial(w: World, f: Fighter, spec: RosterSpecial, dt: number): boolean {
  const t = f.stateTime;
  const age = t - spec.windup;
  const distance = (f.anchorX - f.x) * f.facing;
  if (f.hero === 'zoro' && age > 0 && age < 0.16 && distance > 0) {
    f.vx = f.facing * Math.min(680, distance / dt);
  } else if ((f.hero === 'sanji' && age >= 0 && age < 0.30) || (f.hero === '' && age >= 0 && age < 0.10)) {
    f.vx = f.facing * (f.hero === 'sanji' ? 124 : 158);
  } else {
    f.vx = Math.sign(f.vx) * Math.max(0, Math.abs(f.vx) - GROUND_DECEL * dt);
  }
  if (f.hero === 'yami' && age >= 0 && t <= spec.beats[1]) {
    absorbShots(w, f, f.anchorX, f.anchorY, focusRadius(f, spec, 0), false);
  }
  const beat = spec.beats[f.charge];
  if (beat !== undefined && t >= beat) {
    resolveBeat(w, f, spec, f.charge);
    f.charge++;
  }
  if (f.state !== 'special' || t < spec.duration) return false;
  emit(w, f, spec, 'end', spec.beats.length - 1);
  return true;
}
