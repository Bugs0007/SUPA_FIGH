// Post-match awards: pure function of match stats (unit tested). Funny titles, one per fighter max.

import type { FighterStats } from './match';

export interface Award {
  fighter: number;
  title: string;
  detail: string;
}

interface AwardDef {
  title: string;
  /** higher = better candidate; return null to disqualify */
  score: (s: FighterStats) => number | null;
  detail: (s: FighterStats) => string;
}

const AWARDS: AwardDef[] = [
  { title: 'MVP', score: (s) => (s.kills > 0 ? s.kills * 3 + s.roundsWon * 2 + s.damage / 50 : null), detail: (s) => `${s.kills} KILLS` },
  { title: 'DEMOLITION EXPERT', score: (s) => (s.explosiveKills > 0 ? s.explosiveKills : null), detail: (s) => `${s.explosiveKills} EXPLOSIVE KILLS` },
  { title: 'PYROMANIAC', score: (s) => (s.fireKills > 0 ? s.fireKills : null), detail: (s) => `${s.fireKills} TOASTED` },
  { title: 'BARE KNUCKLES', score: (s) => (s.meleeKills > 1 ? s.meleeKills : null), detail: (s) => `${s.meleeKills} MELEE KILLS` },
  { title: 'LANDSCAPER', score: (s) => (s.envKills > 0 ? s.envKills : null), detail: (s) => `${s.envKills} ENVIRONMENTAL KILLS` },
  { title: 'DAMAGE DEALER', score: (s) => (s.damage > 50 ? s.damage : null), detail: (s) => `${Math.round(s.damage)} DAMAGE` },
  { title: 'BUTTERFINGERS', score: (s) => (s.suicides > 0 ? s.suicides : null), detail: (s) => `${s.suicides} SELF-DESTRUCTS` },
  { title: 'SURVIVOR', score: (s) => (s.deaths === 0 ? 1 + s.roundsWon : null), detail: () => 'NEVER DIED' },
  { title: 'PACIFIST', score: (s) => (s.damage < 20 ? 100 - s.damage : null), detail: (s) => `${Math.round(s.damage)} DAMAGE ALL MATCH` },
  { title: 'PUNCHING BAG', score: (s) => (s.deaths > 0 ? s.deaths : null), detail: (s) => `DIED ${s.deaths} TIMES` },
];

/** Pick up to `max` awards, each fighter at most once, in AWARDS priority order. */
export function computeAwards(stats: FighterStats[], max = 5): Award[] {
  const out: Award[] = [];
  const taken = new Set<number>();
  for (const a of AWARDS) {
    if (out.length >= max) break;
    let best = -1;
    let bestScore = -Infinity;
    stats.forEach((s, i) => {
      if (taken.has(i)) return;
      const sc = a.score(s);
      if (sc === null) return;
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    });
    if (best >= 0) {
      taken.add(best);
      out.push({ fighter: best, title: a.title, detail: a.detail(stats[best]) });
    }
  }
  return out;
}
