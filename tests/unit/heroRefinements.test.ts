import { describe,expect,it } from 'vitest';
import { applyHit } from '../../src/sim/combat';
import { HEROES } from '../../src/sim/data/heroes';
import { ignite } from '../../src/sim/fire';
import { amaterasuTarget,fireBomb,superGuard,transform } from '../../src/sim/hero';
import { World } from '../../src/sim/world';
import { FLAT,intent,run } from './helpers';
import { moveLook } from '../../src/art/heroMoves';
import { renderSfx } from '../../src/audio/sfxr';
import { SOUNDS } from '../../src/audio/sounds';
import { applyWorld,encodeWorld } from '../../src/net/renderState';

function arena(hero='sasuke',level=0){
  const w=new World(FLAT,[{hero,name:'A',team:0,isBot:false,upJumps:false},
    {name:'B',team:0,isBot:false,upJumps:false}],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},99);
  run(w,5);
  w.fighters.forEach((f,i)=>{f.x=f.px=i?360:70;f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.facing=1;});
  for(let i=0;i<level;i++)transform(w,w.fighters[0]);
  w.events.length=0;return w;
}

for(const hero of ['naruto','luffy','goku','sasuke'])describe(`${hero} ultimate protection`,()=>{
  it('rejects damage, knockback, fire and ignoreInvuln hits during the move; ends with the move',()=>{
    const w=arena(hero,4),f=w.fighters[0];
    w.step([intent({ability:true,kick:true})]);run(w,8);
    expect(superGuard(f)).toBe(true);
    const before={hp:f.hp,form:f.formHp,vx:f.vx,vy:f.vy,state:f.state};
    for(const kind of ['bullet','melee','explosion','fire','hazard'] as const){
      expect(applyHit(w,f,{damage:999,kbX:999,kbY:-999,attacker:1,weapon:'test',kind,stun:1,knockdown:true,ignoreInvuln:true})).toBe(false);
    }
    ignite(w,f,5,1);
    expect(f.burn).toBe(0);
    expect({hp:f.hp,form:f.formHp,vx:f.vx,vy:f.vy,state:f.state}).toEqual(before);
    run(w,100);
    expect(superGuard(f)).toBe(false);
    expect(applyHit(w,f,{damage:4,kbX:0,kbY:0,attacker:1,weapon:'pistol',kind:'bullet'})).toBe(true);
  });

  it('cannot be grabbed out of an ultimate',()=>{
    const w=arena(hero,4),[f,b]=w.fighters;
    w.step([intent({ability:true,kick:true})]);
    b.x=b.px=f.x+8;b.y=b.py=f.y;b.facing=-1;
    w.step([intent(),intent({interact:true})]);
    expect(f.state).toBe('special');expect(b.state).not.toBe('grabbing');
  });

  it('keeps protection in environmental kill zones only until the animation finishes',()=>{
    const w=arena(hero,4),f=w.fighters[0];
    w.step([intent({ability:true,kick:true})]);
    f.y=f.py=w.killY+5;f.grounded=false;
    w.step([intent()]);expect(f.alive).toBe(true);
    run(w,100);expect(f.alive).toBe(false);
  });
});

