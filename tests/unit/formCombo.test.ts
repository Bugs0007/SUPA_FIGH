import { describe,expect,it } from 'vitest';
import { World } from '../../src/sim/world';
import { transform,fireBomb,summonClones } from '../../src/sim/hero';
import { HEROES,SASUKE_ARROW } from '../../src/sim/data/heroes';
import { encodeWorld,applyWorld } from '../../src/net/renderState';
import { FLAT,intent,run } from './helpers';

function arena(hero:string,level=1){
  const w=new World(FLAT,[{hero,name:'A',team:0,isBot:false,upJumps:false},{name:'B',team:0,isBot:false,upJumps:false}],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},99);
  run(w,5);
  w.fighters.forEach((f,i)=>{f.x=f.px=i?260:70;f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.facing=1;});
  for(let i=0;i<level;i++)transform(w,w.fighters[0]);
  return w;
}
describe('form button combos',()=>{
  it.each(['sasuke','naruto','luffy','goku'])('%s accepts punch one tick before the ability',hero=>{
    const w=arena(hero),f=w.fighters[0];
    w.step([intent({attack:true})]);
    w.step([intent({attack:true,...(hero==='naruto'?{kick:true}:{ability:true})})]);
    expect(f.specialKind).toBe('formCombo');
  });
  it.each(['sasuke','naruto','luffy','goku'])('%s starts a distinct combo in form one and sends it online',hero=>{
    const w=arena(hero),f=w.fighters[0];
    w.step([intent({attack:true,...(hero==='naruto'?{kick:true}:{ability:true})})]);
    expect(f.specialKind).toBe('formCombo');
    expect(f.formComboCd).toBeGreaterThan(0);
    const mirror=arena(hero);applyWorld(mirror,JSON.parse(JSON.stringify(encodeWorld(w))));
    expect(mirror.fighters[0].specialKind).toBe('formCombo');
    run(w,55);expect(f.state).not.toBe('special');
  });
  it('Kirin bites once and consumes its own cooldown',()=>{
    const w=arena('sasuke'),f=w.fighters[0],enemy=w.fighters[1];
    w.step([intent({attack:true,ability:true})]);run(w,20);
    expect(enemy.hp).toBeLessThan(100);
    const hp=enemy.hp;run(w,25);expect(enemy.hp).toBe(hp);
    w.step([intent({attack:true,ability:true})]);expect(f.specialKind).not.toBe('formCombo');
  });
  it('nearby clones throw Naruto on tap and only disappear on a hold',()=>{
    const w=arena('naruto'),f=w.fighters[0];summonClones(w,f);
    const clone=w.fighters.find(c=>c.master===f.id&&c.alive)!;clone.x=f.x+10;clone.y=f.y;
    w.step([intent({kick:true})]);run(w,8);
    expect(f.cloneCount).toBeGreaterThan(0);expect(f.specialKind).toBe('formCombo');
    run(w,40,()=>[intent({kick:true})]);expect(f.cloneCount).toBe(0);
  });
  it('Up selects a power orb instead of the enemy for the clone throw',()=>{
    const w=arena('naruto'),f=w.fighters[0];
    const orb=w.spawnItem('powerorb',0,1,150,90);
    w.step([intent({attack:true,kick:true,moveY:-1})]);
    expect(f.lockOn).toBe(-1);expect(f.anchorX).toBe(orb.x);expect(f.anchorY).toBe(90);
  });
  it('arrows fire faster and turn toward a locked enemy that crossed behind',()=>{
    const w=arena('sasuke',4),f=w.fighters[0];
    w.fighters[1].x=350;f.x=260;f.facing=-1;f.lockOn=1;
    fireBomb(w,f,HEROES.sasuke.super.bomb!,4);
    const b=w.bullets.find(b=>b.active)!;
    expect(f.facing).toBe(1);expect(b.vx).toBeGreaterThan(0);
    expect(Math.hypot(b.vx,b.vy)).toBeCloseTo(430*SASUKE_ARROW.speedMul);
  });
});
