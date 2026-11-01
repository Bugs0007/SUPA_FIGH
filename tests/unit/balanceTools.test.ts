import {expect,it} from 'vitest';
import {Match} from '../../src/sim/match';
import {World} from '../../src/sim/world';
import {HEROES,CLONE_SLINGSHOT,FORM_COMBO,KIRIN} from '../../src/sim/data/heroes';
import {drawKirin,drawKirinImpact} from '../../src/art/kirinArt';
import {HeroMobility} from '../../src/ai/heroMove';
import {navFor} from '../../src/ai/nav';
import {BotController} from '../../src/ai/bot';
import type {BulletSpawn} from '../../src/sim/projectile';
import {FLAT,intent,run,spec} from './helpers';

it('unlimited Brawl keeps scoring and starts new rounds beyond ten wins',()=>{
  const m=new Match({mapId:'test',mode:'brawl',fighters:[spec('A'),spec('B')],roundsToWin:0,friendlyFire:false,weaponSpawnRate:0,seed:2});
  for(let round=0;round<12;round++){
    for(let t=0;t<1500&&m.phase!=='fight';t++)m.step([]);
    expect(m.phase).toBe('fight');
    m.world.fighters[1].alive=false;m.world.fighters[1].hp=0;
    for(let t=0;t<1500&&m.phase==='fight';t++)m.step([]);
    expect(m.matchWinner).toBeNull();expect(m.scores.get(100)).toBe(round+1);
  }
});
for(const [hero,kind] of [['naruto','rasengan'],['sasuke','rasengan'],['naruto','formCombo']] as const)
it(`${hero} collects power orbs during ${kind}`,()=>{
  const w=new World(FLAT,[{...spec('A'),hero},spec('B')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},2);run(w,5);
  const f=w.fighters[0];f.x=f.px=70;f.y=f.py=144;f.vx=f.vy=0;
  f.state='special';f.specialKind=kind;f.stateTime=kind==='formCombo'?CLONE_SLINGSHOT.windup+.01:HEROES[hero].base.dash!.windup+.01;
  f.dashAngle=0;f.recoverAt=0;f.charge=0;f.anchorX=200;f.anchorY=144;f.facing=1;
  const orb=w.spawnItem('powerorb',0,1,86,135);
  run(w,3,()=>[intent({ability:true})]);
  expect(orb.active).toBe(false);expect(f.powerLevel).toBe(1);
});
it('Kirin grows on every form and remains on the pixel grid',()=>{
  const sizes=[];
  for(let level=1;level<=4;level++){
    const boxes:number[][]=[];drawKirin({fillStyle:()=>{},fillRect:(x,y,w,h)=>{boxes.push([x,y,w,h]);}},0,0,.24,level,0);
    for(const box of boxes)for(const n of box)expect(Number.isInteger(n)).toBe(true);
    sizes.push(Math.max(...boxes.map(b=>b[0]+b[2]))-Math.min(...boxes.map(b=>b[0])));
  }
  for(let i=1;i<sizes.length;i++)expect(sizes[i]).toBeGreaterThan(sizes[i-1]);
});
it('Kirin descends from the map ceiling and reaches the strike on time at every form and height',()=>{
  for(const level of [1,2,3,4])for(const targetY of [120,480,1200]){
    const bottom=(t:number)=>{
      const boxes:number[][]=[];
      let color=0;
      drawKirin({fillStyle:c=>{color=c;},fillRect:(x,y,w,h)=>{if(color===0x152951)boxes.push([x,y,w,h]);}},200,targetY,t,level,0);
      return Math.max(...boxes.map(b=>b[1]+b[3]));
    };
    expect(bottom(0)).toBeLessThan(30);
    expect(bottom(FORM_COMBO.windup/2)).toBeGreaterThan(targetY/2);
    expect(bottom(FORM_COMBO.windup/2)).toBeLessThan(targetY/2+30);
    expect(bottom(FORM_COMBO.windup)).toBeGreaterThan(targetY);
    expect(bottom(FORM_COMBO.windup)).toBeLessThan(targetY+20);
    expect(bottom(FORM_COMBO.duration)).toBe(bottom(FORM_COMBO.windup));
  }
});
it('Kirin lightning blast starts on impact, covers the strike area and fades out',()=>{
  const boxes=(t:number)=>{
    const out:number[][]=[];
    drawKirinImpact({fillStyle:()=>{},fillRect:(x,y,w,h)=>{out.push([x,y,w,h]);}},200,300,t,4,0);
    return out;
  };
  expect(boxes(FORM_COMBO.windup-.001)).toHaveLength(0);
  const burst=boxes(FORM_COMBO.windup);
  expect(burst.length).toBeGreaterThan(200);
  expect(Math.min(...burst.map(b=>b[0]))).toBeLessThan(185);
  expect(Math.max(...burst.map(b=>b[0]+b[2]))).toBeGreaterThan(215);
  for(const box of burst)for(const n of box)expect(Number.isInteger(n)).toBe(true);
  expect(boxes(FORM_COMBO.windup+KIRIN.impactTime)).toHaveLength(0);
});
it('Kirin has a mirrored side profile with its snout pointing in the caster direction',()=>{
  for(const facing of [-1,1]){
    let color=0;const nose:number[]=[];
    drawKirin({fillStyle:c=>{color=c;},fillRect:(x,y,w)=>{if(color===0x152951)nose.push(x+w/2);}},200,300,.1,1,0,facing);
    expect((nose[0]-200)*facing).toBeGreaterThan(10);
  }
});
it('Kirin has a broad continuous body all the way from the ceiling to its descending head',()=>{
  for(const level of [1,4]){
    let color=0;const body:number[][]=[];
    drawKirin({fillStyle:c=>{color=c;},fillRect:(x,y,w,h)=>{if(color===0x3052a0)body.push([x,y,w,h]);}},200,900,FORM_COMBO.windup*.9,level,0,1,false);
    for(const row of [10,100,300,600]){
      expect(body.some(b=>b[1]<=row&&b[1]+b[3]>=row&&b[2]>=12),`form ${level}, row ${row}`).toBe(true);
    }
  }
});
it('Kirin can miss an enemy that escapes the marked strike position',()=>{
  const w=new World(FLAT,[{...spec('A'),hero:'sasuke',startForm:1},spec('B')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},2);run(w,5);
  const [f,e]=w.fighters;f.x=70;f.y=144;e.x=240;e.y=144;f.invuln=e.invuln=0;
  w.step([intent({ability:true,attack:true})]);
  e.x=320;e.y=80;const hp=e.hp;run(w,20);
  expect(e.hp).toBe(hp);
  const strikes=w.events.filter(e=>e.t==='kirinStrike');
  expect(strikes).toHaveLength(1);
  expect(strikes[0]).toMatchObject({x:240,y:133,level:1});
});
it.each(['naruto','sasuke'])('%s bots use their dash to collect a power orb',hero=>{
  const w=new World(FLAT,[{...spec('A'),hero}],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},2);run(w,5);
  const f=w.fighters[0];f.x=f.px=70;f.y=f.py=144;f.vx=f.vy=0;f.grounded=true;
  const orb=w.spawnItem('powerorb',0,1,220,135),mobility=new HeroMobility(),out=intent();
  expect(mobility.consider(w,f,navFor(FLAT),orb.x,orb.y,w.time,out,false)).toBe(true);
  expect(out.ability).toBe(true);w.step([out]);
  for(let t=0;t<80&&orb.active;t++){const next=intent();mobility.step(w,f,next,w.time);w.step([next]);}
  expect(orb.active).toBe(false);expect(f.powerLevel).toBe(1);
});
it('expert bots actively evade a visible explosive ultimate projectile',()=>{
  let dodged=0,repeated=0;
  for(let seed=1;seed<=12;seed++){
    const w=new World(FLAT,[spec('A'),spec('B')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},seed);run(w,5);
    const f=w.fighters[0];f.x=f.px=240;f.y=f.py=144;f.grounded=true;
    w.fighters[1].x=60;
    const shot:BulletSpawn={x:100,y:132,ox:60,oy:132,vx:380,vy:0,owner:1,weapon:'naruto:super',damage:50,range:500,falloff:1,knock:300,ricochet:false,pierce:0,kind:'chakra',size:10,tier:2,explosion:{radius:60,damage:50,knock:300,breakRadius:0,shake:.5}};
    const bullet=w.spawnBullet(shot)!;
    const bot=new BotController(()=>w,0,{difficulty:'expert',seed});
    if(bot.poll().jump){
      dodged++;w.time+=1;bullet.active=false;bot.poll();w.time+=.1;
      expect(w.spawnBullet(shot)).toBe(bullet);
      if(bot.poll().jump)repeated++;
    }
  }
  expect(dodged).toBeGreaterThanOrEqual(8);
  expect(repeated).toBeGreaterThanOrEqual(6);
});