describe('Amaterasu',()=>{
  for(const level of [3,4])it(`form ${level} ignites the target directly without a projectile`,()=>{
    const w=arena('sasuke',level),[f,b]=w.fighters;b.x=b.px=190;
    w.step([intent({kick:true})]);run(w,40);
    expect(w.bullets.some(b=>b.weapon==='sasuke:second')).toBe(false);
    expect(b.burnStyle).toBe('amaterasu');expect(b.burn).toBeGreaterThan(2);
    expect(b.hp).toBeLessThan(100);expect(f.secondCd).toBeGreaterThan(3);
    expect(w.events.some(e=>e.t==='amaterasu'&&e.target===b.id)).toBe(true);
    run(w,70);
    expect(w.events.some(e=>e.t==='hit'&&e.weapon==='amaterasu')).toBe(true);
  });

  it('requires range, facing and clear line of sight',()=>{
    const w=arena('sasuke',3),[f,b]=w.fighters;
    b.x=b.px=f.x+400;expect(amaterasuTarget(w,f)).toBe(null);
    b.x=b.px=200;expect(amaterasuTarget(w,f)).toBe(b);
    f.facing=-1;expect(amaterasuTarget(w,f)).toBe(null);f.facing=1;
    w.map.set(8,8,1);expect(amaterasuTarget(w,f)).toBe(null);
  });

  it('does not target allies or ignite an invulnerable dodging target',()=>{
    const w=arena('sasuke',3),[f,b]=w.fighters;b.x=b.px=190;
    f.team=b.team=1;expect(amaterasuTarget(w,f)).toBe(null);
    f.team=b.team=0;b.invuln=2;
    w.step([intent({kick:true})]);run(w,40);
    expect(b.hp).toBe(100);expect(b.burn).toBe(0);
  });

  it('is instant: the target burns on the press tick, before it can leave range',()=>{
    const w=arena('sasuke',3),[,b]=w.fighters;b.x=b.px=180;
    w.step([intent({kick:true})]);run(w,6); // (a transformed press waits SUPER_WINDOW, 0.1 s, for the other button)
    expect(b.burnStyle).toBe('amaterasu');expect(b.burn).toBeGreaterThan(2);expect(b.hp).toBeLessThan(100);
    b.x=b.px=600;run(w,30);expect(b.burn).toBeGreaterThan(0);
  });

  it('forms below Mangekyo still fire travelling fireballs',()=>{
    for(const level of [0,1,2]){
      const w=arena('sasuke',level);w.step([intent({kick:true})]);run(w,29);
      expect(w.bullets.some(b=>b.active&&b.weapon==='sasuke:second')).toBe(true);
      expect(w.events.some(e=>e.t==='amaterasu')).toBe(false);
    }
  });

  it('sends the black-flame appearance to online spectators',()=>{
    const w=arena('sasuke',3),mirror=arena('sasuke',3);w.fighters[1].x=w.fighters[1].px=190;
    w.step([intent({kick:true})]);run(w,40);
    applyWorld(mirror,JSON.parse(JSON.stringify(encodeWorld(w))));
    expect(mirror.fighters[1].burnStyle).toBe('amaterasu');
    expect(mirror.fighters[1].burn).toBeGreaterThan(0);
  });
});

describe('transformed combo reach',()=>{
  for(const hero of ['luffy','sasuke','naruto','goku'])it(`${hero}'s visible reach agrees with its melee hitbox`,()=>{
    const level=4;
    for(const offset of [-.5,2]){
      const w=arena(hero,level),[f,b]=w.fighters,hit=HEROES[hero].combo[0];
      b.x=b.px=f.x+f.w/2+hit.range+HEROES[hero].forms[level-1].reach+b.w/2+offset;
      f.state='melee';f.combo=0;f.stateTime=hit.windup+.005;
      w.step([intent()]);
      expect(b.hp<100).toBe(offset<0);
    }
  });
  it('Luffy reaches farther in every successive gear',()=>{
    const reach=HEROES.luffy.forms.map(f=>f.reach);
    for(let i=1;i<reach.length;i++)expect(reach[i]).toBeGreaterThan(reach[i-1]);
  });
});

it('Kurama launches the final Bijudama from the avatar mouth',()=>{
  const w=arena('naruto',4),f=w.fighters[0];
  fireBomb(w,f,HEROES.naruto.super.bomb!,4);
  const b=w.bullets.find(b=>b.active)!;
  expect(b.x).toBe(f.x+53);expect(b.y).toBe(f.y-27);
});

it('Chidori stays blue in every form, with a distinct deterministic chirping sound',()=>{
  for(let i=1;i<=4;i++){
    expect(moveLook('sasuke',i).core).toBe(moveLook('sasuke',0).core);
    expect(moveLook('sasuke',i).rim).toBe(moveLook('sasuke',0).rim);
  }
  const chirp=renderSfx(SOUNDS.chidori,22050),dash=renderSfx(SOUNDS.chidoriDash,22050);
  expect(chirp.length).toBeGreaterThan(6000);expect(dash.length).toBeGreaterThan(12000);
  expect(chirp.every(Number.isFinite)).toBe(true);expect(dash.every(Number.isFinite)).toBe(true);
  expect(chirp).toEqual(renderSfx(SOUNDS.chidori,22050));
  expect(chirp.some(v=>Math.abs(v)>.15)).toBe(true);
});
