import {expect,it} from 'vitest';
import {World} from '../../src/sim/world';
import {transform,fireBomb} from '../../src/sim/hero';
import {avatarLaunch,HEROES} from '../../src/sim/data/heroes';
import {FLAT,intent,run} from './helpers';

function arena(hero:string){
  const w=new World(FLAT,[{hero,name:'A',team:0,isBot:false,upJumps:false},{name:'B',team:0,isBot:false,upJumps:false}],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},99);
  run(w,5);
  const [f,e]=w.fighters;
  f.x=f.px=70;f.y=f.py=144;e.x=e.px=300;e.y=e.py=80;
  for(const o of [f,e]){o.invuln=o.vx=o.vy=0;}
  for(let i=0;i<4;i++)transform(w,f);
  return w;
}
for(const hero of ['sasuke','naruto']){
  it(`${hero} fires from its vertically posed muzzle toward the locked enemy`,()=>{
    const w=arena(hero),[f,e]=w.fighters;f.lockOn=1;
    fireBomb(w,f,HEROES[hero].super.bomb!,4);
    const b=w.bullets.find(b=>b.active)!;expect(b).toBeDefined();
    const m=avatarLaunch(hero,4,f.stretchAngle);
    expect(b.x).toBeCloseTo(f.x+m.ahead);expect(b.y).toBeCloseTo(f.y-m.up);
    const len=Math.hypot(b.vx,b.vy),cross=(e.x-b.x)*b.vy/len-(e.y-e.h/2-b.y)*b.vx/len;
    expect(Math.abs(cross)).toBeLessThan(4);
  });
  it(`${hero} updates its vertical pose while charging at a moving target`,()=>{
    const w=arena(hero),[f,e]=w.fighters;
    w.step([intent({ability:true,kick:true})]);const first=f.stretchAngle;
    expect(f.lockOn).toBe(1);e.y=e.py=24;
    w.step([]);expect(f.stretchAngle).toBeLessThan(first);
  });
}
