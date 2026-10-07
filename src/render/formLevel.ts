import type { Fighter } from '../sim/fighter';

/**
 * The hero form a fighter LOOKS like (0 = none). Shadow clones carry no power of their own (no form health,
 * no orbs), but wear their master's current form: same look, aura and tails.
 */
export function formLevel(f: Fighter): number {
  if (f.power === 'hero') return f.powerLevel;
  return f.master >= 0 ? f.cloneForm : 0;
}
