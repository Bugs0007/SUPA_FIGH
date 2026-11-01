import { expect, test } from '@playwright/test';

test('setup Random selects a different arena on the next round',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('/?scene=lobby&timer=1');
  await page.waitForFunction(()=> (window as any).__GAME__?.scene().includes('lobby'));
  const press=async(key:string,n=1)=>{for(let i=0;i<n;i++){await page.keyboard.press(key);await page.waitForTimeout(60);}};
  await press('ArrowDown',10);await press('ArrowLeft');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('scrapyard.lobby')!).mapId)).toBe('random');
  await page.screenshot({path:'tests/e2e/screenshots/random-map-setup.png'});
  await press('ArrowDown',9);await press('Enter');
  await page.waitForFunction(()=>((window as any).__GAME__?.match()?.world.tick??0)>5);
  const before=await page.evaluate(()=>{const m=(window as any).__GAME__.match();return {id:m.world.def.id,round:m.round,cfg:m.cfg.mapId};});
  expect(before.cfg).toBe('random');
  await page.evaluate(()=> (window as any).__GAME__.match().startRound());
  await page.waitForTimeout(300);
  const after=await page.evaluate(()=>{const m=(window as any).__GAME__.match();return {id:m.world.def.id,round:m.round};});
  expect(after.round).toBe(before.round+1);expect(after.id).not.toBe(before.id);
  expect(errors).toEqual([]);
});
