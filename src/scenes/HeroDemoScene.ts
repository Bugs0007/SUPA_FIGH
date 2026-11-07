import Phaser from 'phaser';
import { PLAYER_PRESETS } from '../art/appearance';
import { heroLook } from '../art/heroArt';
import { settings } from '../game/settings';
import { Juice } from '../render/Juice';
import { WorldRenderer } from '../render/WorldRenderer';
import { DT } from '../sim/constants';
import { DEMO_FLOOR, HeroDemo, type DemoMode } from './heroDemo';

export const DEMO_SCENE = 'hero-demo';
export const DEMO_FRAME = { x: 12, y: 84, w: 616, h: 220 };

export interface DemoSelection {
  hero: string;
  mode: DemoMode;
  level: number;
}

/** A real arena renderer in its own clipped camera, below the abilities menu. */
export class HeroDemoScene extends Phaser.Scene {
  private demo!: HeroDemo;
  private rendererView!: WorldRenderer;
  private juice!: Juice;
  private elapsed = 0;
  private acc = 0;
  private stop = 0;
  private cx = 0;
  private cy = 0;
  private zoom = 1;

  constructor() {
    super(DEMO_SCENE);
  }

  create(selection: DemoSelection): void {
    this.demo = new HeroDemo(selection.hero, selection.mode, selection.level);
    const world = this.demo.world;
    this.elapsed = this.acc = this.stop = 0;
    this.zoom = this.demo.cameraZoom;
    this.cx = (world.fighters[0].x + world.fighters[1].x) / 2;
    this.cy = world.fighters[0].y - 84 / this.zoom;
    this.rendererView = new WorldRenderer(this, world, world.fighters.map(f => ({
      look: heroLook(f.hero, PLAYER_PRESETS[f.id === 1 ? 1 : 0]),
      color: f.id === 1 ? 0xf2887a : 0x8ed3ff,
      label: f.id === 1 ? 'RIVAL' : '',
    })));
    const cam = this.cameras.main;
    cam.setBackgroundColor('#181625');
    cam.roundPixels = true;
    this.input.enabled = false;
    const stage = this;
    this.juice = new Juice(this.rendererView, {
      get x() { return stage.cx; },
      get z() { return stage.zoom; },
      addTrauma(amount) {
        if (settings.screenShake > 0) cam.shake(100, 0.004 * amount * settings.screenShake, true);
      },
      flash(duration, r, g, b) { cam.flash(duration, r, g, b); },
    }, { announceMoves: false });
    this.layout();
    this.game.events.on('rescale', this.layout, this);
    this.events.once('shutdown', () => {
      this.game.events.off('rescale', this.layout, this);
      this.rendererView.destroy();
    });
    this.rendererView.sync(1, 0, 0);
  }

  private layout(): void {
    const k = (this.registry.get('scale') as number) ?? 1;
    const { x, y, w, h } = DEMO_FRAME;
    this.cameras.main.setViewport(x * k, y * k, w * k, h * k).setZoom(this.zoom * k).centerOn(this.cx, this.cy);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.elapsed += dt;
    const w = this.demo.world;
    if (this.stop > 0) this.stop -= dt;
    else if (!this.demo.done) {
      this.acc += dt;
      while (this.acc >= DT && !this.demo.done) {
        this.demo.step();
        this.acc -= DT;
        for (const e of w.events) this.juice.handle(e, w);
        w.events.length = 0;
        this.juice.ui.length = 0;
        if (this.juice.hitstop > 0) {
          this.stop = this.juice.hitstop;
          this.juice.hitstop = 0;
          break;
        }
      }
    }
    const [hero, rival] = w.fighters;
    const gap = Math.abs(hero.x - rival.x);
    const mix = 1 - Math.exp(-dt * 9);
    this.zoom += (Math.min(this.demo.cameraZoom, (DEMO_FRAME.w - 130) / (gap + 100)) - this.zoom) * mix;
    this.cx += ((hero.x + rival.x) / 2 - this.cx) * mix;
    const y = Math.min(DEMO_FLOOR - 84 / this.zoom, Math.min(hero.y, rival.y) + 32 / this.zoom);
    this.cy += (y - this.cy) * mix;
    this.layout();
    this.rendererView.sync(this.demo.done ? 1 : Math.min(1, this.acc / DT), dt, this.elapsed);
  }
}
