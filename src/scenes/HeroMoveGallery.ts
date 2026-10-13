import Phaser from 'phaser';
import { HERO_ART } from '../art/heroArt';
import { moveLook } from '../art/heroMoves';
import { VIEW_H, VIEW_W } from '../game/display';
import { keyboard } from '../input/keyboard';
import { HEROES, superFistFor } from '../sim/data/heroes';
import { newBullet, type Bullet } from '../sim/projectile';
import { getMap } from '../sim/map/maps';
import { DEFAULT_WORLD_SETTINGS, World } from '../sim/world';
import { FighterView } from '../render/FighterView';
import { Fx } from '../render/Fx';
import { HeroFx } from '../render/HeroFx';

/** An animated art-study page using the exact same rigs and effects as a match. */
export class HeroMoveGallery {
  readonly world: World;
  readonly views: FighterView[];
  readonly heroFx: HeroFx;
  private fx: Fx;
  private t = 0;
  private lastLoop = -1;
  private spiritBalls: Bullet[] = [];
  private mode: 'base' | 'second' | 'super';
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private buttons: Phaser.GameObjects.BitmapText[] = [];
  private cameras: Phaser.Cameras.Scene2D.Camera[] = [];
  private stage: Phaser.GameObjects.GameObject[];
  private ui: Phaser.GameObjects.GameObject[];

