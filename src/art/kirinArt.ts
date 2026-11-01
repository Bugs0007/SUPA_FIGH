import { FORM_COMBO, KIRIN } from '../sim/data/heroes';
import type { RectPainter } from './pixelRaster';

/** A horned lightning dragon descending into a bite. Whole-pixel bands, scaled geometry per form. */
export function drawKirin(g:RectPainter,x:number,y:number,t:number,level:number,time:number):void{
  const scale=KIRIN.scaleBase+KIRIN.scalePerForm*(Math.max(1,level)-1);
  const headY=y-90*scale*(1-Math.min(1,t/FORM_COMBO.windup));
  const rect=(xx:number,yy:number,w:number,h:number,c:number,a=1)=>{
    g.fillStyle(c,a);g.fillRect(Math.round(x+xx*scale),Math.round(headY+yy*scale),Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
  };
  for(let i=25;i>=0;i--){
    const yy=-i*4-10,xx=Math.sin(i*.44+time*7)*(3+i*.22);
    rect(xx-4,yy,9,5,0x3460b8,.5);rect(xx-2,yy,5,5,0x75bfff,.85);rect(xx,yy,1,5,0xecffff);
    if(i%3===0){rect(xx-7,yy-2,3,2,0xb5ecff,.8);rect(xx+5,yy+1,4,1,0xcaf6ff,.8);}
  }
  // Broad skull, tapering snout, black eye mask and two swept antlers.
  rect(-9,-24,18,5,0x3052a0,.9);rect(-12,-21,24,7,0x3052a0,.9);
  rect(-15,-16,30,7,0x3052a0,.9);rect(-11,-10,22,6,0x3052a0,.9);
  rect(-7,-23,14,5,0xc9f7ff);rect(-10,-19,20,9,0x84ceff);
  rect(-12,-14,24,5,0x84ceff);rect(-8,-9,16,8,0x9fe5ff);
  rect(-5,-3,10,7,0xc9f7ff);
  for(const side of [-1,1]){
    for(let i=0;i<9;i++)rect(side*(11+i*.7)-1,-20-i*2,3,3,i<5?0x8ccfff:0xe6ffff);
    for(let i=0;i<5;i++)rect(side*(10-i)-1,-16+i*.6,3,3,0x142b62);
    rect(side*6-1,-12,3,1,0xffffff);
    for(let i=0;i<4;i++){
      rect(side*(13+i)-1,-10-i*2,3,2,0xc9f7ff);
      if(i<3)rect(side*(15+i)-1,-29-i*2,2,2,0xe6ffff);
    }
    rect(side*12-2,-5,4,6,0x5a9ddf);rect(side*16-1,-8,1,9,0xd8faff,.7);
  }
  const jaw=t<FORM_COMBO.windup?8:2;
  rect(-7,0,14,jaw+2,0x111d42);rect(-6,jaw+2,12,3,0x8fdcff);
  for(const xx of [-6,4])for(let i=0;i<5;i++)rect(xx+(xx<0?i*.2:-i*.2),i,Math.max(1,3-i*.5),1,0xffffff);
  for(const xx of [-4,3])rect(xx,jaw,2,3,0xe7ffff);
  rect(-3,-4,6,2,0x152951);rect(-1,-20,2,8,0x4279bd);
}
