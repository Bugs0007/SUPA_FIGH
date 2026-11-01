import {expect,test} from '@playwright/test';
for(const [hero,move,t] of [['naruto','combo',1.53],['sasuke','special',.8]] as const)test(`${hero} updated balance artwork`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?scene=art&page=moves&hero=${hero}&move=${move}`);
  await page.waitForFunction(()=>(window as any).__GAME__?.game.scene.getScene('art').gallery);
  await page.evaluate(t=>{
    const h=(window as any).__GAME__,s=h.game.scene.getScene('art');
    h.game.loop.stop();s.gallery.t=t;s.gallery.update(0);s.update=()=>{};h.game.step(performance.now(),0);
  },t);
  await page.screenshot({path:`tests/e2e/screenshots/${hero}-balance-art.png`});
  expect(errors).toEqual([]);
});
