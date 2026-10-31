import type Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;
type XY = [number, number];
const points = (xy: XY[], x: number, y: number, d: number, s: number) => xy.map(([a,b])=>({x:Math.round(x+d*a*s),y:Math.round(y+b*s)}));

/** Layered, outlined spectral anatomy. Local coordinates always face the opponent. */
export class AvatarArt {
  constructor(private back: G, private front: G) {}

  private shape(g: G, xy: XY[], x: number, y: number, d: number, s: number, fill: number, alpha: number, edge = 0x291c4c): void {
    const p=points(xy,x,y,d,s);
    g.fillStyle(fill,alpha).fillPoints(p,true);
    g.lineStyle(1,edge,Math.min(1,alpha+.25)).strokePoints(p,true);
  }

  /** Articulated arm with elbow plate, layered bracer, thumb and four clenched knuckles. */
  arm(g: G, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, d: number, r: number, gold: boolean, alpha=1): void {
    const edge=gold?0x684016:0x352154, body=gold?0xe6a62e:0x7651b5, lit=gold?0xffe696:0xc19bea;
    g.lineStyle(r*1.5+2,edge,alpha).strokePoints([{x:sx,y:sy},{x:ex,y:ey},{x:hx,y:hy}],false);
    g.lineStyle(r*1.5,body,alpha).strokePoints([{x:sx,y:sy},{x:ex,y:ey},{x:hx,y:hy}],false);
    g.lineStyle(1,lit,alpha*.9).strokePoints([{x:sx,y:sy-r*.35},{x:ex,y:ey-r*.35},{x:hx,y:hy-r*.35}],false);
    const ux=(hx-ex)/Math.max(1,Math.hypot(hx-ex,hy-ey)),uy=(hy-ey)/Math.max(1,Math.hypot(hx-ex,hy-ey));
    for(let i=0;i<3;i++){
      const x=hx-ux*(r+2+i*3),y=hy-uy*(r+2+i*3);
      g.lineStyle(1,edge,alpha*.85).lineBetween(x+uy*r*.6,y-ux*r*.6,x-uy*r*.6,y+ux*r*.6);
    }
    const xy:XY[]=[[-r,-r*.5],[-r*.5,-r],[r*.65,-r],[r,-r*.45],[r,r*.6],[r*.4,r],[-r*.6,r*.65]];
    this.shape(g,xy,hx,hy,d,1,body,alpha,edge);
    g.fillStyle(lit,alpha).fillRect(Math.round(hx-r*.5),Math.round(hy-r*.75),Math.max(2,r),Math.max(1,r*.25));
    for(let i=0;i<3;i++)g.lineStyle(1,edge,alpha).lineBetween(hx+d*(r*.1+i*r*.25),hy-r*.65,hx+d*(r*.1+i*r*.25),hy-r*.1);
    g.lineStyle(2,edge,alpha).lineBetween(hx-d*r*.7,hy,hx+d*r*.3,hy+r*.45);
    if(gold)g.fillStyle(0x573119,alpha).fillRect(Math.round(hx-d*r*.4),Math.round(hy+r*.25),2,2);
  }

