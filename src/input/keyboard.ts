// Keyboard state tracked by physical key (event.code), independent of layout and NumLock.
// Taps shorter than a frame are latched so the sim always sees at least one "held" tick.

export class Keyboard {
  private down = new Set<string>();
  private latched = new Set<string>();
  private pressedThisFrame = new Set<string>();
  /** codes whose browser default (scrolling, etc.) we suppress */
  gameKeys = new Set<string>();
  private attached = false;

  attach(target: Window = window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('keydown', (e) => {
      if (!e.repeat) {
        this.latched.add(e.code);
        this.pressedThisFrame.add(e.code);
      }
      this.down.add(e.code);
      if (this.gameKeys.has(e.code) || e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  reset(): void {
    this.down.clear();
    this.latched.clear();
    this.pressedThisFrame.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** held now, or tapped since the last consume() of that code */
  held(code: string): boolean {
    return this.down.has(code) || this.latched.has(code);
  }

  consume(code: string): void {
    this.latched.delete(code);
  }

  /** edge: pressed since the last endFrame() (for menus) */
  justPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  anyJustPressed(): boolean {
    return this.pressedThisFrame.size > 0;
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
  }
}

export const keyboard = new Keyboard();
