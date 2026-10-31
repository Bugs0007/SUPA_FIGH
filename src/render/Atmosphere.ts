import Phaser from 'phaser';
import { hash2 } from '../art/canvas';
import { formFx } from '../art/heroArt';
import { hexToNum } from '../art/palette';
import { TILE } from '../sim/constants';
import type { World } from '../sim/world';
import { formLevel } from './formLevel';

/** Visual depth only: baked architecture shadows, contact shadows and coloured light. */
export class Atmosphere {
  private architecture: Phaser.GameObjects.RenderTexture;
  private surfaces: Phaser.GameObjects.RenderTexture;
  private contact: Phaser.GameObjects.Graphics;
  private dust: Phaser.GameObjects.Graphics;
  private lights: Phaser.GameObjects.Image[] = [];
  private accent: number;

  constructor(private scene: Phaser.Scene, private world: World) {
    const map = world.map;
    this.accent = ({ leaf: 0xffe4ac, valley: 0x9de1d6, citadel: 0xffdfaa, neon: 0x85dff4, ship: 0xc8efff, docks: 0xffbf8d, factory: 0xff9954, lab: 0x67e8cf, alien: 0xad9aff, mine: 0xd4bb94 } as Record<string, number>)[world.def.theme] ?? 0xa6bbee;
    this.architecture = scene.add.renderTexture(0, 0, map.pxW, map.pxH).setOrigin(0).setDepth(19);
    this.surfaces = scene.add.renderTexture(0, 0, map.pxW, map.pxH).setOrigin(0).setDepth(20.5);
    this.contact = scene.add.graphics().setDepth(31);
    this.dust = scene.add.graphics().setDepth(29);
    for (let i = 0; i < world.fighters.length; i++) this.lights.push(scene.add.image(0, 0, 'fx', 'glowBig').setBlendMode(Phaser.BlendModes.ADD).setDepth(58).setVisible(false));
    this.refresh();
  }

