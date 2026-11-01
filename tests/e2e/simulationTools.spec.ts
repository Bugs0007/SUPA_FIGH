import {expect,test} from '@playwright/test';
test('unlimited Brawl setup starts a match and displays numeric scores',async({page})=>{
  await page.goto('/?scene=lobby&timer=1');
  await page.waitForFunction(()=>(window as any).__GAME__?.game.scene.isActive('lobby'));
  const limit=await page.evaluate(()=>{
    const s=(window as any).__GAME__.game.scene.getScene('lobby');
    s.cfg.roundsToWin=10;s.changeSetting('length',1);return s.cfg.roundsToWin;
  });
  expect(limit).toBe(0);
  await page.keyboard.press('ArrowDown');
  await page.evaluate(()=>{
    const s=(window as any).__GAME__.game.scene.getScene('lobby');s.start();
  });
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>10);
  await page.evaluate(()=>{
    const m=(window as any).__GAME__.match();m.scores.set(100,123);
  });
  await page.waitForFunction(()=>{
    const s=(window as any).__GAME__.game.scene.getScene('hud');return s.roundText.text.includes('UNLIMITED')&&s.dmScores.some((t:any)=>t.text==='123');
  });
  await page.screenshot({path:'tests/e2e/screenshots/unlimited-brawl.png'});
});
