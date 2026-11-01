import { expect, it } from 'vitest';
import { World } from '../../src/sim/world';
import { HeroMobility, dashRoute } from '../../src/ai/heroMove';
import { BotController } from '../../src/ai/bot';
import { navFor } from '../../src/ai/nav';
import { transform } from '../../src/sim/hero';
import { TK } from '../../src/sim/map/tiles';
import { FLAT, intent, run, spec } from './helpers';

function arena(hero:string,level=0){
  const w=new World(FLAT,[{...spec('A'),hero},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},3);
  run(w,5);w.props.length=0;w.items.length=0;
  const [f,e]=w.fighters;
  for(let i=0;i<level;i++)transform(w,f);
  f.x=f.px=70;f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.grounded=true;
  e.x=e.px=400;e.y=e.py=144;e.hp=e.maxHp=10000;
  return w;
}
for(const hero of ['naruto','sasuke'])for(const level of [0,2])
it(`${hero} form ${level} retains upward dash aim through the whole windup and collects an overhead orb`,()=>{
  const w=arena(hero,level),f=w.fighters[0],orb=w.spawnItem('powerorb',0,1,70,55),mobility=new HeroMobility();
  const out=intent();expect(mobility.consider(w,f,navFor(FLAT),orb.x,orb.y,w.time,out,false)).toBe(true);
  expect(out.ability).toBe(true);expect(out.moveY).toBe(-1);expect(out.moveX).toBe(0);
  w.step([out]);let upward=false;
  for(let t=0;t<90&&orb.active;t++){
    const next=intent();mobility.step(w,f,next,w.time);w.step([next]);upward ||= f.specialKind==='rasengan'&&f.vy< -200;
  }
  expect(upward).toBe(true);expect(orb.active).toBe(false);
});
it('an ability can detach from a ladder and a solid ceiling still blocks a dash route',()=>{
  const w=arena('sasuke'),f=w.fighters[0],mobility=new HeroMobility();
  f.state='climb';f.grounded=false;
  const out=intent();expect(mobility.tryDash(w,f,70,50,w.time,out,true)).toBe(true);
  w.step([out]);expect(f.specialKind).toBe('rasengan');
  const blocked=arena('naruto'),b=blocked.fighters[0];blocked.map.set(4,5,TK.METAL);
  expect(dashRoute(blocked,b,70,50,true)).toBeNull();
});
for(const hero of ['naruto','sasuke'])
it(`${hero} bot uses an upward ability to evade an approaching ultimate`,()=>{
  let escapes=0;
  for(let seed=1;seed<=10;seed++){
    const w=arena(hero),f=w.fighters[0];f.x=f.px=240;
    const bot=new BotController(()=>w,0,{difficulty:'expert',seed});
    w.spawnBullet({x:100,y:132,ox:400,oy:132,vx:280,vy:0,owner:1,weapon:'naruto:super',damage:50,range:500,falloff:1,knock:300,ricochet:false,pierce:0,kind:'chakra',size:10,tier:2,explosion:{radius:60,damage:50,knock:300,breakRadius:0,shake:.5}});
    let selected=false;
    for(let t=0;t<8;t++){const out=bot.poll();selected ||= out.ability&&out.moveY===-1;w.step([out]);}
    if(selected)escapes++;
  }
  expect(escapes).toBeGreaterThanOrEqual(6);
});
for(const hero of ['naruto','sasuke'])
it(`${hero} bot selects and reaches an overhead orb instead of a ladder route`,()=>{
  const w=arena(hero),f=w.fighters[0],bot=new BotController(()=>w,0,{difficulty:'expert',seed:4});
  const orb=w.spawnItem('powerorb',0,1,70,55);let ability=false;
  for(let t=0;t<160&&orb.active;t++){
    const out=bot.poll();ability ||= out.ability&&out.moveY===-1;w.step([out]);
  }
  expect(ability).toBe(true);expect(orb.active).toBe(false);expect(f.powerLevel).toBe(1);
});
it('transformed Naruto uses Clone Launch for a clear upward orb route while Rasengan is recharging',()=>{
  const w=arena('naruto',1),f=w.fighters[0];w.map.set(4,4,TK.PLAT_METAL);
  const bot=new BotController(()=>w,0,{difficulty:'expert',seed:4});
  f.baseCd=10;const orb=w.spawnItem('powerorb',0,1,70,55);let launched=false,upward=false;
  for(let t=0;t<150&&orb.active;t++){
    const out=bot.poll();w.step([out]);launched ||= f.specialKind==='formCombo';upward ||= f.vy< -200;
  }
  expect(launched).toBe(true);expect(upward).toBe(true);expect(orb.active).toBe(false);
});
