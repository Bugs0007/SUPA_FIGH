import {expect,it} from 'vitest';
import {aimSpirit} from '../../src/art/aimSpirit';
import {susanooSprite,kuramaSprite,SUSANOO,KURAMA,KURAMA_AIM_PAD,SUSANOO_GLOW} from '../../src/art/avatarSprites';
import {KURAMA_LAUNCH,SUSANOO_LAUNCH,avatarLaunch,avatarTargetAngle} from '../../src/sim/data/heroes';

it('angles Susanoo with the arrowhead at the rotated simulation firing point',()=>{
  const b=susanooSprite(4,2,0),m=SUSANOO_LAUNCH[4];
  for(const angle of [-1.5,-.8,.8,1.5]){
    const p=aimSpirit(b,'susanoo',SUSANOO.ax,SUSANOO.ay,SUSANOO.ax+m.ahead,SUSANOO.ay-m.up,angle);
    const launch=avatarLaunch('sasuke',4,angle),x=p.pad+SUSANOO.ax+launch.ahead,y=p.pad+SUSANOO.ay-launch.up;
    expect(p.baked.runs.some(r=>Math.abs(r.y-y)<2&&r.x<=x+2&&r.x+r.w>x-2&&r.c===SUSANOO_GLOW)).toBe(true);
    for(const r of p.baked.runs){expect(Number.isInteger(r.x)&&Number.isInteger(r.y)&&Number.isInteger(r.w)).toBe(true);}
    expect(aimSpirit(b,'susanoo',SUSANOO.ax,SUSANOO.ay,SUSANOO.ax+m.ahead,SUSANOO.ay-m.up,angle)).toBe(p);
  }
});
it('Kurama has different up and down head/posture poses with unchanged feet and tails',()=>{
  const b=kuramaSprite(0,true),m=KURAMA_LAUNCH;
  const up={baked:kuramaSprite(0,true,-.9),pad:KURAMA_AIM_PAD};
  const down={baked:kuramaSprite(0,true,.9),pad:KURAMA_AIM_PAD};
  expect(up.baked.runs).not.toEqual(down.baked.runs);
  const pixel=(pose:typeof up,x:number,y:number)=>pose.baked.runs.find(r=>r.y===y+pose.pad&&r.x<=x+pose.pad&&r.x+r.w>x+pose.pad)?.c;
  const tail=b.runs.find(r=>r.x<KURAMA.ax-35)!;
  expect(pixel(up,tail.x,tail.y)).toBe(tail.c);
  expect(pixel(down,tail.x,tail.y)).toBe(tail.c);
  expect(aimSpirit(b,'kurama',KURAMA.ax,KURAMA.ay,KURAMA.ax+m.ahead,KURAMA.ay-m.up,0).baked).toBe(b);
});
it('solves upward and downward rays from the moving bow or mouth',()=>{
  for(const hero of ['naruto','sasuke'])for(const [x,y] of [[0,-180],[180,-150],[180,120]]){
    const a=avatarTargetAngle(hero,4,x,y),m=avatarLaunch(hero,4,a);
    const cross=(x-m.ahead)*Math.sin(a)-(y+m.up)*Math.cos(a);
    expect(Math.abs(cross)).toBeLessThan(4);
  }
});
