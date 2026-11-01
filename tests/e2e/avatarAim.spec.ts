import {expect,test} from '@playwright/test';

for(const hero of ['sasuke','naruto'])for(const aim of [-.9,.9])test(`${hero} avatar aims ${aim<0?'up':'down'}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?scene=art&page=moves&hero=${hero}&move=super&aim=${aim}`);
  await page.waitForFunction(()=>(window as any).__GAME__?.game.scene.getScene('art').gallery);
  await page.evaluate(()=>{
    const h=(window as any).__GAME__,s=h.game.scene.getScene('art');
    h.game.loop.stop();s.gallery.t=1.2;s.gallery.update(0);s.update=()=>{};h.game.step(performance.now(),0);
  });
  await page.screenshot({path:`tests/e2e/screenshots/${hero}-aim-${aim<0?'up':'down'}.png`});
  expect(errors).toEqual([]);
});
