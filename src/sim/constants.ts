// Global simulation tunables. Units: px, seconds, radians. y grows downward.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const TILE = 16;

export const GRAVITY = 1000;
export const MAX_FALL = 540;

// Fighter body
export const FIGHTER_W = 10;
export const FIGHTER_H = 22;
export const FIGHTER_CROUCH_H = 14;
export const FIGHTER_ROLL_H = 12;
export const MAX_HP = 100;

// Shoulder height above the feet (arm/weapon pivot). Must match the art frame metadata.
export const SHOULDER_Y_STAND = 15;
export const SHOULDER_Y_CROUCH = 7;
export const SHOULDER_X = 0;
export const ARM_LONG = 7;
export const ARM_SHORT = 5;

// Movement
export const RUN_SPEED = 118;
export const CRAWL_SPEED = 45;
export const GROUND_ACCEL = 1500;
export const GROUND_DECEL = 1900;
export const AIR_ACCEL = 950;
export const AIR_DECEL = 300;
export const JUMP_VEL = 335;
export const JUMP_CUT = 0.45; // vy multiplier when jump is released early
export const COYOTE_TIME = 0.09;
export const JUMP_BUFFER = 0.11;
export const CLIMB_SPEED = 82;
export const ROLL_SPEED = 200;
export const ROLL_TIME = 0.4;
export const ROLL_IFRAMES = 0.3;
export const DIVE_VX = 230;
export const DIVE_VY = -130;
export const LEDGE_CLIMB_TIME = 0.18;
// Double jump / wall jump / sprint
export const AIR_JUMPS = 1; // extra jumps while airborne (refreshed on landing and by wall jumps)
export const AIR_JUMP_VEL = 300;
export const WALL_JUMP_VX = 190;
export const WALL_JUMP_VY = 320;
export const WALL_JUMP_LOCK = 0.16; // seconds of reduced air control after a wall jump
export const WALL_SLIDE_MAX = 150; // max fall speed while pressing into a wall
export const SPRINT_TAP_WINDOW = 0.25; // double-tap a direction within this window to sprint
export const SPRINT_MUL = 1.45;
export const SPRINT_RAMP = 0.18; // seconds to reach full sprint speed
export const SPRINT_COOLDOWN = 0.35;

// Aiming
export const AIM_MAX_SPEED = 2.7; // rad/s at full stick
export const AIM_ACCEL = 14; // how fast aim speed ramps (smoothness)
export const AIM_LIMIT = 1.45; // ~83 degrees up/down
export const AIM_MEMORY = 0.45; // re-aiming within this window keeps the previous angle

// Combat
export const HIT_FLINCH = 0.14;
export const KNOCKDOWN_TIME = 0.45;
export const GRAB_RANGE = 14;
export const GRAB_TIME_MAX = 1.6;
export const THROW_SPEED_X = 330;
export const THROW_SPEED_Y = -170;
export const FALL_DAMAGE_SPEED = 470; // vy above this on landing hurts (thrown bodies)

// Items
export const ITEM_PICKUP_RANGE = 12;
export const CORPSE_FRICTION = 0.86;

// Rounds
export const ROUND_END_CONFIRM = 0.9; // seconds after last kill before the round is decided
export const ROUND_END_TIME = 2.6; // banner time before the next round
export const MATCH_END_TIME = 9; // awards screen
export const LAST_HIT_CREDIT = 6;
// Modes
export const SUDDEN_DEATH_DRAIN_AFTER = 15; // seconds after sudden death starts until HP drains
export const SUDDEN_DEATH_DPS = 2;
export const RESPAWN_PROTECTION = 1.5;
// Ghosts (Brawl): the dead haunt the living
export const GHOST_DELAY = 1.2; // seconds after death before the ghost rises
export const GHOST_SPEED = 110;
export const GHOST_COOLDOWN = 8; // poltergeist recharge
export const GHOST_RADIUS = 52; // environmental deaths within N seconds credit the last attacker
