import { expect, test } from '@playwright/test';
/* eslint-disable @typescript-eslint/no-explicit-any */
test('Kirin impact plays thunder under heavy audio load and visibly shakes the camera',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?scene=match&timer=1&humans=1&bots=1&heroes=sasuke,-&powers=0&map=neon');
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  await page.mouse.click(600,400);
  const result=await page.evaluate(async()=>{
    const {audio}=await import('/src/audio/AudioManager.ts' as string);
    const {transform}=await import('/src/sim/hero.ts' as string);
    const {emptyIntent}=await import('/src/sim/intent.ts' as string);
    const h=(window as any).__GAME__,s=h.game.scene.getScene('match'),w=s.match.world;
    h.game.loop.stop();s.update=()=>{};
    audio.unlock();await audio.context.resume();
    const ctx=audio.context,thunder=(audio as any).buffers.get('kirinExplosion');
    let starts=0;const create=ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource=()=>{
      const node=create(),start=node.start.bind(node);
      node.start=(...args:any[])=>{if(node.buffer===thunder)starts++;return start(...args);};return node;
    };
    // Ordinary sounds are already at capacity: this impact must still reach WebAudio.
    const oldActive=(audio as any).active;(audio as any).active=40;
    w.props.length=0;w.items.forEach((i:any)=>i.active=false);w.bullets.forEach((b:any)=>b.active=false);
    const [f,e]=w.fighters;
    for(let i=0;i<4;i++)transform(w,f);
    for(const [i,o] of [f,e].entries()){
      o.x=o.px=i?230:100;o.y=o.py=512;o.vx=o.vy=o.invuln=0;o.hp=o.maxHp=1000;
      o.state='normal';o.stateTime=0;o.prev=emptyIntent();o.facing=1;
    }
    f.baseCd=f.secondCd=f.specialCd=f.formComboCd=0;
    const director=s.camDir,cam=s.cameras.main;director.shakeScale=1;director.trauma=0;
    const centers:number[][]=[],center=cam.centerOn.bind(cam);
    cam.centerOn=(x:number,y:number)=>{centers.push([x,y]);return center(x,y);};
    director.manual={x:200,y:256,z:.6,k:100};director.update(1,w,null);
    const baseline=centers[centers.length-1];centers.length=0;
    let impacts=0;
    for(let t=0;t<20;t++){
      w.events.length=0;w.step([{...emptyIntent(),attack:t<2,ability:t<2},emptyIntent()]);
      for(const event of w.events){if(event.t==='kirinStrike')impacts++;s.juice.handle(event,w);}
    }
    for(let i=0;i<15;i++)director.update(1/60,w,null);
    const offset=Math.max(...centers.map(([x,y])=>Math.hypot(x-baseline[0],y-baseline[1])));
    // The user's zero-shake preference still suppresses the impact shake.
    director.shakeScale=0;director.trauma=0;centers.length=0;
    s.juice.handle({t:'kirinStrike',f:0,x:230,y:501,level:4},w);
    for(let i=0;i<10;i++)director.update(1/60,w,null);
    const disabled=Math.max(...centers.map(([x,y])=>Math.hypot(x-baseline[0],y-baseline[1])));
    cam.centerOn=center;ctx.createBufferSource=create;(audio as any).active=oldActive+starts;
    return {impacts,starts,offset,disabled,duration:thunder.duration,state:ctx.state};
  });
  expect(result.impacts).toBe(1);expect(result.starts).toBeGreaterThanOrEqual(1);expect(result.state).toBe('running');
  expect(result.duration).toBeGreaterThan(1.2);expect(result.offset).toBeGreaterThan(2);expect(result.disabled).toBe(0);
  expect(errors).toEqual([]);
});
