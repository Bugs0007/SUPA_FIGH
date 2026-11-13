import Phaser from 'phaser';
import { pokemonFrame } from '../art/pokemonArt';
import { dragonFlame } from '../art/charizardMotion';
import { audio } from '../audio/AudioManager';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { POKEMON_PARTNERS, pokemonSpecies, pokemonStage, pokemonTeam, type PokemonSpecies } from '../sim/data/pokemon';

/** The default partner is first; additional balls are opt-in and retain this order in battle. */
export class PokemonTeamPicker {
  private readonly root: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly states: Phaser.GameObjects.BitmapText[] = [];
  private readonly footer: Phaser.GameObjects.BitmapText;
  private team: PokemonSpecies[];
  private focused = 0;

  constructor(
    scene: Phaser.Scene,
    team: unknown,
    first: PokemonSpecies | undefined,
    private readonly changed: (team: PokemonSpecies[], first: PokemonSpecies) => void,
    private readonly closed: () => void,
  ) {
    this.team = pokemonTeam(team, pokemonSpecies(first));
    this.focused = POKEMON_PARTNERS.indexOf(this.team[0]);
    this.root = scene.add.container(0, 0).setDepth(2000);
    this.gfx = scene.add.graphics();
    this.root.add(this.gfx);
    const text = (x: number, y: number, font: string, value: string, tint = 0xc3cfe0) => {
      const t = scene.add.bitmapText(x, y, font, value).setTint(tint);
      this.root.add(t);
      return t;
    };
    text(40, 41, 'pxo', 'ASH / POKEMON TEAM', 0xffdc69).setScale(1.5);
    text(40, 62, 'sm', 'ONE DEFAULT PARTNER. ADD UP TO 8 BALLS. ONLY ONE PARTNER OUT AT A TIME.');
    POKEMON_PARTNERS.forEach((species, i) => {
      const x = 40 + i % 4 * 142;
      const y = 82 + Math.floor(i / 4) * 94;
      const portrait = scene.add.graphics().setPosition(x + 66, y + 55).setScale(3);
      const frame = pokemonFrame(species, 0, 'idle', 0, false);
      for (const run of frame.sprite.runs) portrait.fillStyle(run.c).fillRect(run.x - frame.originX, run.y - frame.originY, run.w, 1);
      if (frame.fire) {
        const { tail, size } = frame.fire;
        for (const run of dragonFlame(size, 2, false).runs) portrait.fillStyle(run.c).fillRect(tail[0] + run.x - size - 2, tail[1] + run.y - size - 3, run.w, 1);
      }
      this.root.add(portrait);
      text(x + 66, y + 66, 'pxo', pokemonStage(species, 0).name).setOrigin(0.5);
      this.states.push(text(x + 8, y + 6, 'sm', ''));
      const card = scene.add.zone(x, y, 132, 86).setOrigin(0).setInteractive({ useHandCursor: true });
      card.on('pointerover', () => { this.focused = i; this.draw(); });
      card.on('pointerdown', () => { this.focused = i; this.toggle(); });
      this.root.add(card);
      const primary = text(x + 115, y + 6, 'smo', '*', 0xffdc69).setInteractive({ useHandCursor: true });
      primary.on('pointerdown', () => { this.focused = i; this.makeDefault(); });
    });
    this.footer = text(40, 274, 'sm', '');
    text(40, 294, 'sm', 'ARROWS SELECT   ENTER ADD / REMOVE   D SET DEFAULT   ESC DONE');
    const all = text(40, 312, 'pxo', '[ ADD ALL ]', 0xffdc69).setInteractive({ useHandCursor: true });
    all.on('pointerdown', () => { this.team = pokemonTeam(POKEMON_PARTNERS, this.team[0]); this.save(); });
    const done = text(596, 312, 'pxo', '[ DONE ]', 0xffffff).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    done.on('pointerdown', () => this.close());
    this.draw();
  }

  update(): void {
    let next = this.focused;
    if (menu.left()) next = (next + 7) % 8;
    else if (menu.right()) next = (next + 1) % 8;
    else if (menu.up() || menu.down()) next = (next + 4) % 8;
    if (next !== this.focused) { this.focused = next; audio.play('uiMove'); this.draw(); }
    if (menu.back()) this.close();
    else if (keyboard.justPressed('KeyD')) this.makeDefault();
    else if (menu.confirm()) this.toggle();
  }

  private toggle(): void {
    const species = POKEMON_PARTNERS[this.focused];
    if (species === this.team[0]) {
      audio.play('uiBack');
      this.footer.setText('THIS IS THE DEFAULT. SET ANOTHER DEFAULT BEFORE REMOVING IT.');
      return;
    }
    this.team = this.team.includes(species) ? this.team.filter(s => s !== species) : [...this.team, species];
    this.save();
  }

  private makeDefault(): void {
    this.team = pokemonTeam(this.team, POKEMON_PARTNERS[this.focused]);
    this.save();
  }

  private save(): void {
    this.changed(this.team.slice(), this.team[0]);
    audio.play('uiOk');
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear().fillStyle(0x080912, 0.94).fillRect(0, 0, 640, 360)
      .fillStyle(0x161c2d).fillRect(24, 28, 592, 308).lineStyle(1, 0x8f7950).strokeRect(24, 28, 592, 308);
    POKEMON_PARTNERS.forEach((species, i) => {
      const x = 40 + i % 4 * 142, y = 82 + Math.floor(i / 4) * 94;
      const chosen = this.team.includes(species), focused = this.focused === i;
      g.fillStyle(chosen ? 0x2d3b3f : 0x202638).fillRect(x, y, 132, 86)
        .lineStyle(focused ? 2 : 1, focused ? 0xffdc69 : chosen ? 0x7ccca3 : 0x40495f).strokeRect(x, y, 132, 86);
      this.states[i].setText(species === this.team[0] ? 'DEFAULT' : chosen ? 'IN TEAM' : '+ ADD')
        .setTint(species === this.team[0] ? 0xffdc69 : chosen ? 0x91e9b6 : 0x8b99b2);
    });
    this.footer.setText(this.team.length + ' / 8 POKEMON  -  SWITCH BALLS TO RETURN YOUR ACTIVE PARTNER.');
  }

  private close(): void {
    this.root.destroy(true);
    audio.play('uiBack');
    this.closed();
  }
}