  susanoo(x: number,y: number,d: number,level: number,alpha: number,time: number,pose:'bow'|'guard'='bow',charge=1): void {
    const g=this.back, s=(level===4?1.28:.94)*(pose==='guard'?.58:1), px=(a:number)=>x+d*a*s,py=(b:number)=>y+b*s;
    const shape=(xy:XY[],fill:number,a=alpha)=>this.shape(g,xy,x,y,d,s,fill,a);
    const line=(xy:XY[],color=0xbf95ef,a=alpha,width=1)=>g.lineStyle(width,color,a).strokePoints(points(xy,x,y,d,s),false);
    const pulse=1+Math.sin(time*8)*.025;
    // Wing fans are made of separate tapered feathers, with seams and a brighter leading edge.
    if(level===4&&pose==='bow')for(const side of [-1,1]){
      const root=-13;
      for(let i=0;i<6;i++){
        const reach=33+i*4,tip=-92+i*7;
        shape([[root,-56],[root+side*(reach-6),tip-10],[root+side*(reach+8),tip-13],
          [root+side*(reach-7),tip+14],[root+side*16,-38]],i%2?0x7750ad:0x8964c2,alpha*.48);
        line([[root+side*9,-55],[root+side*(reach+6),tip-12]],0xd3aff8,alpha*.62);
      }
    }
    // Layered torso volume, back plates and a scalloped chakra hem.
    shape([[-35,-6],[-34,-43],[-29,-65],[-18,-72],[0,-68],[15,-48],[18,-8],[8,0],[-7,-6],[-20,2]],0x533377,alpha*.48);
    for(let i=0;i<5;i++){
      const yy=-53+i*9;
      shape([[-29,yy],[-15,yy+5],[7,yy],[10,yy+8],[-12,yy+13],[-31,yy+7]],i%2?0x7950ad:0x8e63c4,alpha*.7);
      line([[-27,yy+1],[-14,yy+6],[6,yy+1]],0xd1a7fa,alpha*.75);
    }
    line([[-14,-57],[-13,-10]],0xe7caff,alpha*.7,2);
    // Serrated pauldrons and small overlapping plates give the shoulders a samurai silhouette.
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const xx=-13+side*(20+i*2),yy=-60+i*6;
      shape([[xx-side*9,yy],[xx+side*5,yy-3],[xx+side*12,yy+7],[xx+side*1,yy+10],[xx-side*9,yy+5]],i%2?0x8255b9:0x9b6dd1,alpha*.83);
      line([[xx-side*7,yy+1],[xx+side*4,yy-1],[xx+side*10,yy+6]],0xe0bafa,alpha*.7);
    }
    // Mask: horn crest, long brow, cheek planes, beaked nose and a toothed menpo jaw.
    shape([[-27,-65],[-29,-83],[-25,-97],[-19,-106],[-18,-91],[-11,-95],[-8,-84],[0,-81],[4,-73],[-3,-67],[-7,-59],[-19,-58]],0x956acb,alpha*.92);
    shape([[-25,-82],[-16,-88],[-9,-83],[1,-79],[-3,-73],[-13,-75],[-21,-71]],0xb28be1,alpha*.92);
    shape([[-11,-80],[3,-77],[9,-70],[-1,-70],[-7,-65]],0x68418f,alpha*.95);
    shape([[-22,-70],[-10,-68],[-2,-70],[-6,-61],[-17,-59]],0x4e2d77,alpha*.94);
    line([[-25,-84],[-19,-99],[-19,-89]],0xe2c2ff,alpha*.85);
    line([[-23,-79],[-17,-81],[-10,-78],[-3,-78]],0x37204d,alpha,2);
    g.fillStyle(0xffeaa3,alpha).fillPoints(points([[-16,-78],[-9,-76],[-13,-73]],x,y,d,s),true);
    for(let i=0;i<4;i++)line([[-17+i*3,-67],[-16+i*3,-64]],0xe1c1fc,alpha*.86);
    line([[-24,-73],[-21,-65],[-18,-62]],0xc39be8,alpha*.9);
    // Belt seal / layered skirt. Flame tips move without turning the guardian into an orbit effect.
    shape([[-29,-15],[-11,-11],[10,-15],[12,-7],[-11,-3],[-29,-7]],0x432458,alpha*.85);
    shape([[-16,-12],[-11,-15],[-6,-11],[-10,-5]],0xd0a9f2,alpha);
    for(let i=0;i<7;i++){
      const xx=-32+i*7, lift=Math.sin(time*7+i)*3;
      shape([[xx,-7],[xx+8,-7],[xx+5,7+lift],[xx+2,3+lift],[xx-2,10+lift]],0x8c57ba,alpha*.3);
    }
    const bodyA=alpha*.85;
    if(pose==='bow'){
      const draw=charge<0?.25:Math.max(0,Math.min(1,charge));
      this.arm(g,px(-29),py(-53),px(-39),py(-32),px(-7-12*draw),py(-26),d,5*s,false,bodyA);
      this.arm(g,px(6),py(-52),px(22),py(-36),px(31),py(-26),d,5*s,false,bodyA);
      const fg=this.front;
      const bow:XY[]=[[25,-61],[38,-51],[43,-38],[45,-26],[42,-10],[35,3],[25,10]];
      fg.lineStyle(5*s,0x3e235b,alpha).strokePoints(points(bow,x,y,d,s),false);
      fg.lineStyle(3*s,0x9f71cf,alpha).strokePoints(points(bow,x,y,d,s),false);
      fg.lineStyle(1,0xe5c1ff,alpha*.9).strokePoints(points(bow,x,y,d,s),false);
      fg.lineStyle(1,0xf7ddff,alpha*.95).strokePoints(points([[25,-61],[-7-12*draw,-26],[25,10]],x,y,d,s),false);
      for(const yy of [-55,4])this.shape(fg,[[23,yy-3],[29,yy],[23,yy+3],[20,yy]],x,y,d,s,0xc6a0ee,alpha);
      if(charge>=0){
        fg.lineStyle(2*s,0xdbc1ff,alpha*pulse).lineBetween(px(-13),py(-26),px(44),py(-26));
        this.shape(fg,[[52,-26],[39,-32],[41,-26],[39,-20]],x,y,d,s,0xd9b5ff,alpha);
      }
    } else {
      this.arm(g,px(-30),py(-53),px(-35),py(-28),px(-20),py(-14),d,4*s,false,bodyA*.6);
    }
  }

  /** Nine-tailed avatar only exists for Naruto's final ultimate. Its mouth matches the real launch point. */
  kurama(x:number,y:number,d:number,alpha:number,time:number):void{
    const g=this.back;
    const shape=(xy:XY[],c:number,a=alpha)=>this.shape(g,xy,x,y,d,1,c,a,0x68411d);
    // Nine thick flame tails, built from narrowing articulated segments.
    for(let i=0;i<9;i++){
      const theta=-.25+i*.19,len=50+(i%3)*7;
      const tail:XY[]=[];
      for(let j=0;j<5;j++){
        const t=j/4,xx=-17-Math.cos(theta)*len*t,yy=-14-Math.sin(theta)*len*t;
        tail.push([xx,yy+Math.sin(time*4+i+j)*2]);
      }
      g.lineStyle(8,0x6d421a,alpha*.65).strokePoints(points(tail,x,y,d,1),false);
      g.lineStyle(6,0xe3a530,alpha*.7).strokePoints(points(tail,x,y,d,1),false);
      g.lineStyle(2,0xffe79a,alpha*.8).strokePoints(points(tail,x,y,d,1),false);
    }
    shape([[-27,-4],[-30,-32],[-22,-52],[-10,-60],[9,-53],[22,-30],[26,-3],[5,2],[-6,-4]],0xda9d27,alpha*.65);
    shape([[-22,-36],[-12,-48],[2,-43],[12,-27],[3,-8],[-9,-5],[-20,-16]],0xffd55d,alpha*.7);
    // Tall ears, slanted eyes and an elongated fox muzzle facing the opponent.
    shape([[-11,-47],[-12,-80],[-2,-68],[8,-55],[19,-57],[21,-76],[30,-58],[31,-45],[43,-39],[52,-33],[46,-25],[30,-22],[12,-30],[-4,-30]],0xefb634,alpha*.9);
    shape([[-8,-72],[-2,-64],[5,-53],[-3,-57]],0x59321b,alpha*.95);
    shape([[22,-68],[26,-56],[23,-49],[19,-54]],0x59321b,alpha*.95);
    shape([[8,-48],[22,-51],[26,-46],[17,-43]],0x35232a,alpha);
    shape([[15,-47],[22,-48],[20,-45]],0xfff3b2,alpha);
    shape([[29,-39],[47,-36],[52,-32],[45,-29],[31,-31]],0xffdc70,alpha*.96);
    shape([[44,-36],[52,-33],[49,-29],[44,-31]],0x3f2920,alpha);
    g.lineStyle(2,0x51351d,alpha).strokePoints(points([[19,-33],[29,-26],[43,-25],[49,-29]],x,y,d,1),false);
    for(let i=0;i<4;i++)shape([[27+i*4,-27],[30+i*4,-27],[29+i*4,-23]],0xffefba,alpha);
    for(let i=0;i<3;i++)g.lineStyle(1,0x4f341f,alpha).lineBetween(x+d*(6-i*2),y-39+i*4,x+d*(18-i*2),y-35+i*4);
    for(let i=0;i<3;i++)shape([[-15+i*8,-42],[-11+i*8,-40],[-13+i*8,-34],[-17+i*8,-36]],0x513420,alpha*.9);
    this.arm(g,x-d*20,y-32,x-d*31,y-12,x-d*18,y-2,d,7,true,alpha*.7);
    this.arm(this.front,x+d*9,y-29,x+d*21,y-10,x+d*31,y-3,d,7,true,alpha*.8);
    g.lineStyle(2,0x68411d,alpha*.8).lineBetween(x-d*10,y-29,x-d*6,y-7);
  }
}
