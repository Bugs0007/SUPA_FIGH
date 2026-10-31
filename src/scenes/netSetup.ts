// Turns a network match start (what the server sent) into the MatchSceneData the Match scene plays.
// Phaser-free: looks come from other players' devices, so every one goes through sanitizeAppearance.

import { PLAYER_PRESETS, randomAppearance, sanitizeAppearance } from '../art/appearance';
import { heroLook } from '../art/heroArt';
import type { RemoteSim } from '../net/remoteSim';
import type { MatchSceneData, PlayerSetup } from './MatchScene';

/** one colour per fighter slot (panels, name tags, scoreboard pips) */
export const NET_COLORS = [0xea4a4a, 0x4a8af0, 0x5ac85a, 0xf8c840, 0xd070e8, 0x40d0d0, 0xf08a30, 0xe8e8f0, 0xa0d040, 0xf070a0];

export function netMatchData(sim: RemoteSim): MatchSceneData {
  const cfg = sim.match.cfg;
  const players: PlayerSetup[] = cfg.fighters.map((spawn, i) => {
    const wire = sim.looks[i] ?? {};
    const local = sim.mine.indexOf(i);
    const base = PLAYER_PRESETS[i % PLAYER_PRESETS.length];
    let seed = cfg.seed + i * 977;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const look = spawn.isBot ? randomAppearance(rand) : sanitizeAppearance(wire, base);
    return {
      spawn,
      look: heroLook(spawn.hero ?? '', look),
      color: NET_COLORS[i % NET_COLORS.length],
      label: spawn.name,
      // local players get the keyboard / pad / touch layouts (kb0, kb1) and an HUD panel; everyone else is just drawn
      input: local >= 0 ? 'kb' + local : spawn.isBot ? 'bot' : 'remote',
    };
  });
  return { config: cfg, players, net: sim };
}
