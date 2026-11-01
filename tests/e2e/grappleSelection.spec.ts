import { expect, test } from '@playwright/test';
/* eslint-disable @typescript-eslint/no-explicit-any */
for(const diagonal of [false,true])for(const far of [false,true])
test(`${diagonal?'diagonal':'horizontal'} grapple ${far?'holds through to the far anchor':'releases onto the near anchor'}, then cancels on another press`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?scene=match&timer=1&humans=1&bots=1&heroes=luffy,-&powers=0&map=test');
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  await page.evaluate(async diagonal=>{
    const {emptyIntent}=await import('/src/sim/intent.ts' as string);
    const {TK}=await import('/src/sim/map/tiles.ts' as string);
    const s=(window as any).__GAME__.game.scene.getScene('match'),w=s.match.world;
    for(let row=1;row<27;row++)for(let col=2;col<54;col++)w.map.set(col,row,TK.EMPTY);
    w.props.length=0;w.items.forEach((i:any)=>i.active=false);w.bullets.forEach((b:any)=>b.active=false);
    s.controllers[1]={poll:()=>emptyIntent()};
    for(const [i,f] of w.fighters.entries()){
      f.x=f.px=i?800:104;f.y=f.py=432;f.vx=f.vy=f.invuln=0;f.hp=f.maxHp=1000;f.state='normal';f.stateTime=0;f.facing=1;f.prev=emptyIntent();f.baseCd=f.baseUsed=0;f.grounded=true;
    }
    if(diagonal){w.map.set(12,18,TK.LADDER);w.map.set(18,11,TK.PLAT_METAL);}
    else{w.map.set(14,26,TK.LADDER);w.map.set(25,26,TK.LADDER);}
  },diagonal);
  await page.keyboard.down('KeyD');if(diagonal)await page.keyboard.down('KeyW');await page.keyboard.down('KeyB');
  if(!far){
    await page.waitForFunction(()=>{const f=(window as any).__GAME__.match().world.fighters[0];return f.specialKind==='pistol'&&f.grip==='ladder';});
    await page.screenshot({path:`tests/e2e/screenshots/grapple-${diagonal?'diagonal':'horizontal'}-select.png`});
    await page.keyboard.up('KeyB');
  }
  await page.waitForFunction(()=>{const f=(window as any).__GAME__.match().world.fighters[0];return f.specialKind==='rocket';});
  await page.keyboard.up('KeyB');await page.keyboard.up('KeyD');if(diagonal)await page.keyboard.up('KeyW');
  const selected=await page.evaluate(()=>{const f=(window as any).__GAME__.match().world.fighters[0];return {x:f.anchorX,grip:f.grip,used:f.baseUsed,tick:(window as any).__GAME__.match().world.tick};});
  expect(selected.x).toBe(diagonal?(far?296:200):(far?408:232));expect(selected.grip).toBe(diagonal&&far?'platform':'ladder');
  await page.waitForFunction(t=>(window as any).__GAME__.match().world.tick>=t+2,selected.tick);
  await page.keyboard.down('KeyB');
  await page.waitForFunction(()=>(window as any).__GAME__.match().world.fighters[0].specialKind!=='rocket');
  await page.keyboard.up('KeyB');
  expect(await page.evaluate(()=>(window as any).__GAME__.match().world.fighters[0].baseUsed)).toBe(selected.used);
  expect(errors).toEqual([]);
});
