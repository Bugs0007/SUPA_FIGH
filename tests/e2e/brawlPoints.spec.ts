import { expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
for(const count of [4,10])test(`pause shows all ${count} players and championship placement points`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const humans=count===10?2:1;
  await page.goto(`/?scene=match&timer=1&humans=${humans}&bots=${count-humans}&heroes=naruto,luffy,goku,sasuke&powers=0&map=test`);
  await page.waitForFunction(()=>(window as any).__GAME__?.match()?.world.tick>20);
  const result=await page.evaluate((count)=>{
    const h=(window as any).__GAME__,s=h.game.scene.getScene('match'),m=s.match;
    m.cfg.roundsToWin=3;
    for(let id=0;id<count-1;id++){
      const f=m.world.fighters[id];f.alive=false;f.gone=true;f.hp=0;f.state='dead';m.step([]);
    }
    for(let t=0;t<100&&m.phase==='fight';t++)m.step([]);
    m.stats[count-1].damage=1234;m.stats[count-1].kills=count-1;
    // Pause before the scene can advance to the next round.
    s.paused=true;
    return {scores:[...m.scores.values()],placements:m.roundPlacements.length};
  },count);
  expect(result.placements).toBe(count);expect(result.scores[0]).toBe(count-1);expect(result.scores[count-1]).toBe(0);
  await page.waitForFunction((count)=>{
    const hud=(window as any).__GAME__.game.scene.getScene('hud');
    return hud.pauseStats.length===count+1&&hud.pauseStats[0][0].visible;
  },count);
  const rows=await page.evaluate(()=>{
    const hud=(window as any).__GAME__.game.scene.getScene('hud');
    return {header:hud.pauseStats[0].map((t:any)=>t.text),rows:hud.pauseStats.slice(1).map((row:any[])=>row.map(t=>t.text)),bounds:hud.pauseStats.flat().map((t:any)=>({x:t.getBounds().x,right:t.getBounds().right,y:t.y})),title:hud.roundText.text};
  });
  expect(rows.header).toEqual(['#','PLAYER','HERO','PTS','K','D','DMG','W','LAST','HP']);
  expect(rows.rows).toHaveLength(count);
  expect(rows.rows[0][3]).toBe(String(count-1));expect(rows.rows[0][6]).toBe('1234');expect(rows.rows[0][8]).toBe(`1/+${count-1}`);
  expect(rows.rows[count-1][3]).toBe('0');expect(rows.rows[count-1][8]).toBe(`${count}/+0`);
  expect(rows.title).toContain('POINTS');expect(rows.title).toContain('/ 3');
  for(const bounds of rows.bounds){expect(bounds.x).toBeGreaterThanOrEqual(12);expect(bounds.right).toBeLessThanOrEqual(468);expect(bounds.y).toBeLessThan(270);}
  await page.screenshot({path:`tests/e2e/screenshots/pause-standings-${count}.png`});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!(window as any).__GAME__.game.scene.getScene('match').paused);
  expect(errors).toEqual([]);
});
