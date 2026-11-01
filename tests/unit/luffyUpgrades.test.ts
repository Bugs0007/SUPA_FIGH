import { expect, it } from 'vitest';
import { World } from '../../src/sim/world';
import { HEROES } from '../../src/sim/data/heroes';
import { transform } from '../../src/sim/hero';
import { FLAT, intent, run, spec } from './helpers';

function arena(level=0) {
  const w=new World(FLAT,[{...spec('L'),hero:'luffy'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},17);
  run(w,5);
  const [f,e]=w.fighters;
  for(let i=0;i<level;i++)transform(w,f);
  for(const [i,o] of [f,e].entries()){
    o.x=o.px=i?140:70;o.y=o.py=144;o.vx=o.vy=o.invuln=0;o.facing=1;
  }
  return w;
}

it('Gatling always delivers its finisher even if the target was hit in the preceding rehit window',()=>{
  const w=arena(),[f,e]=w.fighters,g=HEROES.luffy.second.gatling!;
  f.state='special';f.specialKind='gatling';f.stateTime=g.time-g.every-1/120;
  f.abilT=0;f.swingHit.push(e.id);
  w.events.length=0;
  w.step([]);
  const hits=w.events.filter(ev=>ev.t==='hit'&&ev.weapon==='luffy:second');
  expect(hits).toHaveLength(1);
  expect(e.state).toBe('knockdown');
  expect(e.vx).toBeGreaterThan(300);
  // No duplicate finisher on subsequent frames.
  w.events.length=0;run(w,4);
  expect(w.events.filter(ev=>ev.t==='hit'&&ev.weapon==='luffy:second')).toHaveLength(0);
});

it('an untransformed Gatling flurry deals meaningful damage and ends with a launch',()=>{
  const w=arena(),e=w.fighters[1],hp=e.hp;
  w.step([intent({kick:true})]);
  run(w,65);
  const hits=w.events.filter(ev=>ev.t==='hit'&&ev.weapon==='luffy:second');
  const damage=hits.reduce((n,ev)=>n+(ev.t==='hit'?ev.damage:0),0);
  expect(hits.length).toBeGreaterThanOrEqual(5);
  expect(damage).toBeGreaterThanOrEqual(20);
  expect(e.hp).toBeLessThan(hp-20);
  expect(w.events.some(ev=>ev.t==='heroFx'&&ev.fx==='steam'&&ev.heavy)).toBe(true);
});

it('higher-form Gatling reaches opponents beyond its base reach',()=>{
  const hit=(level:number)=>{
    const w=arena(level),f=w.fighters[0],e=w.fighters[1];
    e.x=e.px=f.x+110;
    f.state='special';f.specialKind='gatling';f.stateTime=.08;f.abilT=.08;
    w.events.length=0;w.step([]);
    return w.events.some(ev=>ev.t==='hit'&&ev.weapon==='luffy:second');
  };
  expect(hit(0)).toBe(false);
  expect(hit(4)).toBe(true);
});
