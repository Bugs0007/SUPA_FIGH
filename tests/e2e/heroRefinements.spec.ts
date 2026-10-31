import { expect,test,type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function ticks(page:Page,n:number){
  const tick=await page.evaluate(()=>(window as any).__GAME__.match().world.tick);
  await page.waitForFunction(t=>(window as any).__GAME__.match().world.tick>=t,tick+n);
}

async function sparring(page:Page,hero:string,level:number){
  await page.goto(`/?scene=match&timer=1&map=neon&humans=1&bots=1&heroes=${hero},-&powers=0`);
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  await page.evaluate(async({level})=>{
    // Imports use Vite's source URLs, just as the existing dev-only inspection tools do.
    const {transform}=await import('/src/sim/hero.ts' as string);
    const {emptyIntent}=await import('/src/sim/intent.ts' as string);
    const s=(window as any).__GAME__.game.scene.getScene('match'),w=s.match.world;
    s.controllers[1]={poll:()=>emptyIntent()};
    w.props.length=0;w.items.forEach((i:any)=>i.active=false);w.bullets.forEach((b:any)=>b.active=false);
    w.fighters.forEach((f:any,i:number)=>{
      f.x=f.px=i?230:100;f.y=f.py=512;f.vx=f.vy=f.invuln=0;f.hp=f.maxHp=i?10000:100;
      f.state='normal';f.stateTime=0;f.power='';f.powerLevel=0;f.baseCd=f.secondCd=f.specialCd=0;f.prev=emptyIntent();f.facing=1;
    });
    for(let i=0;i<level;i++)transform(w,w.fighters[0]);
    const rec={amaterasu:0,projectiles:0};(window as any).__REFINEMENT_REC__=rec;
    const emit=w.emit.bind(w);w.emit=(e:any)=>{if(e.t==='amaterasu')rec.amaterasu++;return emit(e);};
    const spawn=w.spawnBullet.bind(w);w.spawnBullet=(b:any)=>{if(b.weapon==='sasuke:second')rec.projectiles++;return spawn(b);};
  },{level});
}

for(const hero of ['naruto','luffy','goku','sasuke'])test(`${hero}: real controls start a protected ultimate and the protection ends`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await sparring(page,hero,4);
  await page.keyboard.down('KeyB');await page.keyboard.down('KeyH');
  await page.waitForFunction(()=>(window as any).__GAME__.match().world.fighters[0].state==='special',undefined,{polling:10});
  const shield=await page.evaluate(async()=>{
    const {applyHit}=await import('/src/sim/combat.ts' as string);
    const w=(window as any).__GAME__.match().world,f=w.fighters[0],hp=f.hp,form=f.formHp;
    const connected=applyHit(w,f,{damage:200,kbX:500,kbY:-500,stun:1,knockdown:true,attacker:1,weapon:'test',kind:'explosion',ignoreInvuln:true});
    return {connected,hp:f.hp===hp,form:f.formHp===form,state:f.state};
  });
  await page.keyboard.up('KeyB');await page.keyboard.up('KeyH');
  expect(shield).toEqual({connected:false,hp:true,form:true,state:'special'});
  await page.screenshot({path:`tests/e2e/screenshots/refined-${hero}-ultimate.png`});
  await ticks(page,90);
  expect(await page.evaluate(async()=>{
    const {superGuard}=await import('/src/sim/hero.ts' as string);
    return superGuard((window as any).__GAME__.match().world.fighters[0]);
  })).toBe(false);
  expect(errors).toEqual([]);
});

test('Mangekyo uses targeted Amaterasu and lower forms retain the improved fireball',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const level of [2,3,4]){
    await sparring(page,'sasuke',level);
    await page.keyboard.down('KeyH');await ticks(page,3);await page.keyboard.up('KeyH');await ticks(page,40);
    const rec=await page.evaluate(()=>({...(window as any).__REFINEMENT_REC__,burn:(window as any).__GAME__.match().world.fighters[1].burnStyle}));
    expect(rec.projectiles).toBe(level<3?1:0);
    expect(rec.amaterasu).toBe(level>=3?1:0);
    if(level>=3)expect(rec.burn).toBe('amaterasu');
    await page.screenshot({path:`tests/e2e/screenshots/refined-sasuke-form${level}-second.png`});
  }
  expect(errors).toEqual([]);
});

for(const hero of ['naruto','luffy','goku','sasuke'])test(`${hero}: combo gallery renders all forms using match effects`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?scene=art&page=moves&hero=${hero}&move=combo`);
  await page.waitForFunction(()=>(window as any).__GAME__?.game.scene.isActive('art'));
  await page.evaluate(()=>{
    const h=(window as any).__GAME__,s=h.game.scene.getScene('art');
    h.game.loop.stop();s.gallery.t=1.53;s.gallery.update(0);s.update=()=>{};h.game.step(performance.now(),0);
  });
  await page.screenshot({path:`tests/e2e/screenshots/refined-${hero}-combos.png`});
  expect(errors).toEqual([]);
});
