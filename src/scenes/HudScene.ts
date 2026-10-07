import Phaser from 'phaser';
import { Art } from '../art';
import { textWidth } from '../art/font';
import { hexToNum, P } from '../art/palette';
import { VIEW_H, VIEW_W } from '../game/display';
import { weaponLabel } from '../render/Juice';
import { teamKey } from '../sim/combat';
import { computeAwards } from '../sim/awards';
import { COOP, GUN_LADDER, JUGGERNAUT, KOTH_TARGET, MODE_NAMES } from '../sim/match';
import { MODIFIER_BY_ID } from '../sim/data/modifiers';
import { FORM_HP, heroDef } from '../sim/data/heroes';
import { BOOST_COLORS, formFx } from '../art/heroArt';
import { weaponDef } from '../sim/data/weapons';
import { activeWeapon } from '../sim/fighter';
import { formLayers, formName, transformed } from '../sim/hero';
import { audio } from '../audio/AudioManager';
import { menu } from '../input/menu';
import { isHumanInput, type MatchScene } from './MatchScene';

interface FeedLine {
  objs: Phaser.GameObjects.BitmapText[];
  life: number;
}

/** player panel width (fits an 8-letter name next to the hero ability label) */
const PANEL_W = 124;

const PAUSE_ITEMS = [
  { label: 'RESUME', action: 'resume' },
  { label: 'RESTART MATCH', action: 'restart' },
  { label: 'SETTINGS', action: 'settings' },
  { label: 'CONTROLS', action: 'controls' },
  { label: 'QUIT TO TITLE', action: 'quit' },
] as const;

/** Uncredited deaths: by weapon id first, then by hit kind. */
const ENV_DEATHS: Record<string, string> = {
  water: 'DROWNED',
  fall: 'FELL',
  crusher: 'GOT CRUSHED',
  laser: 'GOT LASERED',
  tunnel: 'HIT A TUNNEL',
  minecart: 'GOT RUN OVER',
  hook: 'GOT HOOKED',
  girder: 'GOT GIRDERED',
  chandelier: 'GOT CHANDELIERED',
  fissure: 'GOT ERUPTED',
  cannon: 'GOT CANNONED',
  explosion: 'BLEW UP',
  fire: 'BURNED',
  drain: 'RAN OUT OF TIME',
  splat: 'SPLATTERED',
  barrel: 'BLEW UP',
  tnt: 'BLEW UP',
  gas: 'BLEW UP',
};

/** Big announcer lines for kills by the map / props (any credit). */
const PROP_QUIPS: Record<string, string> = {
  chandelier: "CHANDELIER'D!",
  barrel: 'KABOOM!',
  tnt: 'KABOOM!',
  gas: 'KABOOM!',
  crusher: 'FLATTENED!',
  minecart: 'ROADKILL!',
  tunnel: 'TUNNEL VISION!',
  laser: 'LASER SURGERY!',
  hook: 'OFF THE HOOK!',
  girder: 'STEEL TOE!',
  crate: 'SPECIAL DELIVERY!',
  fissure: 'ERUPTION!',
  cannon: 'BROADSIDE!',
};

