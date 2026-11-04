import Phaser from 'phaser';
import { HERO_ART } from '../art/heroArt';
import { moveLook } from '../art/heroMoves';
import { VIEW_H, VIEW_W } from '../game/display';
import { keyboard } from '../input/keyboard';
import { HEROES, CLONE_SLINGSHOT, JET_BAZOOKA, ULT_WINDUP, avatarLaunch, superFistFor } from '../sim/data/heroes';
import { newBullet, type Bullet } from '../sim/projectile';
import { getMap } from '../sim/map/maps';
import { DEFAULT_WORLD_SETTINGS, World } from '../sim/world';
import { FighterView } from '../render/FighterView';
import { Fx } from '../render/Fx';
import { HeroFx } from '../render/HeroFx';
import { drawBlackFlames } from '../render/HeroComboArt';
import { fighterPreview } from './ui';
import { PLAYER_PRESETS } from '../art/appearance';

export const MODES=['base','second','super','combo','special','guard'] as const;
export type MoveMode=(typeof MODES)[number];

/** Greedy word wrap into lines of at most `max` characters. */
function wrapLines(text: string, max: number): string {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ').filter(Boolean)) {
    if (line && (line + ' ' + word).length > max) {
      out.push(line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) out.push(line);
  return out.join('\n');
}

/** One line of text under the columns of the in-game fighter viewer. */
function describe(hero: string, mode: MoveMode): string {
  const h = HEROES[hero];
  switch (mode) {
    case 'base': return h.base.desc;
    case 'second': return h.second.desc;
    case 'super': return `${h.super.desc} ${hero === 'luffy' ? '' : `LOADS IN ${ULT_WINDUP} SECONDS: BLOCK, RUN OR BREAK IT.`}`;
    case 'combo': return `${h.comboName}: PUNCH, PUNCH, PUNCH, THEN A KICK THAT KNOCKS DOWN.`;
    case 'guard': return 'HOLD BLOCK TO GUARD: HEAVY ATTACKS AND ULTIMATES STILL CHIP YOUR HEALTH.';
    default:
      return hero === 'sasuke' ? 'CHIDORI + PUNCH CALLS KIRIN: LIGHTNING THAT HOLDS THE ENEMY STUNNED.'
        : hero === 'naruto' ? 'SHADOW CLONES + PUNCH: A CLONE SWINGS NARUTO INTO THE ENEMY (CLONE SLINGSHOT).'
        : hero === 'luffy' ? 'PISTOL + PUNCH: GRAB AND KICK AN ENEMY, OR SLINGSHOT FROM AN ANCHOR (JET BAZOOKA).'
        : 'INSTANT TRANSMISSION + PUNCH: VANISH AND STRIKE FROM BEHIND (VANISH STRIKE).';
  }
}

/** An animated art-study page using the exact same rigs and effects as a match. */
export class HeroMoveGallery {
  readonly world: World;
  readonly views: FighterView[];
  readonly heroFx: HeroFx;
  private fx: Fx;
  private t = 0;
  private lastLoop = -1;
  private spiritBalls: Bullet[] = [];
  private mode: MoveMode;
  private aim=0;
  private jetPreview:'kick'|'sling'='sling';
  private targets:Phaser.GameObjects.Container[]=[];
  private targetFx:Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private buttons: Phaser.GameObjects.BitmapText[] = [];
  private cameras: Phaser.Cameras.Scene2D.Camera[] = [];
  private stage: Phaser.GameObjects.GameObject[];
  private ui: Phaser.GameObjects.GameObject[];

  private note: Phaser.GameObjects.BitmapText | null = null;

  /** `embedded`: the in-game fighter viewer (no URL parameters, no developer hotkeys, a description under the columns). */
  constructor(private scene: Phaser.Scene, readonly hero: string, private embedded = false, move: MoveMode = 'base') {
    const params = new URLSearchParams(embedded ? '' : location.search);
    this.jetPreview=params.get('jet')==='kick'?'kick':'sling';
    this.aim=Math.max(-1.5,Math.min(1.5,Number(params.get('aim'))||0));
    this.mode = embedded ? move : MODES.find(m=>m===params.get('move'))??'base';
    const before = new Set(scene.children.list);
    this.world = new World(getMap('test'), Array.from({ length: 5 }, (_, level) => ({ name: '', hero, isBot: false, team: 0, upJumps: false })), { ...DEFAULT_WORLD_SETTINGS, weaponSpawnRate: 0 }, 42);
    this.views = this.world.fighters.slice(0, 5).map((f, level) => {
      f.x = f.px = 40 + level * 512;
      f.y = f.py = 140;
      f.facing = 1;
      f.invuln = 0;
      f.power = level > 0 ? 'hero' : '';
      f.powerLevel = level;
      f.formHp = level * 30;
      return new FighterView(scene, f, HERO_ART[hero].look, 0xffffff, '');
    });
    this.fx = new Fx(scene, this.world.map, null, 220);
    this.heroFx = new HeroFx(scene, this.world, this.views, this.fx, 0.42, true);
    this.targetFx=scene.add.graphics().setDepth(58);
    if(hero==='sasuke'||hero==='luffy')this.targets=this.views.map(v=>fighterPreview(scene,PLAYER_PRESETS[0],v.fighter.x+33,v.fighter.y,.8).setDepth(40).setVisible(false));
    if (hero === 'goku' || hero === 'sasuke') {
      this.spiritBalls = this.views.map(v => Object.assign(newBullet(), { owner: v.fighter.id, kind: 'ki', weapon: hero + ':super' }));
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
      const form = level === 0 ? 'BASE' : HEROES[hero].forms[level - 1].name.replace('SUPER SAIYAN', 'SSJ').replace(' CLOAK', '').replace(' / PERFECT SUSANOO', '');
      scene.add.bitmapText(x + 64, 280, 'pxo', form).setOrigin(0.5).setTint(level === 0 ? 0xc4d3e9 : moveLook(hero, level).spark);
      this.labels.push(scene.add.bitmapText(x + 64, 299, 'sm', '').setOrigin(0.5).setTint(0xa5b7d2));
    }
    scene.add.bitmapText(12, 12, 'pxo', `${HEROES[hero].name} / FORM ABILITIES`).setScale(2).setTint(0xffdf8a);
    for (const [i, mode] of MODES.entries()) {
      const button = scene.add.bitmapText(270 + i * 61, 22, 'sm', `${i + 1} ${mode.toUpperCase()}`).setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => this.select(mode));
      this.buttons.push(button);
    }
    if (embedded) this.note = scene.add.bitmapText(320, 318, 'sm', '').setOrigin(0.5, 0).setTint(0xc4d3e9).setCenterAlign();
    else scene.add.bitmapText(320, 335, 'sm', '1-3: ABILITY  4: COMBO  5: SPECIAL  6: GUARD  N/L/G/S: HERO').setOrigin(0.5).setTint(0xa5b7d2);
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
      if(this.mode==='special'){zoom=1.3;center=14;cy=103;}
      if(this.mode==='special'&&this.hero==='sasuke'){zoom=.75;center=14;cy=90;}
      if(this.mode==='combo'&&this.hero==='sasuke'&&i>=3){
        zoom=i===4?1.15:1.45;center=0;cy=108;
      } else if (this.mode === 'super' && i > 0 && this.hero === 'luffy') {
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
      } else if (this.hero === 'sasuke' && this.mode === 'super' && i >= 3) {
        zoom = .5;
        center = -4;
        cy = 52;
      } else if(this.hero==='naruto'&&this.mode==='super'&&i===4){
        zoom=.34;center=-26;cy=40;
      }
      if(this.mode==='super'&&this.aim!==0){
        if(this.hero==='sasuke'&&i>=3){zoom=.42;center=-4;cy=52;}
        if(this.hero==='naruto'&&i===4){zoom=.3;center=-26;cy=40;}
      }
      cam.setViewport((i * 128 + 4) * k, 60 * k, 120 * k, 210 * k).setZoom(k * zoom).centerOn(this.views[i].fighter.x + center, cy);
    });
  }

  private select(mode: MoveMode): void {
    this.mode = mode;
    this.t = 0;
    this.lastLoop = -1;
    this.buttons.forEach((button, i) => button.setTint(MODES[i] === mode ? 0xffdf8a : 0x9baec9));
    this.labels.forEach((label, i) => {
      const name = mode==='guard'?'HOLD BLOCK':mode==='special'?(this.hero==='sasuke'?'KIRIN':i===0?'POWER ORB REQUIRED':this.hero==='naruto'?'CLONE SLINGSHOT':this.hero==='luffy'?'JET BAZOOKA':'VANISH STRIKE'):mode==='combo'?HEROES[this.hero].comboName : mode === 'base' ? moveLook(this.hero, i).name : mode === 'second' ? this.hero==='sasuke'&&i>=3?'AMATERASU / RANGE 240':HEROES[this.hero].second.name : i > 0 ? HEROES[this.hero].super.names[i - 1] : 'POWER ORB REQUIRED';
      const words = name.split(' ');
      const split = words.length > 2 ? Math.ceil(words.length / 2) : words.length;
      label.setText([words.slice(0, split).join(' '), words.slice(split).join(' ')].filter(Boolean).join('\n'));
      if(mode==='special'&&this.hero==='luffy'&&i>0)label.setText(this.jetPreview==='kick'?'JET GRAB KICK':'JET SLINGSHOT');
      if (mode === 'super' && i > 0 && this.hero === 'luffy') label.setText(`${name}\nRANGE ${superFistFor('luffy', i)!.range} / FIST ${superFistFor('luffy', i)!.fist}`);
    });
    this.note?.setText(wrapLines(describe(this.hero, mode), 86));
    this.layout();
  }

  /** Next / previous move tab (the fighter viewer's left / right). */
  cycle(d: number): void {
    this.select(MODES[(MODES.indexOf(this.mode) + d + MODES.length) % MODES.length]);
  }

  update(dt: number): void {
    for (const [key, mode] of [['Digit1', 'base'], ['Digit2', 'second'], ['Digit3', 'super'],['Digit4','combo'],['Digit5','special'],['Digit6','guard']] as const) if (keyboard.justPressed(key)) this.select(mode);
    if (keyboard.justPressed('Digit0')) this.select(this.mode);
    if (!this.embedded) for (const [key, hero] of [['KeyN', 'naruto'], ['KeyL', 'luffy'], ['KeyG', 'goku'], ['KeyS', 'sasuke']] as const) if (keyboard.justPressed(key)) {
      const url = new URL(location.href);
      url.searchParams.set('hero', hero);
      url.searchParams.set('move', this.mode);
      location.href = url.toString();
      return;
    }
    this.t += dt;
    // a gathered ultimate loads for ULT_WINDUP seconds (the spirits form during it), the rest of the moves loop in 3.6 s
    const superMode = this.mode === 'super' && this.hero !== 'luffy';
    const wind = superMode ? ULT_WINDUP : 0.9;
    const fireAt = 0.5 + wind;
    const period = fireAt + 2.2;
    const loop = Math.floor(this.t / period);
    const phase = this.t % period;
    const firing = phase >= fireAt && phase < fireAt + 1;
    for (const [level, v] of this.views.entries()) {
      const f = v.fighter;
      f.vx = f.vy = 0;
      f.state = phase > 0.5 && phase < fireAt + 1 ? 'special' : 'normal';
      f.stateTime = superMode ? (firing ? ULT_WINDUP + (phase - fireAt) * 0.3 : Math.max(0, phase - 0.5)) : firing ? 0.15 + (phase - fireAt) * 0.3 : Math.max(0, phase - 0.5) * 0.12;
      f.stretchLen = 0;
      f.stretchAngle = this.mode==='super'?this.aim:0;
      f.charge = Math.max(0.05, Math.min(1, (phase - 0.5) / wind));
      f.recoverAt = 0;
      if (this.mode === 'base') f.specialKind = this.hero === 'naruto' || this.hero === 'sasuke' ? 'rasengan' : this.hero === 'luffy' ? 'pistol' : 'blink';
      else if (this.mode === 'second') f.specialKind = this.hero === 'naruto' ? 'cast' : this.hero === 'luffy' ? 'gatling' : this.hero === 'sasuke' ? 'fireball' : firing ? 'beam' : 'beamCharge';
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
      if (this.hero === 'sasuke') {
        const ball = this.spiritBalls[level], second = this.mode === 'second';
        const b = HEROES.sasuke.super.bomb!, s = HEROES.sasuke.second.fireball!;
        ball.active = firing && (second&&level<3 || this.mode === 'super' && level > 0);
        ball.weapon = 'sasuke:' + (second ? 'second' : 'super');
        ball.size = second ? s.size + level * s.sizePerLevel : b.size + b.sizePerLevel * Math.max(0,level-1);
        ball.x = ball.px = f.x + 20 + (phase-fireAt) * 16;
        ball.y = ball.py = f.y - 17;
        if(!second&&level>=3){
          const muzzle=avatarLaunch('sasuke',level,this.aim),travel=(phase-fireAt)*16;
          ball.x=ball.px=f.x+muzzle.ahead+Math.cos(this.aim)*travel;
          ball.y=ball.py=f.y-muzzle.up+Math.sin(this.aim)*travel;
        }
        ball.vx = second ? s.speed : b.speed;
        ball.vy=0;
        if(!second&&level>=3){ball.vx*=Math.cos(this.aim);ball.vy=b.speed*Math.sin(this.aim);}
        ball.traveled = Math.max(0,phase-fireAt) * 16;
        if (ball.active) f.charge = -2;
        if(second&&level>=3&&firing)f.charge=-2;
      }
      if (this.hero === 'goku') {
        const ball = this.spiritBalls[level];
        const b = HEROES.goku.super.bomb!;
        ball.active = this.mode === 'super' && level > 0 && firing;
        ball.size = b.size + b.sizePerLevel * Math.max(0, level - 1);
        ball.x = ball.px = f.x + ball.size + 12 + (phase - fireAt) * 18;
        ball.y = ball.py = f.y - 19;
        ball.vx = 260;
        ball.traveled = Math.max(0, phase - fireAt) * 18;
        if (ball.active) f.charge = -2;
      }
      if(this.mode==='combo'){
        f.specialKind='';f.stretchLen=0;
        if(phase>.5&&phase<2.4){
          f.state='melee';
          const p=(phase-.5)/.42;f.combo=Math.floor(p)%4;
          const hit=HEROES[this.hero].combo[f.combo];
          f.stateTime=(p%1)*(hit.windup+hit.active+hit.recover);
        } else f.state='normal';
      }
      if(this.mode==='special'){
        f.state=(level>0||this.hero==='sasuke')&&phase>.5&&phase<2.4?'special':'normal';f.specialKind='formCombo';
        f.stateTime=Math.max(0,(phase-.5)% (this.hero==='naruto'?CLONE_SLINGSHOT.duration:this.hero==='luffy'?JET_BAZOOKA.duration:.7));f.lockOn=-1;f.anchorX=f.x+28;f.anchorY=f.y;
        if(this.hero==='naruto'&&f.stateTime>=CLONE_SLINGSHOT.windup)f.vx=CLONE_SLINGSHOT.speed;
        if(this.hero==='luffy'){f.jetMode=this.jetPreview;f.jetAnchorX=f.x-14;f.jetAnchorY=f.y;if(f.stateTime>=JET_BAZOOKA.windup&&this.jetPreview==='sling')f.vx=JET_BAZOOKA.speed;}
      }
      if(this.mode==='guard'){f.state='block';f.specialKind='';}
      this.targets[level]?.setVisible(this.hero==='sasuke'?(this.mode==='second'&&level>=3||this.mode==='special'):(this.mode==='special'&&this.jetPreview==='kick'&&level>0));
      if(this.hero==='luffy'&&this.targets[level]){
        const released=Math.max(0,f.stateTime-JET_BAZOOKA.windup);
        this.targets[level].setPosition(f.x+18+released*100,f.y-released*25).setRotation(released*7);
      }
      v.update(1, dt, this.t, this.t);
      v.tag.setVisible(false);
      if (firing && loop !== this.lastLoop && this.hero === 'goku' && this.mode === 'base') this.heroFx.choreography.blink(f.id, f.x - 14, f.y - 12, f.x, f.y - 12);
    }
    if (firing) this.lastLoop = loop;
    this.heroFx.sync(1, dt, this.t);
    this.targetFx.clear();
    if(this.hero==='sasuke'&&this.mode==='second'&&firing)for(let i=3;i<=4;i++){
      const f=this.views[i].fighter;drawBlackFlames(this.targetFx,f.x+33,f.y,7,22,this.t);
    }
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