  constructor(private scene: Phaser.Scene, readonly hero: string) {
    const params = new URLSearchParams(location.search);
    this.mode = params.get('move') === 'super' ? 'super' : params.get('move') === 'second' ? 'second' : 'base';
    const before = new Set(scene.children.list);
    this.world = new World(getMap('test'), Array.from({ length: 5 }, (_, level) => ({ name: '', hero, isBot: false, team: 0, upJumps: false })), { ...DEFAULT_WORLD_SETTINGS, weaponSpawnRate: 0 }, 42);
    this.views = this.world.fighters.slice(0, 5).map((f, level) => {
      f.x = f.px = 40 + level * 128;
      f.y = f.py = 140;
      f.facing = 1;
      f.invuln = 0;
      f.power = level > 0 ? 'hero' : '';
      f.powerLevel = level;
      f.formHp = level * 30;
      return new FighterView(scene, f, HERO_ART[hero].look, 0xffffff, '');
    });
    this.fx = new Fx(scene, this.world.map, null, 220);
    this.heroFx = new HeroFx(scene, this.world, this.views, this.fx, 0.42);
    if (hero === 'goku') {
      this.spiritBalls = this.views.map(v => Object.assign(newBullet(), { owner: v.fighter.id, kind: 'ki', weapon: 'goku:super' }));
      this.world.bullets.push(...this.spiritBalls);
    }
    this.stage = scene.children.list.filter(o => !before.has(o));
    scene.cameras.main.ignore(this.stage);

    const uiBefore = new Set(scene.children.list);
    const g = scene.add.graphics();
    for (let level = 0; level <= 4; level++) {
      const x = level * 128;
      g.fillStyle(level % 2 ? 0x171e30 : 0x121929).fillRect(x + 3, 56, 122, 259);
      g.lineStyle(1, level === 0 ? 0x475267 : moveLook(hero, level).spark, 0.35).strokeRect(x + 3, 56, 122, 259);
      const form = level === 0 ? 'BASE' : HEROES[hero].forms[level - 1].name.replace('SUPER SAIYAN', 'SSJ').replace(' CLOAK', '');
      scene.add.bitmapText(x + 64, 280, 'pxo', form).setOrigin(0.5).setTint(level === 0 ? 0xc4d3e9 : moveLook(hero, level).spark);
      this.labels.push(scene.add.bitmapText(x + 64, 299, 'sm', '').setOrigin(0.5).setTint(0xa5b7d2));
    }
    scene.add.bitmapText(12, 12, 'pxo', `${HEROES[hero].name} / FORM ABILITIES`).setScale(2).setTint(0xffdf8a);
    for (const [i, mode] of (['base', 'second', 'super'] as const).entries()) {
      const button = scene.add.bitmapText(350 + i * 98, 22, 'pxo', `${i + 1} ${mode.toUpperCase()}`).setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => this.select(mode));
      this.buttons.push(button);
    }
    scene.add.bitmapText(320, 335, 'sm', '1/2/3: ABILITY   N/L/G: HERO   0: RESTART PREVIEW').setOrigin(0.5).setTint(0xa5b7d2);
    this.ui = scene.children.list.filter(o => !uiBefore.has(o));
    for (let level = 0; level <= 4; level++) {
      const cam = scene.cameras.add().setName(`hero-study-${level}`);
      cam.ignore([...before, ...this.ui]);
      this.cameras.push(cam);
    }
    this.layout();
    scene.game.events.on('rescale', this.layout, this);
    scene.events.once('shutdown', () => this.destroy());
    this.select(this.mode);
  }

  private layout(): void {
    const k = (this.scene.registry.get('scale') as number) ?? 1;
    this.scene.cameras.main.setZoom(k).centerOn(VIEW_W / 2, VIEW_H / 2);
    this.cameras.forEach((cam, i) => {
      let zoom = 2;
      let center = 10;
      let cy = 124;
      if (this.mode === 'super' && i > 0 && this.hero === 'luffy') {
        const s = superFistFor('luffy', i)!;
        const right = s.range * 0.07 + s.fist! + 9;
        zoom = Math.min(2, 120 / (right + 32));
        center = Math.max(10, (right - 20) / 2);
      } else if (this.mode === 'super' && i > 0 && this.hero === 'goku') {
        const b = HEROES.goku.super.bomb!;
        const r = b.size + b.sizePerLevel * (i - 1);
        zoom = Math.min(2, 120 / (r * 3 + 38));
        center = (r + 22) / 2;
        cy = 105;
      }
      cam.setViewport((i * 128 + 4) * k, 60 * k, 120 * k, 210 * k).setZoom(k * zoom).centerOn(this.views[i].fighter.x + center, cy);
    });
  }

  private select(mode: 'base' | 'second' | 'super'): void {
    this.mode = mode;
    this.t = 0;
    this.lastLoop = -1;
    this.buttons.forEach((button, i) => button.setTint((['base', 'second', 'super'] as const)[i] === mode ? 0xffdf8a : 0x9baec9));
    this.labels.forEach((label, i) => {
      const name = mode === 'base' ? moveLook(this.hero, i).name : mode === 'second' ? HEROES[this.hero].second.name : i > 0 ? HEROES[this.hero].super.names[i - 1] : 'POWER ORB REQUIRED';
      const words = name.split(' ');
      const split = words.length > 2 ? Math.ceil(words.length / 2) : words.length;
      label.setText([words.slice(0, split).join(' '), words.slice(split).join(' ')].filter(Boolean).join('\n'));
      if (mode === 'super' && i > 0 && this.hero === 'luffy') label.setText(`${name}\nRANGE ${superFistFor('luffy', i)!.range} / FIST ${superFistFor('luffy', i)!.fist}`);
    });
    this.layout();
  }

  update(dt: number): void {
    for (const [key, mode] of [['Digit1', 'base'], ['Digit2', 'second'], ['Digit3', 'super']] as const) if (keyboard.justPressed(key)) this.select(mode);
    if (keyboard.justPressed('Digit0')) this.select(this.mode);
    for (const [key, hero] of [['KeyN', 'naruto'], ['KeyL', 'luffy'], ['KeyG', 'goku']] as const) if (keyboard.justPressed(key)) {
      const url = new URL(location.href);
      url.searchParams.set('hero', hero);
      url.searchParams.set('move', this.mode);
      location.href = url.toString();
      return;
    }
    this.t += dt;
    const loop = Math.floor(this.t / 3.6);
    const phase = this.t % 3.6;
    const firing = phase >= 1.4 && phase < 2.4;
    for (const [level, v] of this.views.entries()) {
      const f = v.fighter;
      f.vx = f.vy = 0;
      f.state = phase > 0.5 && phase < 2.4 ? 'special' : 'normal';
      f.stateTime = firing ? 0.15 + (phase - 1.4) * 0.3 : Math.max(0, phase - 0.5) * 0.12;
      f.stretchLen = 0;
      f.stretchAngle = 0;
      f.charge = Math.max(0.05, Math.min(1, (phase - 0.5) / 0.9));
      f.recoverAt = 0;
      if (this.mode === 'base') f.specialKind = this.hero === 'naruto' ? 'rasengan' : this.hero === 'luffy' ? 'pistol' : 'blink';
      else if (this.mode === 'second') f.specialKind = this.hero === 'naruto' ? 'cast' : this.hero === 'luffy' ? 'gatling' : firing ? 'beam' : 'beamCharge';
      else f.specialKind = this.hero === 'luffy' ? 'superFist' : 'bomb';
      if (this.mode === 'super' && level === 0) f.state = 'normal';
      if (f.state === 'special') {
        if (this.hero === 'luffy' && f.specialKind !== 'gatling') {
          const s = superFistFor('luffy', level)!;
          f.stretchLen = (this.mode === 'super' ? s.range * 0.07 : 28) * Math.min(1, Math.max(0, (phase - 0.5) / 0.6));
          f.beamWidth = this.mode === 'super' ? s.fist! : 0;
        } else if (this.hero === 'goku' && firing && this.mode === 'second') {
          f.stretchLen = 29;
          f.beamWidth = 2.5 + level * 0.35;
        }
      }
      if (this.hero === 'goku') {
        const ball = this.spiritBalls[level];
        const b = HEROES.goku.super.bomb!;
        ball.active = this.mode === 'super' && level > 0 && firing;
        ball.size = b.size + b.sizePerLevel * Math.max(0, level - 1);
        ball.x = ball.px = f.x + ball.size + 12 + (phase - 1.4) * 18;
        ball.y = ball.py = f.y - 19;
        ball.vx = 260;
        ball.traveled = Math.max(0, phase - 1.4) * 18;
        if (ball.active) f.charge = -2;
      }
      v.update(1, dt, this.t, this.t);
      v.tag.setVisible(false);
      if (firing && loop !== this.lastLoop && this.hero === 'goku' && this.mode === 'base') this.heroFx.choreography.blink(f.id, f.x - 14, f.y - 12, f.x, f.y - 12);
    }
    if (firing) this.lastLoop = loop;
    this.heroFx.sync(1, dt, this.t);
    this.fx.update(dt);
  }

  private destroy(): void {
    this.scene.game.events.off('rescale', this.layout, this);
    this.heroFx.destroy();
    this.fx.destroy();
    for (const view of this.views) view.destroy();
    for (const cam of this.cameras) this.scene.cameras.remove(cam);
  }
}
