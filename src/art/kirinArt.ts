import { FORM_COMBO, KIRIN } from '../sim/data/heroes';
import type { RectPainter } from './pixelRaster';

/** A horned lightning dragon descending into a bite. Whole-pixel bands, scaled geometry per form. */
export function drawKirin(g:RectPainter,x:number,y:number,t:number,level:number,time:number,facing=1,impact=true):void{
  const scale=KIRIN.scaleBase+KIRIN.scalePerForm*(Math.max(1,level)-1);
  // World y=0 is the map ceiling. Reach the marked strike at the damage tick,
  // regardless of map height or transformation size.
  const progress=Math.max(0,Math.min(1,t/FORM_COMBO.windup));
  const ceilingY=Math.min(0,y);
  const headY=ceilingY+(y-ceilingY)*progress;
  const rect=(xx:number,yy:number,w:number,h:number,c:number,a=1)=>{
    g.fillStyle(c,a);g.fillRect(Math.round(x+(facing<0?-xx-w:xx)*scale),Math.round(headY+yy*scale),Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
  };
  // A substantial scaled body connects the neck to the actual map ceiling,
  // rather than a short, thin lightning cord floating above the head.
  const length=Math.max(26,(headY-ceilingY)/scale);
  for(let d=length;d>=12;d-=3){
    const u=Math.min(1,d/Math.max(1,length));
    const neck=Math.min(1,(d-12)/35);
    const xx=-8+Math.sin(d*.055+time*5)*10*neck;
    const width=26-9*u;
    rect(xx-width/2,-d,width,5,0x3052a0,.95);
    rect(xx-width/2+3,-d,width-5,5,0x75bfff,.95);
    rect(xx+width/2-7,-d,4,5,0xc9f7ff);
    if(Math.floor(d/3)%4===0){
      rect(xx-width/2-5,-d-2,7,3,0xb5ecff,.9);
      rect(xx-4,-d,8,1,0x4279bd);
    }
  }
  // Forelegs and hooked claws give the descending silhouette a dragon posture.
  for(const side of [-1,1]){
    for(let i=0;i<8;i++)rect(-8+side*(10+i*1.6),-40+i*2.2,6,5,0x75bfff);
    for(let claw=0;claw<3;claw++)rect(-8+side*24+claw*3,-24+claw*2,2,7,0xecffff);
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
  if(impact)drawKirinImpact(g,x,y,t,level,time);
}

/** The existing area hit becomes a branching lightning burst on the same frame. */
export function drawKirinImpact(g:RectPainter,x:number,y:number,t:number,level:number,time:number):void{
  const age=t-FORM_COMBO.windup;
  if(age<0||t>=FORM_COMBO.windup+KIRIN.impactTime)return;
  const p=age/KIRIN.impactTime,fade=1-p;
  const radius=KIRIN.radius+KIRIN.radiusPerForm*(Math.max(1,level)-1);
  const blast=KIRIN.blastRadius+KIRIN.blastRadiusPerForm*(Math.max(1,level)-1);
  const pixel=(xx:number,yy:number,size:number,c:number,a:number)=>{
    g.fillStyle(c,a);g.fillRect(Math.round(xx),Math.round(yy),size,size);
  };
  const bolt=(x0:number,y0:number,x1:number,y1:number)=>{
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0))/2));
    for(let i=0;i<=n;i++){
      const xx=x0+(x1-x0)*i/n,yy=y0+(y1-y0)*i/n;
      pixel(xx-2,yy-2,5,0x448fe8,fade*.65);
      pixel(xx,yy,2,0xeaffff,fade);
    }
  };
  // The main lightning channel visibly connects the map ceiling to the strike.
  let skyX=x,skyY=Math.min(0,y);
  const skySteps=Math.max(1,Math.ceil((y-skyY)/18));
  for(let i=1;i<=skySteps;i++){
    const nextY=Math.min(y,i/skySteps*y);
    const nextX=i===skySteps?x:x+Math.sin(i*2.1+Math.floor(time*18))*7;
    bolt(skyX,skyY,nextX,nextY);skyX=nextX;skyY=nextY;
  }
  // An actual expanding detonation, not just a small flash surrounded by sparks.
  const disc=(cx:number,cy:number,r:number,ry:number,color:number,alpha:number)=>{
    if(alpha<=0||r<1)return;
    g.fillStyle(color,alpha);
    const h=Math.ceil(r*ry);
    for(let row=-h;row<=h;row+=2){
      const half=Math.round(r*Math.sqrt(Math.max(0,1-(row/h)**2)));
      if(half>0)g.fillRect(Math.round(cx-half),Math.round(cy+row),half*2,2);
    }
  };
  const expansion=1-(1-Math.min(1,age/.14))**3;
  const coreRadius=blast*(.22+.78*expansion);
  const coreAlpha=Math.max(0,1-Math.max(0,age-.12)/.26);
  const coreY=y-coreRadius*.6;
  // Blue pressure shell, cyan energy cloud and a hot white centre.
  // Uneven lobes break the silhouette into a bursting cloud instead of an energy ball.
  for(let lobe=0;lobe<7;lobe++){
    const a=Math.PI+.12+lobe*(Math.PI-.24)/6;
    const r=coreRadius*(.27+.07*Math.cos(lobe*5));
    const cx=x+Math.cos(a)*coreRadius*.85,cy=coreY+Math.sin(a)*coreRadius*.85;
    disc(cx,cy,r,.95,0x2669cc,coreAlpha*.9);
    disc(cx,cy,r*.78,.95,0x75dfff,coreAlpha);
  }
  for(const side of [-1,1])disc(x+side*coreRadius*.58,coreY+coreRadius*.1,coreRadius*.48,.85,0x3b8aee,coreAlpha*.85);
  disc(x,coreY,coreRadius, .9,0x2669cc,coreAlpha*.9);
  disc(x,coreY,coreRadius*.83,.9,0x75dfff,coreAlpha);
  disc(x,coreY,coreRadius*.58,.9,0xf0ffff,coreAlpha);
  // Tall irregular jets flare out of the blast while the core expands.
  for(let ray=0;ray<11;ray++){
    const angle=Math.PI+ray*Math.PI/10;
    const reach=blast*(.9+Math.sin(ray*7)*.25)*(.4+expansion*.8);
    const tipX=x+Math.cos(angle)*reach,tipY=y+Math.sin(angle)*reach;
    if(age<.32)bolt(x+Math.cos(angle)*coreRadius*.4,coreY,tipX,tipY);
  }
  // Two broad shock fronts travel away from the detonation along the ground.
  for(const delay of [0,.09]){
    const q=Math.max(0,age-delay);
    if(age<delay)continue;
    const r=blast*(.25+Math.min(1,q/.5)*1.45),thickness=Math.max(2,6*(1-p));
    g.fillStyle(delay?0x66bfff:0xdcffff,fade*(delay?.6:.9));
    for(let row=-Math.ceil(r*.3);row<=r*.3;row+=2){
      const outer=Math.round(r*Math.sqrt(Math.max(0,1-(row/(r*.3))**2)));
      const innerR=Math.max(1,r-thickness);
      const inner=Math.abs(row)<innerR*.3?Math.round(innerR*Math.sqrt(Math.max(0,1-(row/(innerR*.3))**2))):0;
      if(outer>inner){
        g.fillRect(Math.round(x-outer),Math.round(y+11+row),outer-inner,2);
        g.fillRect(Math.round(x+inner),Math.round(y+11+row),outer-inner,2);
      }
    }
  }
  // Rising blue-grey dust makes the blast settle rather than vanish on one frame.
  for(let cloud=0;cloud<7;cloud++){
    const a=cloud*Math.PI*2/7;
    disc(x+Math.cos(a)*blast*(.35+p*.45),y-8-p*blast*.65+Math.sin(a)*blast*.18,blast*(.12+p*.12),.8,cloud%2?0x36557f:0x7097bc,Math.sin(Math.PI*p)*.28);
  }
  for(let arm=0;arm<8;arm++){
    const angle=arm*Math.PI*2/8;
    let prevX=x,prevY=y;
    for(let step=1;step<=5;step++){
      const d=step/5*Math.max(radius,blast*.8)*(.9+p*.8);
      const zig=Math.sin(step*2.3+arm*3+Math.floor(time*18))*(2+step);
      const xx=x+Math.cos(angle)*d-Math.sin(angle)*zig;
      const yy=y+Math.sin(angle)*d*.65+Math.cos(angle)*zig;
      bolt(prevX,prevY,xx,yy);
      if(step===3)bolt(xx,yy,xx+Math.cos(angle+.8)*radius*.4,yy-Math.abs(Math.sin(angle+.8))*radius*.4);
      prevX=xx;prevY=yy;
    }
  }
  for(let i=0;i<50;i++){
    const angle=i/50*Math.PI*2,r=radius*(.5+p);
    pixel(x+Math.cos(angle)*r,y+11+Math.sin(angle)*r*.22,2,0x9ceaff,fade*.8);
  }
}
