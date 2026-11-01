import { FORM_COMBO, KIRIN } from '../sim/data/heroes';
import type { RectPainter } from './pixelRaster';

/** A horned lightning dragon descending into a bite. Whole-pixel bands, scaled geometry per form. */
export function drawKirin(g:RectPainter,x:number,y:number,t:number,level:number,time:number,facing=1):void{
  const scale=KIRIN.scaleBase+KIRIN.scalePerForm*(Math.max(1,level)-1);
  // World y=0 is the map ceiling. Reach the marked strike at the damage tick,
  // regardless of map height or transformation size.
  const progress=Math.max(0,Math.min(1,t/FORM_COMBO.windup));
  const ceilingY=Math.min(0,y);
  const headY=ceilingY+(y-ceilingY)*progress;
  const rect=(xx:number,yy:number,w:number,h:number,c:number,a=1)=>{
    g.fillStyle(c,a);g.fillRect(Math.round(x+(facing<0?-xx-w:xx)*scale),Math.round(headY+yy*scale),Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
  };
  for(let i=25;i>=0;i--){
    const yy=-i*4-10,xx=Math.sin(i*.44+time*7)*(3+i*.22);
    rect(xx-4,yy,9,5,0x3460b8,.5);rect(xx-2,yy,5,5,0x75bfff,.85);rect(xx,yy,1,5,0xecffff);
    if(i%3===0){rect(xx-7,yy-2,3,2,0xb5ecff,.8);rect(xx+5,yy+1,4,1,0xcaf6ff,.8);}
  }
  // Side profile: swept horns, one glaring eye and a long downturned snout.
  rect(-16,-26,22,20,0x3052a0);rect(-10,-22,22,16,0x84ceff);
  rect(-13,-25,16,5,0xc9f7ff);rect(4,-17,13,11,0x3052a0);
  rect(7,-15,11,7,0x9fe5ff);rect(13,-10,10,8,0x3052a0);
  rect(14,-9,8,6,0xc9f7ff);
  for(let i=0;i<10;i++){
    rect(-11-i*1.3,-24-i*1.8,4,3,i<5?0x8ccfff:0xe6ffff);
    if(i>3&&i%3===0)rect(-11-i*1.3,-29-i*1.8,2,6,0xe6ffff);
  }
  for(let i=0;i<6;i++)rect(-17-i,-17+i*3,7,3,0xb5ecff,.8);
  rect(-2,-19,12,5,0x142b62);rect(3,-17,5,2,0xffffff);
  rect(0,-21,11,3,0x4279bd);
  const jaw=t<FORM_COMBO.windup?8:2;
  rect(-4,-6,23,jaw+3,0x111d42);rect(-7,jaw-4,25,4,0x8fdcff);
  for(const xx of [2,13])for(let i=0;i<5;i++)rect(xx,-5+i,Math.max(1,3-i*.5),1,0xffffff);
  rect(16,0,6,3,0x152951);
  rect(-13,-11,7,8,0x5a9ddf);
  drawKirinImpact(g,x,y,t,level,time);
}

/** The existing area hit becomes a branching lightning burst on the same frame. */
export function drawKirinImpact(g:RectPainter,x:number,y:number,t:number,level:number,time:number):void{
  const age=t-FORM_COMBO.windup;
  if(age<0||age>=FORM_COMBO.duration-FORM_COMBO.windup)return;
  const p=age/(FORM_COMBO.duration-FORM_COMBO.windup),fade=1-p;
  const radius=KIRIN.radius+KIRIN.radiusPerForm*(Math.max(1,level)-1);
  const pixel=(xx:number,yy:number,size:number,c:number,a:number)=>{
    g.fillStyle(c,a);g.fillRect(Math.round(xx),Math.round(yy),size,size);
  };
  // A white-blue flash at contact, followed by expanding ground arcs and forked bolts.
  for(let dy=-12;dy<=12;dy+=2){
    const width=Math.round(Math.sqrt(144-dy*dy)*(1-p)*1.4);
    if(width>0){g.fillStyle(0xdafaff,fade*.85);g.fillRect(Math.round(x-width),Math.round(y+dy),width*2,2);}
  }
  for(let arm=0;arm<9;arm++){
    const angle=arm*Math.PI*2/9;
    for(let step=1;step<=18;step++){
      const d=step/18*radius*(.55+p*.8);
      const zig=Math.sin(step*2.3+arm*3+Math.floor(time*22))*(2+step*.15);
      const xx=x+Math.cos(angle)*d-Math.sin(angle)*zig;
      const yy=y+Math.sin(angle)*d*.65+Math.cos(angle)*zig;
      pixel(xx-1,yy-1,3,0x448fe8,fade*.65);pixel(xx,yy,1,0xeaffff,fade);
      if(step%6===0)for(let fork=1;fork<5;fork++)pixel(xx+Math.cos(angle+.8)*fork*2,yy-Math.abs(Math.sin(angle+.8))*fork*2,1,0x91dfff,fade);
    }
  }
  for(let i=0;i<50;i++){
    const angle=i/50*Math.PI*2,r=radius*(.5+p);
    pixel(x+Math.cos(angle)*r,y+11+Math.sin(angle)*r*.22,2,0x9ceaff,fade*.8);
  }
}
