import {expect,test} from '@playwright/test';
for(const mode of ['sling','kick'])test(`Jet Bazooka ${mode} animates through windup, release and recovery`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?scene=art&page=moves&hero=luffy&move=special&jet=${mode}`);
  await page.waitForFunction(()=>(window as any).__GAME__?.game.scene.getScene('art').gallery);
  for(const [phase,t] of [['windup',.7],['release',.86],['recovery',1.05]] as const){
    const pose=await page.evaluate(t=>{
      const h=(window as any).__GAME__,s=h.game.scene.getScene('art');h.game.loop.stop();s.update=()=>{};
      s.gallery.t=t;s.gallery.update(0);h.game.step(performance.now(),0);
      const v=s.gallery.views[1];return {mode:v.fighter.jetMode,frame:v.body.frame.name,rotation:v.rig.rotation};
    },t);
    expect(pose.mode).toBe(mode);expect(Number.isFinite(pose.rotation)).toBe(true);
    await page.screenshot({path:`tests/e2e/screenshots/jet-${mode}-${phase}.png`});
  }
  expect(errors).toEqual([]);
});
