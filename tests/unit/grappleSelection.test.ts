import { expect, it } from 'vitest';
import { World } from '../../src/sim/world';
import { HEROES } from '../../src/sim/data/heroes';
import { TK } from '../../src/sim/map/tiles';
import { encodeWorld, applyWorld } from '../../src/net/renderState';
import { intent, run, spec } from './helpers';

function arena(diagonal=false,near:number=TK.LADDER,far:number=TK.LADDER){
  const rows=Array.from({length:26},(_,i)=>i>=24?'#'.repeat(40):'.'.repeat(40));
  rows[23]='..S..................................S..';
  const def={id:'grapple-select',name:'grapple-select',theme:'arena' as const,rows};
  const w=new World(def,[{...spec('L'),hero:'luffy'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},3);
  run(w,5);const [f,e]=w.fighters;
  f.x=f.px=64;f.y=f.py=384;f.vx=f.vy=0;f.facing=1;f.grounded=true;e.x=e.px=600;e.y=e.py=384;
  if(diagonal){w.map.set(10,15,near);w.map.set(15,8,far);}
  else {w.map.set(10,23,near);w.map.set(20,23,far);}
  return w;
}
const cast=(diagonal=false)=>intent({ability:true,moveX:1,moveY:diagonal?-1:0});
it('increases both tap and maximum grapple reach by 25 percent',()=>{
  const s=HEROES.luffy.base.stretch!;expect(s.range).toBe(125);expect(s.maxRange).toBe(425);
});
it('passes the nearer ladder while held, then release selects it and pulling continues hands-free',()=>{
  const w=arena(),f=w.fighters[0];run(w,10,()=>[cast()]);
  expect(f.specialKind).toBe('pistol');expect(f.grip).toBe('ladder');expect(f.x).toBe(64);
  w.step([intent()]);expect(f.specialKind).toBe('rocket');expect(f.anchorX).toBe(168);
  run(w,25);expect(f.x).toBeGreaterThan(130);expect(f.baseUsed).toBe(1);
});
it('holding to full extension selects the farther ladder',()=>{
  const w=arena(),f=w.fighters[0];run(w,35,()=>[cast()]);
  expect(f.specialKind).toBe('rocket');expect(f.anchorX).toBe(328);
});
for(const [near,far] of [[TK.PLAT_METAL,TK.PLAT_METAL],[TK.LADDER,TK.PLAT_METAL],[TK.PLAT_METAL,TK.LADDER]])
it(`diagonal cast can choose either anchor (${near} then ${far})`,()=>{
  const early=arena(true,near,far),a=early.fighters[0];run(early,15,()=>[cast(true)]);early.step([intent()]);
  expect(a.specialKind).toBe('rocket');expect(a.anchorX).toBe(168);expect(a.grip).toBe(near===TK.LADDER?'ladder':'platform');
  const late=arena(true,near,far),b=late.fighters[0];run(late,35,()=>[cast(true)]);
  expect(b.specialKind).toBe('rocket');expect(b.anchorX).toBe(248);expect(b.grip).toBe(far===TK.LADDER?'ladder':'platform');
});
it('another press cancels a committed pull without spending an extra charge',()=>{
  const w=arena(),f=w.fighters[0];run(w,10,()=>[cast()]);w.step([intent()]);run(w,3);
  expect(f.specialKind).toBe('rocket');const used=f.baseUsed;
  w.step([intent({ability:true})]);expect(f.state).toBe('normal');expect(f.specialKind).toBe('');expect(f.baseUsed).toBe(used);
});
it('a solid wall stops the hand before any farther pass-through anchor',()=>{
  const w=arena(),f=w.fighters[0];w.map.set(15,23,TK.METAL);run(w,18,()=>[cast()]);
  expect(f.specialKind).toBe('rocket');expect(f.grip).toBe('wall');expect(f.anchorX).toBeLessThan(256);
});
it('a release before passing any anchor does not grab one the retracting hand reaches later',()=>{
  const w=arena(),f=w.fighters[0];w.step([cast()]);run(w,35);
  expect(f.state).toBe('normal');expect(f.x).toBe(64);
});
it('pending anchor selection survives LAN render snapshots',()=>{
  const w=arena(),f=w.fighters[0];run(w,10,()=>[cast()]);
  const mirror=arena();applyWorld(mirror,JSON.parse(JSON.stringify(encodeWorld(w))));
  w.step([intent()]);mirror.step([intent()]);
  expect(mirror.fighters[0].specialKind).toBe('rocket');expect(mirror.fighters[0].anchorX).toBe(f.anchorX);
});
