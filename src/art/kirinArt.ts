import { FORM_COMBO, KIRIN } from '../sim/data/heroes';
import { bake, paintRuns, Raster, ScaledPen, type Material, type RectPainter } from './pixelRaster';

// The anime silhouette is an animal traced by branching lightning. Keep its white
// channels and cyan fringe distinct from the darker blue inside the coils.
const COIL = 1, ARC = 2, CORE = 3, SOCKET = 4;
const LIGHTNING: readonly Material[] = [
  { dark: 0x1c397b, base: 0x3264ad, light: 0x5096d6, hi: 0x86caff },
  { dark: 0x3b74bd, base: 0x60a9e9, light: 0x9edbff, hi: 0xc6f0ff },
  { dark: 0xb6eaff, base: 0xdaf7ff, light: 0xf4fdff, hi: 0xffffff },
  { dark: 0x0d1837, base: 0x142b5b, light: 0x234681, hi: 0x3969a9 },
];
const HEAD_X = 64, HEAD_Y = 80;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

function bakeHead(scale: number, biting: boolean) {
  const raster = new Raster(Math.ceil(102 * scale), Math.ceil(86 * scale));
  const r = new ScaledPen(raster, [0, 0], [0, 0], scale);

  // The far foreleg and swept, forked antlers sit behind the head.
  r.poly([[41, 23], [57, 19], [68, 24], [76, 34], [73, 42], [67, 37], [66, 29], [52, 26]], COIL);
  r.stroke([[69, 31], [78, 39], [77, 46]], ARC, 2);
  r.stroke([[72, 37], [71, 46], [67, 48]], CORE, 2);
  r.poly([[50, 30], [51, 18], [45, 11], [29, 5], [36, 4], [54, 10], [60, 17], [56, 28]], ARC);
  r.stroke([[49, 13], [51, 7], [43, 2]], CORE, 2);
  r.poly([[40, 28], [35, 18], [18, 14], [8, 4], [16, 8], [31, 9], [44, 17], [46, 26]], ARC);
  r.stroke([[29, 10], [25, 5], [18, 2]], CORE, 2);

  // The lightning mane streams back from a low brow and a long, wedge-shaped muzzle.
  r.poly([[42, 18], [27, 13], [15, 16], [25, 22], [6, 24], [20, 30], [3, 37],
    [21, 37], [10, 47], [26, 45], [19, 58], [38, 54], [49, 41]], ARC);
  r.stroke([[13, 24], [29, 26], [20, 32], [32, 36], [21, 43], [35, 43], [32, 52]], CORE, 2);
  r.poly([[30, 28], [40, 17], [53, 18], [60, 26], [68, 30], [70, 39], [81, 47],
    [82, 53], [75, 59], [65, 58], [57, 52], [49, 54], [38, 48], [32, 38]], COIL);
  r.poly([[42, 21], [51, 21], [57, 26], [59, 33], [67, 35], [70, 43], [80, 48],
    [77, 53], [70, 52], [65, 47], [55, 42], [48, 36], [40, 33]], ARC);

  // A sunken eye socket and a thin white glare under the ridge.
  r.poly([[39, 30], [53, 29], [61, 34], [55, 41], [48, 39], [44, 35]], SOCKET);
  r.poly([[44, 31], [57, 34], [53, 36], [48, 35]], CORE);
  r.stroke([[36, 28], [48, 27], [56, 30], [61, 34]], CORE, 2);
  r.stroke([[63, 39], [68, 43], [71, 48], [77, 49]], CORE, 2);
  r.poly([[76, 49], [81, 51], [78, 54], [74, 53]], SOCKET);
  const bite = biting ? -8 : 0;
  r.poly([[36, 43], [47, 49], [52, 58 + bite], [57, 65 + bite], [71, 65 + bite],
    [80, 59 + bite], [78, 68 + bite], [67, 77 + bite], [54, 77 + bite], [43, 66 + bite]], COIL);
  r.stroke([[45, 55 + bite], [55, 70 + bite], [66, 71 + bite], [76, 65 + bite]], ARC, 3);
  r.poly([[61, 51], [66, 55], [64, 63]], CORE);
  r.poly([[71, 54], [76, 55], [71, 64]], CORE);
  r.poly([[57, 68 + bite], [60, 61 + bite], [63, 66 + bite]], CORE);
  r.poly([[68, 68 + bite], [73, 62 + bite], [73, 65 + bite]], CORE);
  r.stroke([[63, 43], [75, 38], [86, 30], [93, 32], [99, 27]], ARC, 2);
  r.stroke([[63, 45], [75, 46], [85, 39], [94, 39]], CORE);

  // Near paw stays clear of the jaws so the claws read during the dive.
  r.stroke([[35, 31], [20, 40], [18, 52], [11, 60]], COIL, 6);
  r.stroke([[31, 34], [22, 42], [20, 52], [13, 58]], ARC, 3);
  r.stroke([[13, 57], [7, 64], [9, 67]], CORE, 2);
  r.stroke([[16, 55], [14, 64], [17, 65]], CORE, 2);
  return bake(raster, LIGHTNING, 0x2c5298, false);
}