const KILL_QUIPS: Record<string, string> = {
  fall: 'YEETED!',
  water: 'SLEEPS WITH THE FISHES',
  splat: 'SPLATTERED!',
  bodyslam: 'HUMAN BOWLING!',
  throw: 'BONK!',
  drain: 'OUTLASTED!',
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
  private dmScores: Phaser.GameObjects.BitmapText[] = [];
  private panelTexts: Phaser.GameObjects.BitmapText[][] = [];
  /** per panel: 5 slot icons */
  private panelIcons: Phaser.GameObjects.Image[][] = [];
  private panelCounts: Phaser.GameObjects.BitmapText[][] = [];
  private arrows: Phaser.GameObjects.Image[] = [];
  private pauseText!: Phaser.GameObjects.BitmapText;
  private pauseSub!: Phaser.GameObjects.BitmapText;
  private pauseItems: Phaser.GameObjects.BitmapText[] = [];
  private pauseDim!: Phaser.GameObjects.Rectangle;
  private pauseIdx = 0;
  private wasPaused = false;
  private debugText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('hud');
  }

  create(): void {
    // The scene instance survives restarts: drop every reference to the previous run's objects
    // (they're destroyed, and touching a destroyed BitmapText crashes on its null font data).
    this.feed = [];
    this.scoreTexts = [];
    this.dmScores = [];
    this.panelTexts = [];
    this.panelIcons = [];
    this.panelCounts = [];
    this.arrows = [];
    this.awardObjs = [];
    this.card = null;
    this.cardTime = 0;
    this.bannerTime = 0;
    this.announceTime = 0;
    this.pauseIdx = 0;
    this.wasPaused = false;
    this.ms = this.scene.get("match") as unknown as MatchScene;
    this.applyZoom((this.registry.get('scale') as number) ?? 1);
    this.game.events.on('rescale', this.applyZoom, this);
    this.events.once('shutdown', () => this.game.events.off('rescale', this.applyZoom, this));

    this.gfx = this.add.graphics();
    this.roundText = this.add.bitmapText(VIEW_W / 2, 4, 'smo', '').setOrigin(0.5, 0);
    this.banner = this.add.bitmapText(VIEW_W / 2, 118, 'pxo', '').setOrigin(0.5).setScale(3).setDepth(10);
    this.bannerSub = this.add.bitmapText(VIEW_W / 2, 146, 'pxo', '').setOrigin(0.5).setDepth(10);
    this.announce = this.add.bitmapText(VIEW_W / 2, 72, 'pxo', '').setOrigin(0.5).setScale(2).setDepth(10);
    this.pauseText = this.add.bitmapText(VIEW_W / 2, 110, 'pxo', 'PAUSED').setOrigin(0.5).setScale(3).setDepth(20).setVisible(false);
    this.pauseSub = this.add
      .bitmapText(VIEW_W / 2, 300, 'sm', 'F1: HITBOXES   F2: SIM SPEED   F3: FRAME STEP')
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false)
      .setTint(0x8d95b0);
    this.pauseDim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.6).setOrigin(0, 0).setDepth(15).setVisible(false);
    this.pauseItems = PAUSE_ITEMS.map((it, i) => this.add.bitmapText(VIEW_W / 2, 150 + i * 22, 'pxo', it.label).setOrigin(0.5).setDepth(20).setVisible(false));
    this.debugText = this.add.bitmapText(4, 4, 'smo', '').setDepth(20);
    this.modLabel = this.add.bitmapText(VIEW_W / 2, 21, 'sm', '').setOrigin(0.5, 0).setTint(0xb090e0);
    this.replayText = this.add.bitmapText(24, 7, 'pxo', 'INSTANT REPLAY').setDepth(30).setVisible(false);
    this.replaySub = this.add.bitmapText(VIEW_W - 8, VIEW_H - 14, 'sm', 'ANY BUTTON: SKIP').setOrigin(1, 0).setDepth(30).setVisible(false).setTint(0xc3c9dc);

    const humans = this.ms.players.map((p, i) => ({ p, i })).filter(({ p }) => isHumanInput(p.input));
    humans.forEach(() => {
      this.panelTexts.push([
        this.add.bitmapText(0, 0, 'pxo', ''),
        this.add.bitmapText(0, 0, 'smo', ''),
        this.add.bitmapText(0, 0, 'smo', ''),
        this.add.bitmapText(0, 0, 'smo', ''),
        this.add.bitmapText(0, 0, 'smo', '').setOrigin(1, 0),
        // ability chips: A (ability 1), K (ability 2), S (super)
        this.add.bitmapText(0, 0, 'smo', 'A').setOrigin(0.5, 0),
        this.add.bitmapText(0, 0, 'smo', 'K').setOrigin(0.5, 0),
        this.add.bitmapText(0, 0, 'smo', 'S').setOrigin(0.5, 0),
      ]);
      this.panelIcons.push(Array.from({ length: 5 }, () => this.add.image(0, 0, 'weapons').setVisible(false)));
      this.panelCounts.push(Array.from({ length: 5 }, () => this.add.bitmapText(0, 0, 'smo', '').setOrigin(1, 1).setDepth(2)));
    });
    this.roundBanner(1);
  }

  /** per panel alpha this frame */
  private panelAlpha: number[] = [];

  /** Is any visible fighter (body or ghost) on screen inside this HUD rect? */
  private panelBlocked(x: number, y: number, w: number, h: number): boolean {
    const cam = this.ms.cameras.main;
    const v = cam.worldView;
    const sx = (wx: number) => ((wx - v.x) / v.width) * VIEW_W;
    const sy = (wy: number) => ((wy - v.y) / v.height) * VIEW_H;
    for (const f of this.ms.match.world.fighters) {
      if (f.gone) continue;
      const fx = f.alive || !f.ghost ? f.x : f.gx;
      const fy = f.alive || !f.ghost ? f.y : f.gy + 12;
      const l = sx(fx - 6);
      const r = sx(fx + 6);
      const t = sy(fy - 24);
      const b = sy(fy);
      if (r > x && l < x + w && b > y && t < y + h) return true;
    }
    return false;
  }

  private applyZoom(k: number): void {
    this.cameras.main.setZoom(k);
    this.cameras.main.centerOn(VIEW_W / 2, VIEW_H / 2);
  }

  // ---- chaos card
  private card: Phaser.GameObjects.Container | null = null;
  private cardTime = 0;
  private modLabel!: Phaser.GameObjects.BitmapText;
  private replayText!: Phaser.GameObjects.BitmapText;
  private replaySub!: Phaser.GameObjects.BitmapText;

  private showCard(id: string): void {
    const def = MODIFIER_BY_ID[id];
    if (!def) return;
    this.card?.destroy();
    const c = this.add.container(VIEW_W / 2, 196).setDepth(12);
    const g = this.add.graphics();
    g.fillStyle(hexToNum(P.ink), 0.95).fillRect(-90, -32, 180, 64);
    g.lineStyle(2, hexToNum(P.purple1), 1).strokeRect(-89, -31, 178, 62);
    g.fillStyle(hexToNum(P.purple0), 1).fillRect(-86, -28, 172, 12);
    c.add(g);
    c.add(this.add.bitmapText(0, -26, 'sm', 'CHAOS CARD').setOrigin(0.5, 0).setTint(0xfff4a0));
    c.add(this.add.bitmapText(0, -8, 'pxo', def.name).setOrigin(0.5, 0).setTint(0xffffff));
    c.add(this.add.bitmapText(0, 12, 'sm', def.desc).setOrigin(0.5, 0).setTint(0xc3c9dc));
    c.setScale(0, 1);
    this.tweens.add({ targets: c, scaleX: 1, duration: 260, ease: 'Back.out', delay: 900 });
    this.card = c;
    this.cardTime = 3.6;
  }

  // ---- awards
  private awardObjs: Phaser.GameObjects.GameObject[] = [];

  private showAwards(): void {
    for (const o of this.awardObjs) o.destroy();
    this.awardObjs = [];
    const awards = computeAwards(this.ms.match.stats);
    if (!awards.length) return;
    const top = 168;
    const g = this.add.graphics().setDepth(11);
    g.fillStyle(hexToNum(P.ink), 0.85).fillRect(VIEW_W / 2 - 150, top - 8, 300, 16 + awards.length * 18);
    this.awardObjs.push(g);
    awards.forEach((a, i) => {
      const who = this.nameOf(a.fighter);
      const y = top + i * 18;
      const t1 = this.add.bitmapText(VIEW_W / 2 - 140, y, 'pxo', a.title).setTint(0xf8c840).setDepth(12).setAlpha(0);
      const t2 = this.add.bitmapText(VIEW_W / 2 + 20, y, 'pxo', who.name).setTint(who.color).setDepth(12).setAlpha(0);
      const t3 = this.add.bitmapText(VIEW_W / 2 + 60, y + 2, 'sm', a.detail).setTint(0xc3c9dc).setDepth(12).setAlpha(0);
      this.tweens.add({ targets: [t1, t2, t3], alpha: 1, duration: 200, delay: 2600 + i * 450 });
      this.awardObjs.push(t1, t2, t3);
    });
  }

  private roundBanner(round: number): void {
    for (const o of this.awardObjs) o.destroy();
    this.awardObjs = [];
    const m = this.ms.match;
    const t = m.cfg.timeLimit ?? 180;
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const subs: Record<string, string> = {
      deathmatch: `MOST KILLS IN ${clock} WINS`,
      koth: 'STAND ON THE HILL. ALONE.',
      juggernaut: 'KILL THE JUGGERNAUT. BECOME THE JUGGERNAUT.',
      gungame: 'EVERY KILL UPGRADES YOUR GUN. KNIFE KILL WINS.',
      coop: 'SURVIVE THE WAVES. HOLD INTERACT OVER A FRIEND TO REVIVE.',
    };
    if (m.cfg.mode === 'brawl') this.showBanner('ROUND ' + round, 'FIGHT!', 0xffffff, 1.2);
    else this.showBanner(MODE_NAMES[m.cfg.mode], subs[m.cfg.mode], 0xffffff, 2);
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
      parts.push({ text: v.name, color: v.color }, { text: ENV_DEATHS[weapon] ?? ENV_DEATHS[cause] ?? 'FELL', color: 0xaaaaaa });
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
        if (PROP_QUIPS[e.weapon] && e.killer !== e.victim) this.showAnnounce(PROP_QUIPS[e.weapon], 0xfff4a0);
        else if (e.killer >= 0 && e.killer !== e.victim && e.env && KILL_QUIPS[e.cause]) this.showAnnounce(KILL_QUIPS[e.cause], 0xfff4a0);
        else if (e.killer === e.victim) this.showAnnounce('SELF-DESTRUCTED', 0xaaaaaa);
      }
    }
    ms.ui.length = 0;
    for (const e of ms.matchEvents) {
      if (e.t === 'roundStart') this.roundBanner(e.round);
      else if (e.t === 'juggernaut') this.showAnnounce(`${this.nameOf(e.f).name} IS THE JUGGERNAUT!`, 0xea4a4a);
      else if (e.t === 'gunLevel' && e.up && e.level === GUN_LADDER.length - 1) this.showAnnounce(`${this.nameOf(e.f).name} HAS THE KNIFE!`, 0xf8c840);
      else if (e.t === 'gunLevel' && !e.up) this.showAnnounce(`${this.nameOf(e.f).name} GOT HUMILIATED`, 0xaaaaaa);
      else if (e.t === 'wave') this.showBanner(e.boss ? 'BOSS WAVE' : 'WAVE ' + e.wave, e.boss ? 'BIG ONE INCOMING' : 'HERE THEY COME', e.boss ? 0xea4a4a : 0xffffff, 1.6);
      else if (e.t === 'waveCleared') this.showAnnounce('WAVE CLEARED!', 0x5ac85a);
      else if (e.t === 'revive') this.showAnnounce(`${this.nameOf(e.by).name} REVIVED ${this.nameOf(e.f).name}!`, 0x5ac85a);
      else if (e.t === 'hill' && e.team !== null) this.showAnnounce(`${this.teamName(e.team).name} HOLDS THE HILL`, 0x5ac85a);
      else if (e.t === 'bounty') this.showAnnounce(`${this.nameOf(e.by).name} CLAIMS THE BOUNTY!`, 0xf8c840);
      else if (e.t === 'modifier') this.showCard(e.id);
      else if (e.t === 'suddenDeath') this.showAnnounce(e.level >= 2 ? 'NO MERCY!' : 'SUDDEN DEATH!', 0xea4a4a);
      else if (e.t === 'overtime') this.showBanner('OVERTIME', 'NEXT KILL WINS', 0xf8c840, 2);
      else if (e.t === 'roundEnd') {
        const tn = this.teamName(e.winnerTeam);
        this.showBanner(e.winnerTeam === null ? 'DRAW!' : tn.name + ' WINS', e.winnerTeam === null ? 'EVERYBODY DIED' : 'THE ROUND', tn.color, 2.4);
      } else if (e.t === 'matchEnd') {
        const tn = this.teamName(e.winnerTeam);
        this.showBanner(tn.name + ' WINS!', 'BRAWLKAI CHAMPION', tn.color, 2.5);
        this.showAwards();
      } else if (e.t === 'multiKill') {
        const words = ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'MULTI KILL!', 'RAMPAGE!!'];
        this.showAnnounce(words[Math.min(5, e.count)], 0xf07a2a);
      }
    }
    ms.matchEvents.length = 0;

    // ---- chaos card & label
    if (this.card) {
      this.cardTime -= dt;
      if (this.cardTime <= 0) {
        this.card.destroy();
        this.card = null;
      } else if (this.cardTime < 0.4) this.card.setAlpha(this.cardTime / 0.4);
    }
    const mods = m.roundModifiers.map((id) => MODIFIER_BY_ID[id]?.name ?? id);
    this.modLabel.setText(mods.length ? 'CHAOS: ' + mods.join(' + ') : '');

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
    const dm = m.cfg.mode !== 'brawl';
    if (m.cfg.mode === 'coop') {
      this.roundText.setText(`CO-OP SURVIVAL  -  WAVE ${m.wave}/${COOP.victoryWave}  -  LIVES ${m.lives}`).setTint(m.lives === 0 ? 0xea4a4a : 0xffffff);
    } else if (dm) {
      const tl = Math.ceil(m.timeLeft);
      const clock = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
      const goal = m.cfg.mode === 'koth' ? `  -  FIRST TO ${m.cfg.target ?? KOTH_TARGET}` : m.cfg.mode === 'juggernaut' ? `  -  FIRST TO ${m.cfg.target ?? JUGGERNAUT.target}` : '';
      this.roundText.setText(m.overtime ? `${MODE_NAMES[m.cfg.mode]}  -  OVERTIME` : `${MODE_NAMES[m.cfg.mode]}  -  ${clock}${goal}`).setTint(tl <= 10 && m.phase === 'fight' ? 0xea4a4a : 0xffffff);
    } else {
      const sd = ms.match.world.suddenDeath > 0 ? '  -  SUDDEN DEATH' : '';
      this.roundText.setText(`ROUND ${m.round}  -  FIRST TO ${m.cfg.roundsToWin}${sd}`).setTint(sd ? 0xea4a4a : 0xffffff);
    }
    const teams: number[] = [];
    m.cfg.fighters.forEach((f, i) => {
      const t = teamKey({ id: i, team: f.team });
      if (!teams.includes(t)) teams.push(t);
    });
    const g = this.gfx;
    g.clear();
    while (this.scoreTexts.length < teams.length) this.scoreTexts.push(this.add.bitmapText(0, 0, 'smo', ''));
    const pip = 4;
    const entryW = (t: number) => textWidth(this.teamName(t).name, 'smo') + 4 + (dm ? (m.cfg.mode === 'gungame' ? 24 : 14) : m.cfg.roundsToWin * (pip + 1));
    const shown = teams.slice(0, 10);
    const total = shown.reduce((s, t) => s + entryW(t) + 10, -10);
    let x = Math.round(VIEW_W / 2 - total / 2);
    shown.forEach((t, i) => {
      const tn = this.teamName(t);
      const txt = this.scoreTexts[i].setText(tn.name).setTint(tn.color).setPosition(x, 12).setVisible(true);
      const score = m.scores.get(t) ?? 0;
      let px = x + txt.width + 3;
      if (dm) {
        while (this.dmScores.length <= i) this.dmScores.push(this.add.bitmapText(0, 0, 'smo', ''));
        const label = m.cfg.mode === 'gungame' ? `${Math.min(score + 1, GUN_LADDER.length)}/${GUN_LADDER.length}` : String(score);
        this.dmScores[i].setText(label).setPosition(px, 12).setVisible(true).setTint(m.cfg.mode === 'koth' && m.hillTeam === t ? 0x5ac85a : 0xfff4a0);
      } else this.dmScores[i]?.setVisible(false);
      for (let r = 0; r < (dm ? 0 : m.cfg.roundsToWin); r++) {
        g.fillStyle(hexToNum(P.ink), 1).fillRect(px - 1, 12, pip + 2, pip + 3);
        g.fillStyle(r < score ? tn.color : 0x3a3448, 1).fillRect(px, 13, pip, pip + 1);
        px += pip + 1;
      }
      x += entryW(t) + 10;
    });
    for (let i = shown.length; i < this.scoreTexts.length; i++) this.scoreTexts[i].setVisible(false);
    for (let i = dm ? shown.length : 0; i < this.dmScores.length; i++) this.dmScores[i].setVisible(false);

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

    // ---- player panels: name + hero ability, HP, active weapon + ammo, 5 inventory slots
    const humans = ms.players.map((p, i) => ({ p, i })).filter(({ p }) => isHumanInput(p.input));
    humans.forEach(({ p, i }, n) => {
      const f = w.fighters[i];
      const [nameT, weapT, ammoT, powT, abilT] = this.panelTexts[n];
      const right = n % 2 === 1;
      const inner = n >= 2; // players 3/4 sit next to players 1/2
      const PW = PANEL_W;
      const px = right ? VIEW_W - PW - 6 - (inner ? PW + 6 : 0) : 8 + (inner ? PW + 6 : 0);
      const py = VIEW_H - 57;
      // a fighter behind the panel (camera at the map's bottom edge): fade it so nobody is hidden
      const a = this.panelBlocked(px - 3, py - 3 - (f.alive && f.power ? 12 : 0), PW, 56) ? 0.3 : 1;
      this.panelAlpha[n] = a;
      g.fillStyle(hexToNum(P.ink), 0.78 * a).fillRect(px - 3, py - 3, PW, 56);
      g.lineStyle(1, p.color, a).strokeRect(px - 3.5, py - 3.5, PW + 1, 57);
      for (const t of this.panelTexts[n]) t.setAlpha(a);
      for (const t of this.panelCounts[n]) t.setAlpha(a);
      nameT.setText(p.label).setTint(p.color).setPosition(px, py);
      const barW0 = PW - 7;
      // hero abilities: three chips A / K / S (ability 1, ability 2 on the kick key, super = both).
      // Each fills as its cooldown recovers (Naruto's K chip waits until his clones are gone).
      const hero = f.alive ? heroDef(f.hero) : null;
      const chipTexts = [this.panelTexts[n][5], this.panelTexts[n][6], this.panelTexts[n][7]];
      abilT.setVisible(false);
      if (hero) {
        const sup = transformed(f);
        const chips: { frac: number; on: boolean; col: number }[] = [
          { frac: 1 - Math.max(0, f.baseCd) / hero.base.cooldown, on: f.baseCd <= 0, col: hexToNum(P.orange) },
          // shadow clones out: the chip stays lit (pressing again recalls them) and the cooldown waits
          f.cloneCount > 0
            ? { frac: 1, on: true, col: 0xa8e0ff }
            : { frac: 1 - Math.max(0, f.secondCd) / hero.second.cooldown, on: f.secondCd <= 0, col: hexToNum(P.yellow) },
          { frac: sup ? 1 - Math.max(0, f.specialCd) / hero.super.cooldown : 0, on: sup && f.specialCd <= 0, col: hexToNum(P.red2) },
        ];
        const ch = hero.base.charges;
        if (ch) {
          // charged ability (Luffy's arm): the chip is split into one bar per charge; a spent one refills on its own
          const avail = ch.max - f.baseUsed;
          chips[0] = { frac: 0, on: avail > 0 && f.baseCd <= 0, col: hexToNum(P.orange) };
        }
        chips.forEach((c, k) => {
          const cx = px + PW - 12 - (2 - k) * 13;
          g.fillStyle(hexToNum(P.ink), a).fillRect(cx - 5, py - 1, 11, 10);
          g.fillStyle(0x2a2438, a).fillRect(cx - 4, py, 9, 8);
          if (k === 0 && ch) {
            const avail = ch.max - f.baseUsed;
            const segW = Math.floor(9 / ch.max);
            for (let s = 0; s < ch.max; s++) {
              const sf = s < avail ? 1 : s === avail ? 1 - Math.max(0, f.baseRecharge) / ch.recharge : 0;
              const hgt = Math.round(8 * Math.max(0, Math.min(1, sf)));
              g.fillStyle(c.col, a * (s < avail ? 1 : 0.55)).fillRect(cx - 4 + s * segW,py + 8 - hgt, segW - 1, hgt);
            }
          } else g.fillStyle(c.col, a * (c.on ? 1 : 0.55)).fillRect(cx - 4, py + 8 - Math.round(8 * Math.max(0, Math.min(1, c.frac))), 9, Math.round(8 * Math.max(0, Math.min(1, c.frac))));
          if (c.on && Math.floor(this.time.now / 250) % 2 === 0 && k === 2) g.lineStyle(1, 0xffffff, a).strokeRect(cx - 4.5, py - 0.5, 10, 9);
          chipTexts[k].setVisible(true).setPosition(cx, py + 1).setTint(c.on ? hexToNum(P.ink) : 0x8d95b0).setAlpha(a);
        });
      } else chipTexts.forEach((t) => t.setVisible(false));
      // form health: one thin bar per transformation level, stacked above the HP bar (D61)
      if (f.alive && f.power === 'hero') {
        const col = hexToNum(formFx(f.hero, f.powerLevel).aura[0]);
        const layers = formLayers(f);
        for (let k = 0; k < layers; k++) {
          const frac = Math.max(0, Math.min(1, (f.formHp - k * FORM_HP) / FORM_HP));
          const ly = py + 10 + (3 - k) * 3; // the first layer sits right above the HP bar
          g.fillStyle(0x3a3448, a).fillRect(px, ly, barW0, 2);
          g.fillStyle(col, a).fillRect(px, ly, Math.round(barW0 * frac), 2);
        }
      }
      // HP (full width) with boost timers underneath
      const hpFrac = Math.max(0, f.hp) / f.maxHp;
      const barW = PW - 7;
      g.fillStyle(0x3a3448, a).fillRect(px, py + 22, barW, 4);
      const hpCol = hpFrac > 0.6 ? P.green2 : hpFrac > 0.3 ? P.yellow : P.red2;
      g.fillStyle(hexToNum(f.burn > 0 && Math.floor(this.time.now / 120) % 2 ? P.orange : hpCol), a).fillRect(px, py + 22, Math.round(barW * hpFrac), 4);
      if (f.alive && f.speedBoost > 0) g.fillStyle(hexToNum(P.yellow), a).fillRect(px, py + 26, Math.round(barW * Math.min(1, f.speedBoost / 10)), 1);
      if (f.alive && f.strengthBoost > 0) g.fillStyle(hexToNum(P.red2), a).fillRect(px, py + 27, Math.round(barW * Math.min(1, f.strengthBoost / 12)), 1);
      const def = activeWeapon(f);
      const item = f.inv[f.active];
      const ghostText = f.ghost ? (f.ghostCd <= 0 ? 'GHOST: ATTACK = BOO!' : `GHOST: BOO IN ${Math.ceil(f.ghostCd)}`) : 'DEAD';
      weapT.setText(f.alive ? def.name : ghostText).setPosition(px, py + 29).setTint(f.alive ? 0xffffff : f.ghost ? 0xb0e0ff : 0x888888);
      const ammo = item && (def.gun || def.throw) ? 'x' + item.ammo : item && def.gadget?.kind === 'jetpack' ? Math.ceil(item.ammo * 10) / 10 + 'S' : '';
      ammoT.setText(f.alive ? ammo : '').setPosition(px + PW - 8 - ammoT.width, py + 29).setTint(item && def.gun && item.ammo <= 3 ? hexToNum(P.red2) : 0xfff4a0);
      // transformation: form name + level pips + time left (above the panel)
      if (f.alive && f.power) {
        const isHero = f.power === 'hero';
        const col = hexToNum((isHero ? formFx(f.hero, f.powerLevel).aura : BOOST_COLORS)[0]);
        const lvlMax = heroDef(f.hero)?.forms.length ?? 0;
        powT.setText(formName(f)).setPosition(px, py - 13).setTint(col).setVisible(true);
        g.fillStyle(hexToNum(P.ink), 0.75 * a).fillRect(px - 3, py - 15, PW, 11);
        if (isHero) for (let l = 0; l < lvlMax; l++) g.fillStyle(l < f.powerLevel ? col : 0x3a3448, a).fillRect(px + PW - 8 - (lvlMax - l) * 7, py - 12, 5, 5);
        if (!isHero) g.fillStyle(col, a).fillRect(px - 3, py - 5, Math.round(PW * Math.max(0, f.powerTime / f.powerMax)), 1);
      } else powT.setVisible(false);
      for (let s = 0; s < 5; s++) {
        const bx = px + s * 20;
        const by = py + 38;
        const inv = f.inv[s];
        const active = f.active === s && f.alive;
        g.fillStyle(active ? 0x4a4060 : 0x241e32, a).fillRect(bx, by, 18, 12);
        if (active) g.lineStyle(1, 0xffffff, a).strokeRect(bx - 0.5, by - 0.5, 19, 13);
        const icon = this.panelIcons[n][s];
        const cnt = this.panelCounts[n][s];
        const wf = inv ? Art.weapon(inv.id) : undefined;
        if (wf && f.alive) {
          const k = Math.min(1, 17 / wf.w, 11 / wf.h);
          icon.setVisible(true).setTexture(wf.key, wf.frame).setScale(k).setPosition(bx + 9, by + 6).setAlpha((active ? 1 : 0.7) * a);
        } else icon.setVisible(false);
        const idef = inv ? weaponDef(inv.id) : null;
        cnt.setText(inv && f.alive && idef?.throw ? String(inv.ammo) : '').setPosition(bx + 18, by + 13);
      }
    });

    // ---- instant replay: letterbox + label
    if (ms.replay) {
      g.fillStyle(0x000000, 1).fillRect(0, 0, VIEW_W, 22).fillRect(0, VIEW_H - 22, VIEW_W, 22);
      if (Math.floor(this.time.now / 400) % 2 === 0) g.fillStyle(0xea4a4a, 1).fillCircle(14, 11, 4);
    }
    this.replayText.setVisible(!!ms.replay);
    this.roundText.setVisible(!ms.replay);
    this.modLabel.setVisible(!ms.replay);
    for (const t of this.scoreTexts) if (ms.replay) t.setVisible(false);
    for (const t of this.dmScores) if (ms.replay) t.setVisible(false);
    this.replaySub.setVisible(!!ms.replay && ms.replay.ready);

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
      if (!f.alive || f.gone || f.master >= 0) continue; // (no arrows for shadow clones)
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
    const showPause = ms.paused && !ms.overlayOpen;
    this.pauseDim.setVisible(ms.paused);
    this.pauseText.setVisible(showPause);
    this.pauseSub.setVisible(showPause);
    if (showPause && !this.wasPaused) this.pauseIdx = 0;
    else if (showPause) {
      // (input ignored on the frame the menu opens: START both pauses and confirms)
      if (menu.up()) {
        this.pauseIdx = (this.pauseIdx - 1 + PAUSE_ITEMS.length) % PAUSE_ITEMS.length;
        audio.play('uiMove');
      }
      if (menu.down()) {
        this.pauseIdx = (this.pauseIdx + 1) % PAUSE_ITEMS.length;
        audio.play('uiMove');
      }
      if (menu.confirm()) ms.pauseAction(PAUSE_ITEMS[this.pauseIdx].action);
    }
    this.wasPaused = ms.paused;
    this.pauseItems.forEach((t, i) => t.setVisible(showPause).setText((i === this.pauseIdx ? '> ' : '') + PAUSE_ITEMS[i].label).setTint(i === this.pauseIdx ? 0xffffff : 0x8d95b0));
    if (ms.wr?.debug) {
      const alive = w.fighters.filter((f) => f.alive).length;
      this.debugText.setText(`FPS ${Math.round(this.game.loop.actualFps)}  SPEED ${ms.speed}X  TICK ${w.tick}  ALIVE ${alive}  BULLETS ${w.bullets.filter((b) => b.active).length}`);
    } else this.debugText.setText('');
  }
}
