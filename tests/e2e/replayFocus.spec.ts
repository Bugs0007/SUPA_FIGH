import { expect, test } from '@playwright/test';
/* eslint-disable @typescript-eslint/no-explicit-any */
for(const environmental of [false,true])test(`replay follows the finishing shot${environmental?', then the victim through an environmental kill':''}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?scene=match&timer=1&humans=0&bots=2&heroes=naruto,-&powers=0&map=test');
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  const flight=await page.evaluate(async environmental=>{
    const {World}=await import('/src/sim/world.ts' as string);
    const {RoundRecording}=await import('/src/sim/replay.ts' as string);
    const {emptyIntent}=await import('/src/sim/intent.ts' as string);
    const h=(window as any).__GAME__,s=h.game.scene.getScene('match');h.game.loop.stop();s.update=()=>{};
    const def={id:'replay-test',name:'REPLAY TEST',theme:'arena',rows:['..............................','..............................','..............................','..............................','..............................','.......------.................','..............................','..............................','..S.....................S.....','##############################','##############################']};
    const specs=[{name:'N',team:0,isBot:false,upJumps:false,hero:'naruto',startForm:environmental?1:4},{name:'E',team:0,isBot:false,upJumps:false}];
    const settings={friendlyFire:false,weaponSpawnRate:0,gravityScale:1,modifiers:environmental?[]:['glassJaw']};
    const w=new World(def,specs,settings,3),rec=new RoundRecording(def,specs,settings,3,w.fighters.length);
    for(let t=0;t<600;t++){
      const inputs=[{...emptyIntent(),ability:t<2,kick:t<2},emptyIntent()];rec.record(inputs,0);w.step(inputs);
      const kill=w.events.find((e:any)=>e.t==='kill'&&e.victim===1);
      if(kill&&rec.finalKillTick<0){
        rec.finalKillTick=w.tick;rec.finalKillVictim=1;rec.finalKillAttacker=kill.killer;rec.finalKillWeapon=kill.weapon;rec.finalKillEnvironmental=kill.env;
        rec.finalHitTick=kill.env?Math.round(w.fighters[1].lastHitTime*60):w.tick;rec.finalKillX=kill.x;rec.finalKillY=kill.y;
      }
      w.events.length=0;if(rec.finalKillTick>0&&w.tick>rec.finalKillTick+40)break;
    }
    s.match.lastRecording=rec;s.speed=1;s.startReplay();
    s.updateReplay(0);
    const r=s.replay;r.player.skipTo(rec.finalHitTick-12);r.acc=0;s.updateReplay(0);
    const target=r.focus.target(r.player.world,1),shot=r.player.world.bullets.find((b:any)=>b.active&&b.owner===rec.finalKillAttacker&&b.weapon===rec.finalKillWeapon);
    h.game.step(performance.now(),0);
    return {subject:r.focus.subject,target,shot:{x:shot.x,y:shot.y},environmental:rec.finalKillEnvironmental,contact:rec.finalHitTick,death:rec.finalKillTick};
  },environmental);
  expect(flight.subject).toBe('attack');expect(flight.environmental).toBe(environmental);
  expect(flight.target.x).toBeCloseTo(flight.shot.x,3);expect(flight.target.y).toBeCloseTo(flight.shot.y,3);
  await page.screenshot({path:`tests/e2e/screenshots/replay-attack-${environmental?'environmental':'direct'}.png`});
  const after=await page.evaluate(()=>{
    const h=(window as any).__GAME__,s=h.game.scene.getScene('match'),r=s.replay;
    r.player.skipTo(r.rec.finalHitTick+1);r.acc=0;s.updateReplay(0);
    const target=r.focus.target(r.player.world,1),victim=r.player.world.fighters[1];
    h.game.step(performance.now(),0);
    return {subject:r.focus.subject,target,victim:{x:victim.x,y:victim.y,alive:victim.alive}};
  });
  expect(after.subject).toBe(environmental?'victim':'attack');
  if(environmental){expect(after.victim.alive).toBe(true);expect(after.target.x).toBeCloseTo(after.victim.x,3);expect(after.target.y).toBeCloseTo(after.victim.y,3);}
  await page.screenshot({path:`tests/e2e/screenshots/replay-contact-${environmental?'environmental':'direct'}.png`});
  expect(errors).toEqual([]);
});