const HEADS = Array.from({ length: 4 }, (_, form) => {
  const scale = KIRIN.scaleBase + KIRIN.scalePerForm * form;
  return { scale, open: bakeHead(scale, false), bite: bakeHead(scale, true) };
});

/** Gather overhead, hold a readable silhouette, then dive on the existing damage tick. */
export function drawKirin(g: RectPainter, x: number, y: number, t: number, level: number, time: number, facing = 1, impact = true): void {
  const { scale, open, bite } = HEADS[Math.max(0, Math.min(HEADS.length - 1, level - 1))];
  const progress = clamp(t / FORM_COMBO.windup);
  const alpha = clamp(progress / 0.18) * (1 - clamp((t - FORM_COMBO.windup) / 0.13));
  if (alpha > 0) {
    const ceiling = Math.min(0, y);
    const hover = Math.max(ceiling, y - Math.min(135, 84 * scale));
    const gather = 1 - (1 - clamp(progress / 0.46)) ** 3;
    const dive = clamp((progress - 0.58) / 0.42) ** 2.2;
    const readyY = ceiling + (hover - ceiling) * gather;
    const headY = readyY + (y - readyY) * dive;
    const flip = facing < 0;
    const tick = Math.floor(time * 22);
    const rect = (xx: number, yy: number, w: number, h: number, color: number, opacity = 1) => {
      g.fillStyle(color, alpha * opacity);
      g.fillRect(Math.round(x + (flip ? -xx - w : xx) * scale), Math.round(headY + yy * scale),
        Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    };

    // A long, S-curved channel remains attached to the head as it falls.
    const length = Math.max(70, (headY - ceiling) / scale);
    for (let d = 58, row = 0; d < length; d += 3, row++) {
      const neck = clamp((d - 58) / 29);
      const xx = -23 + (Math.sin(d * 0.066 + tick * 0.19) * 19 + Math.sin(d * 0.19) * 3) * neck;
      const width = 19 - 10 * (d / length);
      rect(xx - width, -d, width * 2, 4, 0x4f90da, 0.48);
      rect(xx - width * 0.72, -d, width * 1.42, 4, 0x88c9ff, 0.74);
      rect(xx - width * 0.19, -d, 4.5, 4, 0xe9fbff, 0.93);
      if ((row + tick) % 5 === 0) {
        rect(xx - width - 5, -d - 3, 12, 2, 0x8bcfff, 0.65);
        rect(xx - width - 7, -d - 7, 5, 5, 0xd7f5ff, 0.60);
      }
    }
    const head = progress >= 0.97 ? bite : open;
    const anchor = Math.round(HEAD_X * scale);
    paintRuns(g, head, Math.round(x) + (flip ? anchor : -anchor),
      Math.round(headY - HEAD_Y * scale), flip, alpha);
  }
  if (impact) drawKirinImpact(g, x, y, t, level, time);
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
