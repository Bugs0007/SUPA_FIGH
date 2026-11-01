import {expect,test} from '@playwright/test';

for(const hero of ['sasuke','naruto','luffy','goku'])test(`${hero}: form combo and guard artwork render`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?scene=match&timer=1&map=test&humans=1&bots=1&heroes=${hero},-&powers=0`);
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>10);
  await page.evaluate(async()=>{
    const {transform}=await import('/src/sim/hero.ts' as string);
    const {emptyIntent}=await import('/src/sim/intent.ts' as string);
    const s=(window as any).__GAME__.game.scene.getScene('match'),w=s.match.world;
    s.controllers[1]={poll:()=>emptyIntent()};
    w.props.length=0;
    w.fighters.slice(0,2).forEach((f:any,i:number)=>{
      f.x=f.px=i?260:100;f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.state='normal';f.facing=1;
    });
    for(let i=0;i<4;i++)transform(w,w.fighters[0]);
    (window as any).__COMBO_SEEN__=false;
    const step=w.step.bind(w);w.step=(intents:any)=>{step(intents);if(w.fighters[0].specialKind==='formCombo'&&w.fighters[0].state==='special')(window as any).__COMBO_SEEN__=true;};
  });
  await page.waitForTimeout(900);
  await page.keyboard.down('KeyG');
  await page.waitForFunction(()=>(window as any).__GAME__.match().world.fighters[0].state==='block');
  await page.screenshot({path:`tests/e2e/screenshots/${hero}-guard.png`});
  await page.keyboard.up('KeyG');await page.waitForTimeout(50);
  await page.keyboard.down('KeyF');await page.keyboard.down(hero==='naruto'?'KeyH':'KeyB');
  await page.waitForFunction(()=>(window as any).__COMBO_SEEN__);
  await page.screenshot({path:`tests/e2e/screenshots/${hero}-form-combo.png`});
  await page.keyboard.up('KeyF');await page.keyboard.up(hero==='naruto'?'KeyH':'KeyB');
  await page.waitForTimeout(800);
  await page.goto(`/?scene=art&page=moves&hero=${hero}&move=guard`);
  await page.waitForTimeout(800);
  await page.screenshot({path:`tests/e2e/screenshots/${hero}-guard-gallery.png`});
  await page.keyboard.press('Digit5');await page.waitForTimeout(900);
  await page.screenshot({path:`tests/e2e/screenshots/${hero}-special-gallery.png`});
  expect(errors).toEqual([]);
});
