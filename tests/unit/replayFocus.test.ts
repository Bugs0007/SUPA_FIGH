import { expect, it } from 'vitest';
import { ReplayFocus } from '../../src/render/ReplayFocus';
import { RoundRecording, ReplayPlayer } from '../../src/sim/replay';
import { World } from '../../src/sim/world';
import { FLAT, intent, spec } from './helpers';

function recording(environmental:boolean){
  const specs=[{...spec('N'),hero:'naruto',startForm:environmental?1:4},spec('E')];
  const settings={friendlyFire:false,weaponSpawnRate:0,gravityScale:1,modifiers:environmental?[]:['glassJaw']};
  const w=new World(FLAT,specs,settings,3),rec=new RoundRecording(FLAT,specs,settings,3,w.fighters.length);
  for(let t=0;t<600;t++){
    const inputs=[intent(t<2?{ability:true,kick:true}:{}),intent()];rec.record(inputs,0);w.step(inputs);
    const kill=w.events.find(e=>e.t==='kill'&&e.victim===1);
    if(kill?.t==='kill'&&rec.finalKillTick<0){
      rec.finalKillTick=w.tick;rec.finalKillVictim=kill.victim;rec.finalKillAttacker=kill.killer;rec.finalKillWeapon=kill.weapon;
      rec.finalKillEnvironmental=kill.env;rec.finalHitTick=kill.env?Math.round(w.fighters[1].lastHitTime*60):w.tick;
      rec.finalKillX=kill.x;rec.finalKillY=kill.y;
    }
    w.events.length=0;
    if(rec.finalKillTick>0&&w.tick>rec.finalKillTick+40)break;
  }
  expect(rec.finalKillTick).toBeGreaterThan(0);
  return rec;
}
function prepare(rec:RoundRecording){
  const focus=new ReplayFocus(rec);let chunks=0;
  while(!focus.prepare(7)){if(chunks++>200)throw new Error('Replay analysis did not finish');}
  return focus;
}
it('follows the exact finishing projectile in flight, then holds its impact for a direct kill',()=>{
  const rec=recording(false),focus=prepare(rec),player=new ReplayPlayer(rec);
  expect(rec.finalKillEnvironmental).toBe(false);
  player.skipTo(rec.finalHitTick-12);
  const shot=player.world.bullets.find(b=>b.active&&b.owner===rec.finalKillAttacker&&b.weapon===rec.finalKillWeapon)!;
  expect(shot).toBeDefined();
  const target=focus.target(player.world,1)!;
  expect(target.x).toBeCloseTo(shot.x,4);expect(target.y).toBeCloseTo(shot.y,4);
  expect(Math.hypot(target.x-player.world.fighters[1].x,target.y-player.world.fighters[1].y)).toBeGreaterThan(30);
  player.skipTo(rec.finalKillTick+10);
  const impact=focus.target(player.world,1);
  player.world.fighters[1].x+=300;
  expect(focus.target(player.world,1)).toEqual(impact);expect(focus.subject).toBe('attack');
});
it('hands off from the finishing shot to the victim at contact, before a later environmental death',()=>{
  const rec=recording(true),focus=prepare(rec),player=new ReplayPlayer(rec);
  expect(rec.finalKillEnvironmental).toBe(true);expect(rec.finalKillTick).toBeGreaterThan(rec.finalHitTick);
  expect(focus.startTick).toBeLessThan(rec.finalHitTick);
  player.skipTo(rec.finalHitTick-8);focus.target(player.world,1);expect(focus.subject).toBe('attack');
  player.skipTo(rec.finalHitTick+1);
  const victim=player.world.fighters[1];expect(victim.alive).toBe(true);
  expect(focus.target(player.world,1)).toMatchObject({x:victim.x,y:victim.y});expect(focus.subject).toBe('victim');
  player.skipTo(rec.finalKillTick+10);
  const before=focus.target(player.world,1)!;player.world.fighters[1].x+=150;
  expect(focus.target(player.world,1)!.x).toBeCloseTo(before.x+150);
});
it('extends the clip back to the final blow when the environmental death is delayed',()=>{
  const rec=recording(true);rec.finalKillTick=rec.finalHitTick+300;
  const focus=prepare(rec);
  expect(focus.startTick).toBeLessThan(rec.finalHitTick-30);
});
it('falls back to the victim when there is no credited attack',()=>{
  const rec=recording(true);rec.finalKillAttacker=-1;
  const focus=prepare(rec),player=new ReplayPlayer(rec);player.skipTo(rec.finalKillTick);
  const f=player.world.fighters[rec.finalKillVictim];
  expect(focus.target(player.world,1)).toMatchObject({x:f.x,y:f.y});expect(focus.subject).toBe('victim');
});
