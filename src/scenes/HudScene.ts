import Phaser from 'phaser';
import { Art } from '../art';
import { textWidth } from '../art/font';
import { hexToNum, P } from '../art/palette';
import { VIEW_H, VIEW_W } from '../game/display';
import { weaponLabel } from '../render/Juice';
import { teamKey } from '../sim/combat';
import { weaponDef } from '../sim/data/weapons';
import { activeWeapon } from '../sim/fighter';
import type { MatchScene } from './MatchScene';

interface FeedLine {
  objs: Phaser.GameObjects.BitmapText[];
  life: number;
}

const KILL_QUIPS: Record<string, string> = {
  fall: 'YEETED!',
  water: 'SLEEPS WITH THE FISHES',
  splat: 'SPLATTERED!',
  bodyslam: 'HUMAN BOWLING!',
  throw: 'BONK!',
  explosion: 'BLOWN TO BITS!',
  fire: 'ROASTED!',
};

/** Screen-space overlay: scores, banners, kill feed, player panels, off-screen arrows, pause. */
export class HudScene extends Phaser.Scene {
  private ms!: MatchScene;
  private gfx!: Phaser.GameObjects.Graphics;
  private feed: FeedLine[] = [];
  private banner!: Phaser.GameObjects.BitmapText;
  private bannerSub!: Phaser.GameObjects.BitmapText;
  private bannerTime = 0;
  private announce!: Phaser.GameObjects.BitmapText;
  private announceTime = 0;
  private roundText!: Phaser.GameObjects.BitmapText;
  private scoreTexts: Phaser.GameObjects.BitmapText[] = [];
  private panelTexts: Phaser.GameObjects.BitmapText[][] = [];
  /** per panel: 5 slot icons */
  private panelIcons: Phaser.GameObjects.Image[][] = [];
  private panelCounts: Phaser.GameObjects.BitmapText[][] = [];
  private arrows: Phaser.GameObjects.Image[] = [];
  private pauseText!: Phaser.GameObjects.BitmapText;
  private pauseSub!: Phaser.GameObjects.BitmapText;
  private debugText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('hud');
  }

  create(): void {
    this.ms = this.scene.get("match") as unknown as MatchScene;
    this.applyZoom((this.registry.get('scale') as number) ?? 1);
    this.game.events.on('rescale', this.applyZoom, this);
    this.events.once('shutdown', () => this.game.events.off('rescale', this.applyZoom, this));

    this.gfx = this.add.graphics();
    this.roundText = this.add.bitmapText(VIEW_W / 2, 4, 'smo', '').setOrigin(0.5, 0);
    this.banner = this.add.bitmapText(VIEW_W / 2, 118, 'pxo', '').setOrigin(0.5).setScale(3).setDepth(10);
    this.bannerSub = this.add.bitmapText(VIEW_W / 2, 146, 'pxo', '').setOrigin(0.5).setDepth(10);
    this.announce = this.add.bitmapText(VIEW_W / 2, 72, 'pxo', '').setOrigin(0.5).setScale(2).setDepth(10);
    this.pauseText = this.add.bitmapText(VIEW_W / 2, 150, 'pxo', 'PAUSED').setOrigin(0.5).setScale(3).setDepth(20).setVisible(false);
    this.pauseSub = this.add
      .bitmapText(VIEW_W / 2, 185, 'pxo', 'ESC: RESUME   Q: QUIT TO TITLE   F1: HITBOXES   F2: SPEED')
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);
    this.debugText = this.add.bitmapText(4, 4, 'smo', '').setDepth(20);

    const humans = this.ms.players.map((p, i) => ({ p, i })).filter(({ p }) => p.input.startsWith('kb'));
    humans.forEach(() => {
      this.panelTexts.push([
        this.add.bitmapText(0, 0, 'pxo', ''),
        this.add.bitmapText(0, 0, 'smo', ''),
        this.add.bitmapText(0, 0, 'smo', ''),
      ]);
      this.panelIcons.push(Array.from({ length: 5 }, () => this.add.image(0, 0, 'weapons').setVisible(false)));
      this.panelCounts.push(Array.from({ length: 5 }, () => this.add.bitmapText(0, 0, 'smo', '').setOrigin(1, 1).setDepth(2)));
    });
    this.showBanner('ROUND 1', 'FIGHT!', 0xffffff, 1.2);
  }

  private applyZoom(k: number): void {
    this.cameras.main.setZoom(k);
    this.cameras.main.centerOn(VIEW_W / 2, VIEW_H / 2);
  }

  private showBanner(text: string, sub: string, color: number, time: number): void {
    this.banner.setText(text).setTint(color);
    this.bannerSub.setText(sub).setTint(0xffffff);
    this.bannerTime = time;
  }

  private showAnnounce(text: string, color: number): void {
    this.announce.setText(text).setTint(color).setScale(3);
    this.announceTime = 1.4;
  }

  private nameOf(id: number): { name: string; color: number } {
    const p = this.ms.players[id];
    return p ? { name: p.label, color: p.color } : { name: '???', color: 0xffffff };
  }

  private teamName(team: number | null): { name: string; color: number } {
    if (team === null) return { name: 'NOBODY', color: 0xaaaaaa };
    const members = this.ms.match.membersOf(team);
    if (members.length === 1) return this.nameOf(members[0]);
    const TEAM_LABELS = ['', 'RED TEAM', 'BLUE TEAM', 'GREEN TEAM', 'GOLD TEAM'];
    return { name: TEAM_LABELS[team] ?? 'TEAM', color: this.nameOf(members[0]).color };
  }

  private pushFeed(killer: number, victim: number, weapon: string, cause: string, env: boolean): void {
    const v = this.nameOf(victim);
    const parts: { text: string; color: number }[] = [];
    if (killer < 0) {
      parts.push({ text: v.name, color: v.color }, { text: cause === 'water' ? 'DROWNED' : 'FELL', color: 0xaaaaaa });
    } else if (killer === victim) {
      parts.push({ text: v.name, color: v.color }, { text: 'SELF-DESTRUCTED', color: 0xaaaaaa });
    } else {
      const k = this.nameOf(killer);
      const how = env ? (KILL_QUIPS[cause] ?? weaponLabel(weapon)) : weaponLabel(weapon);
      parts.push({ text: k.name, color: k.color }, { text: how, color: 0xd0d0d0 }, { text: v.name, color: v.color });
    }
    const objs = parts.map((p) => this.add.bitmapText(0, 0, 'smo', p.text).setTint(p.color).setOrigin(0, 0));
    this.feed.unshift({ objs, life: 5 });
    while (this.feed.length > 6) this.feed.pop()!.objs.forEach((o) => o.destroy());
  }

  override update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const ms = this.ms;
    if (!ms || !ms.match) return;
    const m = ms.match;
    const w = m.world;

    // ---- events
    for (const e of ms.ui) {
      if (e.t === 'kill') {
        this.pushFeed(e.killer, e.victim, e.weapon, e.cause, e.env);
        if (e.killer >= 0 && e.killer !== e.victim && e.env && KILL_QUIPS[e.cause]) this.showAnnounce(KILL_QUIPS[e.cause], 0xfff4a0);
        else if (e.killer === e.victim) this.showAnnounce('SELF-DESTRUCTED', 0xaaaaaa);
      }
    }
    ms.ui.length = 0;
    for (const e of ms.matchEvents) {
      if (e.t === 'roundStart') this.showBanner('ROUND ' + e.round, 'FIGHT!', 0xffffff, 1.2);
      else if (e.t === 'roundEnd') {
        const tn = this.teamName(e.winnerTeam);
        this.showBanner(e.winnerTeam === null ? 'DRAW!' : tn.name + ' WINS', e.winnerTeam === null ? 'EVERYBODY DIED' : 'THE ROUND', tn.color, 2.4);
      } else if (e.t === 'matchEnd') {
        const tn = this.teamName(e.winnerTeam);
        this.showBanner(tn.name + ' WINS!', 'CHAMPION OF THE SCRAPYARD - NEW MATCH SOON', tn.color, 4.4);
      } else if (e.t === 'multiKill') {
        const words = ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'MULTI KILL!', 'RAMPAGE!!'];
        this.showAnnounce(words[Math.min(5, e.count)], 0xf07a2a);
      }
    }
    ms.matchEvents.length = 0;

    // ---- banner & announcer
    this.bannerTime -= dt;
    const bAlpha = Math.max(0, Math.min(1, this.bannerTime * 3));
    this.banner.setAlpha(bAlpha);
    this.bannerSub.setAlpha(bAlpha);
    this.announceTime -= dt;
    if (this.announceTime > 0) {
      const s = this.announce.scale;
      this.announce.setScale(Math.max(2, s - dt * 12)).setAlpha(Math.min(1, this.announceTime * 3));
    } else this.announce.setAlpha(0);

    // ---- scoreboard
    this.roundText.setText(`ROUND ${m.round}  -  FIRST TO ${m.cfg.roundsToWin}`);
    const teams: number[] = [];
    m.cfg.fighters.forEach((f, i) => {
      const t = teamKey({ id: i, team: f.team });
      if (!teams.includes(t)) teams.push(t);
    });
    const g = this.gfx;
    g.clear();
    while (this.scoreTexts.length < teams.length) this.scoreTexts.push(this.add.bitmapText(0, 0, 'smo', ''));
    const pip = 4;
    const entryW = (t: number) => textWidth(this.teamName(t).name, 'smo') + 4 + m.cfg.roundsToWin * (pip + 1);
    const shown = teams.slice(0, 10);
    const total = shown.reduce((s, t) => s + entryW(t) + 10, -10);
    let x = Math.round(VIEW_W / 2 - total / 2);
    shown.forEach((t, i) => {
      const tn = this.teamName(t);
      const txt = this.scoreTexts[i].setText(tn.name).setTint(tn.color).setPosition(x, 12).setVisible(true);
      const score = m.scores.get(t) ?? 0;
      let px = x + txt.width + 3;
      for (let r = 0; r < m.cfg.roundsToWin; r++) {
        g.fillStyle(hexToNum(P.ink), 1).fillRect(px - 1, 12, pip + 2, pip + 3);
        g.fillStyle(r < score ? tn.color : 0x3a3448, 1).fillRect(px, 13, pip, pip + 1);
        px += pip + 1;
      }
      x += entryW(t) + 10;
    });
    for (let i = shown.length; i < this.scoreTexts.length; i++) this.scoreTexts[i].setVisible(false);

    // ---- kill feed
    let fy = 26;
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const line = this.feed[i];
      line.life -= dt;
      if (line.life <= 0) {
        line.objs.forEach((o) => o.destroy());
        this.feed.splice(i, 1);
      }
    }
    for (const line of this.feed) {
      const width = line.objs.reduce((s, o) => s + o.width + 4, -4);
      let lx = VIEW_W - 6 - width;
      for (const o of line.objs) {
        o.setPosition(lx, fy).setAlpha(Math.min(1, line.life * 2));
        lx += o.width + 4;
      }
      fy += 9;
    }

    // ---- player panels: name + HP, active weapon + ammo, 5 inventory slots
    const humans = ms.players.map((p, i) => ({ p, i })).filter(({ p }) => p.input.startsWith('kb'));
    humans.forEach(({ p, i }, n) => {
      const f = w.fighters[i];
      const [nameT, weapT, ammoT] = this.panelTexts[n];
      const right = n % 2 === 1;
      const PW = 104;
      const px = right ? VIEW_W - PW - 6 : 8;
      const py = VIEW_H - 40;
      g.fillStyle(hexToNum(P.ink), 0.75).fillRect(px - 3, py - 3, PW, 38);
      g.lineStyle(1, p.color, 1).strokeRect(px - 3.5, py - 3.5, PW + 1, 39);
      nameT.setText(p.label).setTint(p.color).setPosition(px, py);
      const hpFrac = Math.max(0, f.hp) / 100;
      g.fillStyle(0x3a3448, 1).fillRect(px + 22, py + 2, 74, 5);
      const hpCol = hpFrac > 0.6 ? P.green2 : hpFrac > 0.3 ? P.yellow : P.red2;
      g.fillStyle(hexToNum(f.burn > 0 && Math.floor(this.time.now / 120) % 2 ? P.orange : hpCol), 1).fillRect(px + 22, py + 2, Math.round(74 * hpFrac), 5);
      // boost timers under the HP bar
      if (f.alive && f.speedBoost > 0) g.fillStyle(hexToNum(P.yellow), 1).fillRect(px + 22, py + 7, Math.round(74 * Math.min(1, f.speedBoost / 10)), 1);
      if (f.alive && f.strengthBoost > 0) g.fillStyle(hexToNum(P.red2), 1).fillRect(px + 22, py + 8, Math.round(74 * Math.min(1, f.strengthBoost / 12)), 1);
      const def = activeWeapon(f);
      const item = f.inv[f.active];
      weapT.setText(f.alive ? def.name : 'DEAD').setPosition(px, py + 11).setTint(f.alive ? 0xffffff : 0x888888);
      const ammo = item && (def.gun || def.throw) ? 'x' + item.ammo : item && def.gadget?.kind === 'jetpack' ? Math.ceil(item.ammo * 10) / 10 + 'S' : '';
      ammoT.setText(f.alive ? ammo : '').setPosition(px + PW - 8 - ammoT.width, py + 11).setTint(item && def.gun && item.ammo <= 3 ? hexToNum(P.red2) : 0xfff4a0);
      for (let s = 0; s < 5; s++) {
        const bx = px + s * 20;
        const by = py + 20;
        const inv = f.inv[s];
        const active = f.active === s && f.alive;
        g.fillStyle(active ? 0x4a4060 : 0x241e32, 1).fillRect(bx, by, 18, 12);
        if (active) g.lineStyle(1, 0xffffff, 1).strokeRect(bx - 0.5, by - 0.5, 19, 13);
        const icon = this.panelIcons[n][s];
        const cnt = this.panelCounts[n][s];
        const wf = inv ? Art.weapon(inv.id) : undefined;
        if (wf && f.alive) {
          const k = Math.min(1, 17 / wf.w, 11 / wf.h);
          icon.setVisible(true).setTexture(wf.key, wf.frame).setScale(k).setPosition(bx + 9, by + 6).setAlpha(active ? 1 : 0.7);
        } else icon.setVisible(false);
        const idef = inv ? weaponDef(inv.id) : null;
        cnt.setText(inv && f.alive && idef?.throw ? String(inv.ammo) : '').setPosition(bx + 18, by + 13);
      }
    });

    // ---- bullet time tint
    if (w.bulletTime > 0) {
      const a = Math.min(1, w.bulletTime * 2, (5 - w.bulletTime) * 4) * 0.12;
      g.fillStyle(0x4a8af0, a).fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // ---- off-screen arrows
    const cam = ms.cameras.main;
    const wv = cam.worldView;
    let ai = 0;
    for (let i = 0; i < w.fighters.length; i++) {
      const f = w.fighters[i];
      if (!f.alive || f.gone) continue;
      const cy = f.y - 12;
      if (f.x >= wv.x && f.x <= wv.right && cy >= wv.y && cy <= wv.bottom) continue;
      const sx = ((f.x - wv.x) / wv.width) * VIEW_W;
      const sy = ((cy - wv.y) / wv.height) * VIEW_H;
      const ax = Math.max(8, Math.min(VIEW_W - 8, sx));
      const ay = Math.max(24, Math.min(VIEW_H - 8, sy));
      if (!this.arrows[ai]) this.arrows[ai] = this.add.image(0, 0, 'fx', 'arrow');
      this.arrows[ai]
        .setVisible(true)
        .setPosition(ax, ay)
        .setRotation(Math.atan2(sy - ay, sx - ax) + Math.PI / 2)
        .setTint(ms.players[i]?.color ?? 0xffffff);
      ai++;
    }
    for (; ai < this.arrows.length; ai++) this.arrows[ai].setVisible(false);

    // ---- pause & debug
    this.pauseText.setVisible(ms.paused);
    this.pauseSub.setVisible(ms.paused);
    if (ms.paused) g.fillStyle(0x000000, 0.5).fillRect(0, 0, VIEW_W, VIEW_H);
    if (ms.wr?.debug) {
      const alive = w.fighters.filter((f) => f.alive).length;
      this.debugText.setText(`FPS ${Math.round(this.game.loop.actualFps)}  SPEED ${ms.speed}X  TICK ${w.tick}  ALIVE ${alive}  BULLETS ${w.bullets.filter((b) => b.active).length}`);
    } else this.debugText.setText('');
  }
}
