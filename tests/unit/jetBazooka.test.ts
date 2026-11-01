import {expect,it} from 'vitest';
import {World} from '../../src/sim/world';
import {transform} from '../../src/sim/hero';
import {applyHit} from '../../src/sim/combat';
import {JET_BAZOOKA} from '../../src/sim/data/heroes';
import {TK} from '../../src/sim/map/tiles';
import {BotController} from '../../src/ai/bot';
import {encodeWorld,applyWorld} from '../../src/net/renderState';
import {FLAT,intent,run,spec} from './helpers';

function arena(enemyX=260){
  const w=new World(FLAT,[{...spec('L'),hero:'luffy'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},99);run(w,5);
  w.fighters.forEach((f,i)=>{f.x=f.px=i?enemyX:70;f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.facing=1;});
  transform(w,w.fighters[0]);return w;
}
it('grabs a nearby enemy, then launches it with a hard kick',()=>{
  const w=arena(100),[f,e]=w.fighters,hp=e.hp;
  w.step([intent({attack:true,ability:true})]);
  expect(f.jetMode).toBe('kick');expect(e.state).toBe('grabbed');expect(e.grabbedBy).toBe(f.id);
  run(w,12);expect(e.state).toBe('grabbed');
  run(w,9);expect(e.hp).toBeLessThan(hp);expect(e.vx).toBeGreaterThan(500);
  expect(e.grabbedBy).toBe(-1);expect(f.grabTarget).toBe(-1);
});
it('the kick follows a held upward direction',()=>{
  const w=arena(100),e=w.fighters[1];
  w.step([intent({attack:true,ability:true,moveY:-1})]);
  run(w,20,()=>[intent({moveY:-1})]);
  expect(e.vy).toBeLessThan(-500);expect(Math.abs(e.vx)).toBeLessThan(10);
});
it('interrupting the grab frees the victim',()=>{
  const w=arena(100),[f,e]=w.fighters;
  w.step([intent({attack:true,ability:true})]);
  applyHit(w,f,{damage:1,kbX:0,kbY:0,stun:.3,attacker:e.id,weapon:'test',kind:'melee'});
  expect(e.grabbedBy).toBe(-1);expect(e.state).not.toBe('grabbed');expect(f.grabTarget).toBe(-1);
});
it('anchors to the floor and slingshots toward a far enemy',()=>{
  const w=arena(),f=w.fighters[0];
  w.step([intent({attack:true,ability:true})]);
  expect(f.jetMode).toBe('sling');expect(f.jetAnchorY).toBeGreaterThanOrEqual(144);
  run(w,22);expect(f.vx).toBeGreaterThan(JET_BAZOOKA.speed*.9);
});
it('chooses and collects a nearer power orb instead of the far enemy',()=>{
  const w=arena(),f=w.fighters[0],orb=w.spawnItem('powerorb',0,1,160,135);
  w.step([intent({attack:true,ability:true})]);
  expect(f.lockOn).toBe(-1);expect(f.jetMode).toBe('sling');
  for(let t=0;t<70&&orb.active;t++)w.step([]);
  expect(orb.active).toBe(false);expect(f.powerLevel).toBe(2);
});
it('can grip a nearby ladder instead of the ground',()=>{
  const w=arena(),f=w.fighters[0];w.map.set(5,8,TK.LADDER);
  w.step([intent({attack:true,ability:true})]);
  expect(f.jetMode).toBe('sling');
  expect(w.map.def(Math.floor(f.jetAnchorX/16),Math.floor(f.jetAnchorY/16)).ladder).toBe(true);
});
it('does not launch without a real surface to grab',()=>{
  const rows=Array.from({length:30},(_,i)=>i===15?'....S..............................S....':'.'.repeat(40));
  const w=new World({...FLAT,id:'empty-jet',rows},[{...spec('L'),hero:'luffy'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},99);
  const [f,e]=w.fighters;f.x=f.px=320;f.y=f.py=240;e.x=e.px=500;e.y=e.py=240;f.invuln=e.invuln=0;transform(w,f);
  w.step([intent({attack:true,ability:true})]);
  expect(f.state).not.toBe('special');expect(f.jetMode).toBe('');expect(f.formComboCd).toBe(0);
});
it('sends both mode and grab target to LAN spectators',()=>{
  const w=arena(100),mirror=arena();w.step([intent({attack:true,ability:true})]);
  applyWorld(mirror,JSON.parse(JSON.stringify(encodeWorld(w))));
  expect(mirror.fighters[0].jetMode).toBe('kick');expect(mirror.fighters[0].grabTarget).toBe(1);expect(mirror.fighters[1].state).toBe('grabbed');
});
it('bots can use the close grab-kick mode',()=>{
  const w=arena(100),f=w.fighters[0],e=w.fighters[1];f.specialCd=f.baseCd=f.secondCd=10;
  const bot=new BotController(()=>w,0,{difficulty:'expert',seed:7});let kicked=false;
  for(let t=0;t<360&&!kicked;t++){
    w.events.length=0;
    w.step([bot.poll()]);kicked=w.events.some(ev=>ev.t==='hit'&&ev.weapon==='luffy:jetKick');
    if(e.state!=='grabbed'){e.x=f.x+24;e.y=f.y;e.vx=e.vy=0;}
  }
  expect(kicked).toBe(true);
});
