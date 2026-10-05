import { load, save } from './storage';

export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  /** 0..1 screen shake intensity */
  screenShake: number;
  gore: boolean;
  damageNumbers: boolean;
  fullscreen: boolean;
  /** default bot skill for quick matches */
  botDifficulty: 'easy' | 'normal' | 'hard' | 'expert';
  /** number of bots in a quick match from the title screen */
  quickBots: number;
  /** instant replay of every round-ending kill */
  replays: boolean;
  /** quick match from the title: map id or 'random', and 1 or 2 keyboard players */
  quickMap: string;
  quickPlayers: number;
}

const DEFAULTS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  screenShake: 1,
  gore: true,
  damageNumbers: true,
  fullscreen: false,
  botDifficulty: 'normal',
  quickBots: 3,
  replays: true,
  quickMap: 'test',
  quickPlayers: 2,
};

export const settings: Settings = load('settings', DEFAULTS);

export function saveSettings(): void {
  save('settings', settings);
}