  /** Re-bake only when destructible geometry changes; no per-frame tile traversal. */
  refresh(): void {
    const map = this.world.map;
    const g = this.scene.make.graphics({ x: 0, y: 0 });
    const surface = this.scene.make.graphics({ x: 0, y: 0 });
    const roofDistance = new Array<number>(map.w).fill(0);
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      const d = map.def(tx, ty);
      roofDistance[tx] = d.solid ? roofDistance[tx] + 1 : 0;
      if (!d.solid && !d.oneWay) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      if (d.solid && d.material !== 'glass') {
        // Continuous roof light and lower-face shade break up large repeated tile surfaces.
        const roof = roofDistance[tx] - 1;
        for (let r = 0; r < TILE; r += 2) {
          const distance = roof * TILE + r;
          surface.fillStyle(this.accent, 0.15 * Math.exp(-distance / 36)).fillRect(x, y + r, TILE, 2);
          surface.fillStyle(0x0b142d, Math.min(0.19, distance / 1500)).fillRect(x, y + r, TILE, 2);
        }
        if (!map.def(tx + 1, ty).solid) surface.fillStyle(0x080f23, 0.2).fillRect(x + TILE - 4, y, 4, TILE);
        if (!map.def(tx - 1, ty).solid) surface.fillStyle(this.accent, 0.11).fillRect(x, y, 2, TILE);
      }
      if (!map.def(tx, ty + 1).solid) {
        const edge = y + (d.oneWay ? 6 : TILE);
        for (let k = 0; k < 5; k++) g.fillStyle(0x080d1b, 0.22 * (1 - k / 5)).fillRect(x + 2 + k, edge + k * 2, TILE, 2);
      }
      if (!d.oneWay && !map.def(tx + 1, ty).solid) {
        g.fillStyle(0x080d1b, 0.17).fillRect(x + TILE, y + 4, 4, TILE);
        g.fillStyle(0x080d1b, 0.07).fillRect(x + TILE + 4, y + 6, 4, TILE);
      }
    }
    this.architecture.clear().draw(g);
    this.surfaces.clear().draw(surface);
    g.destroy();
    surface.destroy();
  }

  private shadow(x: number, y: number, width: number, grounded: boolean, alpha: number): void {
    const map = this.world.map;
    let floor = Infinity;
    const tx = Math.floor(x / TILE);
    for (let ty = Math.floor((y - 1) / TILE); ty < Math.min(map.h, Math.floor(y / TILE) + 7); ty++) {
      const d = map.def(tx, ty);
      const top = ty * TILE;
      if ((d.solid || d.oneWay) && top >= y - 2) { floor = top; break; }
    }
    // Props and moving platforms are valid shadow receivers as well.
    for (const p of this.world.props) if (p.active && p.carriedBy < 0 && Math.abs(x - p.x) < p.w / 2 && p.y - p.h >= y - 2) floor = Math.min(floor, p.y - p.h);
    for (const p of this.world.gimmicks.movers) if (x >= p.x && x <= p.x + p.w && p.y >= y - 2) floor = Math.min(floor, p.y);
    if (grounded && floor > y + 3) floor = y;
    const gap = Math.max(0, floor - y);
    if (gap > 96) return;
    const strength = alpha * (1 - gap / 100);
    const span = width * (1 + gap / 110);
    this.contact.fillStyle(0x080b19, strength * 0.24).fillEllipse(x + gap * 0.16, floor + 1, span * 1.5, 5);
    this.contact.fillStyle(0x080b19, strength * 0.4).fillEllipse(x + gap * 0.16, floor + 1, span, 2.5);
  }

  sync(alpha: number, time: number): void {
    this.contact.clear();
    const w = this.world;
    w.fighters.forEach((f, i) => {
      const light = this.lights[i];
      light.setVisible(false);
      if (f.gone) return;
      const x = f.px + (f.x - f.px) * alpha;
      const y = f.py + (f.y - f.py) * alpha;
      this.shadow(x, y, f.w + 7, f.grounded, f.alive ? 1 : 0.6);
      if (!f.alive) return;
      const level = formLevel(f);
      const charged = f.state === 'special';
      if (level > 0 || charged || f.burn > 0) {
        const color = f.burn > 0 ? f.burnStyle==='amaterasu'?0x9e66c5:0xff9855 : level > 0 ? hexToNum(formFx(f.hero, level).aura[0]) : f.hero === 'luffy' ? 0xffc5a0 : 0x75cfff;
        light.setVisible(true).setPosition(x, y - 12).setTint(color).setScale(1.8 + level * 0.25).setAlpha((charged ? 0.26 : 0.14) + Math.sin(time * 6 + i) * 0.025);
      }
    });
    for (const p of w.props) if (p.active && p.carriedBy < 0) this.shadow(p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha, p.w + 5, p.grounded, 0.85);

    this.dust.clear();
    const map = w.map;
    const view = this.scene.cameras.main.worldView;
    if (w.def.theme === 'valley') {
      // Falling water catches light behind the fighters, with mist at the foot of the falls.
      for (let i=0;i<28;i++) {
        const x=map.pxW*.5-29+hash2(i,0)*58;
        const y=(hash2(i,1)*map.pxH+time*(75+hash2(i,2)*50))%(map.pxH-64);
        this.dust.fillStyle(0xd5f5e8,.24).fillRect(Math.round(x),Math.round(y),1,6+hash2(i,3)*8);
      }
      for(let i=0;i<12;i++)this.dust.fillStyle(0xc1f0e4,.1).fillEllipse(map.pxW*.5+Math.sin(time*.7+i)*65,map.pxH-67-Math.sin(time+i)*7,24,5);
    } else if (w.def.theme === 'citadel') {
      const zone=w.gimmicks.gravity[0];
      if(zone){
        for(let i=0;i<16;i++){
          const h=zone.b-zone.t;
          const x=zone.l+hash2(i,7)*(zone.r-zone.l),y=zone.t+((hash2(i,8)*h-time*24)%h+h)%h;
          this.dust.fillStyle(0xe6d3a4,.38).fillRect(Math.round(x),Math.round(y),1,4);
        }
      }
    }
    for (let i = 0; i < 44; i++) {
      const x = ((hash2(i, 1, 87) * map.pxW + time * (2 + hash2(i, 2) * 4)) % map.pxW);
      const y = ((hash2(i, 3, 87) * map.pxH - time * (2 + hash2(i, 4) * 4)) % map.pxH + map.pxH) % map.pxH;
      if (!view.contains(x, y) || map.def(Math.floor(x / TILE), Math.floor(y / TILE)).solid) continue;
      const a = 0.12 + (Math.sin(time * 1.2 + i) + 1) * 0.09;
      this.dust.fillStyle(this.accent, a).fillRect(Math.round(x), Math.round(y), i % 5 === 0 ? 2 : 1, 1);
    }
  }

  destroy(): void {
    this.architecture.destroy();
    this.surfaces.destroy();
    this.contact.destroy();
    this.dust.destroy();
    for (const light of this.lights) light.destroy();
  }
}
