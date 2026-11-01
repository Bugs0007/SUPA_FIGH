import { expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
test('Kirin descends from the map ceiling and its lightning blast survives caster interruption', async ({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?scene=match&timer=1&humans=1&bots=1&heroes=sasuke,-&powers=0&map=neon');
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  const opening=await page.evaluate(async()=>{
    const {transform}=await import('/src/sim/hero.ts' as string);
    const {emptyIntent}=await import('/src/sim/intent.ts' as string);
    const h=(window as any).__GAME__,s=h.game.scene.getScene('match'),w=s.match.world;
    h.game.loop.stop();s.update=()=>{};
    w.props.length=0;w.items.forEach((i:any)=>i.active=false);w.bullets.forEach((b:any)=>b.active=false);
    const [f,e]=w.fighters;
    for(let i=0;i<4;i++)transform(w,f);
    for(const [i,o] of [f,e].entries()){
      o.x=o.px=i?230:100;o.y=o.py=512;o.vx=o.vy=o.invuln=0;o.hp=o.maxHp=1000;
      o.state='normal';o.stateTime=0;o.prev=emptyIntent();o.facing=1;
    }
    f.baseCd=f.secondCd=f.specialCd=f.formComboCd=0;
    const step=(inp=emptyIntent())=>{
      w.events.length=0;w.step([inp,emptyIntent()]);
      for(const event of w.events)s.juice.handle(event,w);
      s.wr.sync(1,1/60,w.time);
    };
    (window as any).__KIRIN_STEP__=step;
    step({...emptyIntent(),attack:true,ability:true});
    for(let i=0;i<4;i++)step();
    s.camDir.manual={x:200,y:256,z:.6,k:100};s.camDir.update(1,w,null);
    h.game.step(performance.now(),0);
    return {kind:f.specialKind,queue:s.wr.heroFx.kirinImpacts.length,time:f.stateTime};
  });
  expect(opening.kind).toBe('formCombo');expect(opening.queue).toBe(0);expect(opening.time).toBeLessThan(.24);
  await page.screenshot({path:'tests/e2e/screenshots/kirin-ceiling-descent.png'});
  const impact=await page.evaluate(()=>{
    const h=(window as any).__GAME__,s=h.game.scene.getScene('match'),w=s.match.world;
    const step=(window as any).__KIRIN_STEP__;
    for(let i=0;i<13;i++)step();
    const effects=s.wr.heroFx,queued=effects.kirinImpacts.length;
    const anchor={...effects.kirinImpacts[0]};
    // A hit, death or move ending must not erase a lightning strike already delivered.
    w.fighters[0].state='flinch';w.fighters[0].specialKind='';
    const boxes:number[][]=[];const g=effects.orbs,draw=g.fillRect.bind(g);
    g.fillRect=(x:number,y:number,width:number,height:number)=>{boxes.push([x,y,width,height]);return draw(x,y,width,height);};
    effects.sync(1,.1,w.time+.1);g.fillRect=draw;
    h.game.step(performance.now(),0);
    return {queued,anchor,stillActive:effects.kirinImpacts.length,top:Math.min(...boxes.map(b=>b[1])),bottom:Math.max(...boxes.map(b=>b[1]+b[3])),count:boxes.length};
  });
  expect(impact.queued).toBe(1);expect(impact.stillActive).toBe(1);
  expect(impact.anchor.x).toBe(230);expect(impact.anchor.y).toBe(501);
  expect(impact.top).toBeLessThanOrEqual(0);expect(impact.bottom).toBeGreaterThan(501);expect(impact.count).toBeGreaterThan(400);
  await page.screenshot({path:'tests/e2e/screenshots/kirin-lightning-impact.png'});
  const expired=await page.evaluate(()=>{
    const s=(window as any).__GAME__.game.scene.getScene('match');
    for(let i=0;i<50;i++)s.wr.heroFx.sync(1,1/60,s.match.world.time+i/60);
    return s.wr.heroFx.kirinImpacts.length;
  });
  expect(expired).toBe(0);expect(errors).toEqual([]);
});
