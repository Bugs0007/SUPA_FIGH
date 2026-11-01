import { expect, test, type Page } from '@playwright/test';
/* eslint-disable @typescript-eslint/no-explicit-any */
async function ticks(page:Page,n:number){
  const t=await page.evaluate(()=>(window as any).__GAME__.match().world.tick);
  await page.waitForFunction(t=>(window as any).__GAME__.match().world.tick>=t,t+n);
}
for(const facing of [-1,1])test(`Goku teleports behind an enemy facing ${facing} without attacking, then can punch past its guard`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?scene=match&timer=1&humans=2&bots=0&heroes=goku,-&powers=0&map=test');
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  await page.evaluate(facing=>{
    const w=(window as any).__GAME__.match().world;w.props.length=0;
    for(const [i,f] of w.fighters.entries()){
      f.x=f.px=i?250:160;f.y=f.py=432;f.vx=f.vy=f.invuln=0;f.state='normal';f.facing=i?facing:1;f.baseCd=0;
    }
  },facing);
  await page.keyboard.down('KeyK');await page.keyboard.down('KeyB');await ticks(page,3);await page.keyboard.up('KeyB');await ticks(page,14);
  const after=await page.evaluate(()=>{
    const [f,e]=(window as any).__GAME__.match().world.fighters;
    return {x:f.x,enemyX:e.x,hp:e.hp,max:e.maxHp};
  });
  expect((after.x-after.enemyX)*facing).toBeLessThan(0);expect(after.hp).toBe(after.max);
  await page.keyboard.down('KeyF');await ticks(page,3);await page.keyboard.up('KeyF');await ticks(page,16);
  expect(await page.evaluate(()=>(window as any).__GAME__.match().world.fighters[1].hp)).toBeLessThan(after.hp);
  await page.keyboard.up('KeyK');expect(errors).toEqual([]);
});
for(const [hero,clone] of [['naruto',false],['sasuke',false],['naruto',true]] as const)
test(`${hero} bot takes an upward ${clone?'Clone Launch':'dash'} route to a power orb`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?scene=match&timer=1&humans=0&bots=2&heroes=${hero},-&powers=0&map=test`);
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  await page.evaluate(async({clone})=>{
    const {BotController}=await import('/src/ai/bot.ts' as string);
    const {emptyIntent}=await import('/src/sim/intent.ts' as string);
    const {transform}=await import('/src/sim/hero.ts' as string);
    const s=(window as any).__GAME__.game.scene.getScene('match'),w=s.match.world,[f,e]=w.fighters;
    w.props.length=0;w.items.forEach((i:any)=>i.active=false);w.bullets.forEach((b:any)=>b.active=false);
    for(const [i,o] of [f,e].entries()){
      o.x=o.px=i?800:104;o.y=o.py=432;o.vx=o.vy=o.invuln=0;o.hp=o.maxHp=1000;o.state='normal';o.stateTime=0;o.prev=emptyIntent();o.baseCd=o.secondCd=o.specialCd=o.formComboCd=0;
    }
    if(clone){transform(w,f);f.baseCd=10;}
    // Rest on the catwalk, so the launch must reach it rather than catch a falling orb during windup.
    const orb=w.spawnItem('powerorb',0,1,104,318),result={orb,up:false,clone:false};(window as any).__MOBILITY_RESULT__=result;
    const bot=new BotController(()=>w,0,{difficulty:'expert',seed:4});
    s.controllers[0]={poll:()=>{result.up ||= f.vy< -200;result.clone ||= f.specialKind==='formCombo';return bot.poll();}};
    s.controllers[1]={poll:()=>emptyIntent()};
  },{clone});
  await page.waitForFunction(()=>!(window as any).__MOBILITY_RESULT__.orb.active,null,{timeout:15000});
  const result=await page.evaluate(()=>{const r=(window as any).__MOBILITY_RESULT__;return {up:r.up,clone:r.clone};});
  expect(result.up).toBe(true);if(clone)expect(result.clone).toBe(true);
  await page.screenshot({path:`tests/e2e/screenshots/${hero}-${clone?'clone':'dash'}-vertical-orb.png`});expect(errors).toEqual([]);
});
