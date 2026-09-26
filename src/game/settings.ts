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
}

const DEFAULTS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  screenShake: 1,
  gore: true,
  damageNumbers: true,
  fullscreen: false,
};

export const settings: Settings = load('settings', DEFAULTS);

export function saveSettings(): void {
  save('settings', settings);
}
