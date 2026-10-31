import type Phaser from 'phaser';
import { heroDef } from '../sim/data/heroes';
import { activeWeapon } from '../sim/fighter';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';
import { AvatarArt } from './AvatarArt';
import { LuffyAbilityArt } from './LuffyAbilityArt';

type G=Phaser.GameObjects.Graphics;

/** Draw the same anticipation, contact window and recovery that the melee hitbox uses. */
export class HeroComboArt {
  private avatar:AvatarArt;
  constructor(private back:G,private front:G,private luffy:LuffyAbilityArt){this.avatar=new AvatarArt(back,front);}

  draw(v:FighterView,x:number,y:number,time:number):boolean{
    const f=v.fighter,lv=formLevel(f),h=heroDef(f.hero);
    if(!h||f.state!=='melee'||activeWeapon(f).hold!=='fist')return false;
    const hit=h.combo[Math.min(f.combo,h.combo.length-1)],t=f.stateTime;
    const end=hit.windup+hit.active;
    const extension=t<hit.windup ? .18+.12*t/hit.windup : t<end ? 1 : Math.max(0,1-(t-end)/(hit.recover*.7));
    const opacity=t<end?1:Math.max(0,1-(t-end)/(hit.recover*.9));
    const reach=f.w/2+hit.range+(lv>0?h.forms[lv-1].reach:0);
    const side=f.facing, upper=f.combo===2,finisher=!!hit.kick;
    const handY=y-(finisher?10:upper?13:16);
    if(f.hero==='luffy'){
      this.luffy.combo(v,x,y,reach,extension,opacity,upper,finisher);
      return true;
    }
    if(f.hero==='sasuke'&&lv>=3){
      if(opacity>.02){
        this.avatar.susanoo(x-side*4,y,side,lv,opacity*.45,time,'guard');
        const r=lv===4?4.5:3.5,hx=x+side*(reach-r)*extension;
        this.avatar.arm(this.front,x-side*6,y-27,x+side*(reach*.4)*extension,y-(upper?28:20),hx,handY,side,r,false,opacity);
        this.strokes(hx,handY,side,reach,0xd9b5ff,opacity);
      }
      return true;
    }
    if(f.hero==='naruto'&&lv===4){
      const r=4,hx=x+side*(reach-r)*extension;
      this.avatar.arm(this.front,x-side*5,y-12,x+side*reach*.35*extension,y-(upper?24:21),hx,handY,side,r,true,opacity);
      // The second chakra hand winds back while the leading hand strikes.
      this.avatar.arm(this.back,x-side*5,y-13,x-side*17,y-25,x-side*10,y-21,side,3,true,opacity*.45);
      this.strokes(hx,handY,side,reach,0xffe89b,opacity);
      return true;
    }
    if(f.hero==='naruto'&&lv>0){
      const hx=x+side*(reach-2)*extension,hy=y-(finisher?10:14);
      const dark=lv===3?0x361524:0x721529,red=lv===3?0x952a43:0xe03740;
      this.front.lineStyle(5,dark,opacity*.9).strokePoints([{x:x-side*3,y:y-10},{x:x+side*5,y:y-19},{x:hx,y:hy}],false);
      this.front.lineStyle(3,red,opacity*.85).strokePoints([{x:x-side*3,y:y-10},{x:x+side*5,y:y-19},{x:hx,y:hy}],false);
      for(let i=-1;i<=1;i++)this.front.lineStyle(1,lv===3?0xe9d5b4:0xffb0a1,opacity)
        .lineBetween(hx-side*2,hy+i*2,hx+side*2,hy+i*2-1);
      this.strokes(hx,hy,side,reach,red,opacity);
      return true;
    }
    if(f.hero==='goku'&&lv>0){
      // Ki-coated blows with staggered arm afterimages: visual echoes never deal extra damage.
      const c=lv===4?0x6fd9ff:0xffdc67,hx=x+side*(reach-2)*extension;
      for(let i=2;i>=0;i--){
        const yy=handY+i*2,xx=hx-side*i*4,alpha=opacity*(i===0?.85:.2);
        this.front.lineStyle(i===0?3:2,c,alpha).lineBetween(x+side*3,y-15,xx,yy);
        this.front.fillStyle(c,alpha).fillRect(Math.round(xx)-2,Math.round(yy)-2,4,4);
      }
      this.front.lineStyle(1,0xf4fbff,opacity).lineBetween(x+side*4,y-16,hx,handY-1);
      this.strokes(hx,handY,side,reach,c,opacity);
      if(lv>=2)for(let i=0;i<3;i++){
        const xx=x+side*(6+i*6)*extension,yy=y-16+Math.sin(time*48+i)*3;
        this.front.lineStyle(1,c,opacity*.65).strokePoints([{x:xx,y:yy},{x:xx+side*3,y:yy-3},{x:xx+side*5,y:yy+1}],false);
      }
      return true;
    }
    return false;
  }

  private strokes(x:number,y:number,d:number,reach:number,color:number,alpha:number):void{
    for(let i=-1;i<=1;i++)this.front.lineStyle(1,color,alpha*.35).lineBetween(x-d*Math.min(17,reach*.6),y+i*5,x-d*3,y+i*5);
  }
}

/** Black tongues cling to the actual victim; this is also used by the art-study target. */
export function drawBlackFlames(g:G,x:number,y:number,w:number,h:number,time:number,alpha=1):void{
  for(let i=0;i<9;i++){
    const xx=x+(i-4)*w*.16,base=y-(i%3)*h*.2;
    const len=8+(Math.sin(time*17+i*2.1)+1)*5,bend=Math.sin(time*11+i)*3;
    const p=[{x:xx-2,y:base},{x:xx-3,y:base-len*.4},{x:xx+bend-1,y:base-len},
      {x:xx+bend+2,y:base-len*.5},{x:xx+3,y:base-2}];
    g.fillStyle(0x171320,alpha*.97).fillPoints(p,true);
    g.lineStyle(1,0x80529e,alpha*.7).strokePoints(p,false);
    g.fillStyle(0x39213f,alpha).fillTriangle(xx-1,base,xx+bend,base-len*.65,xx+1,base-2);
  }
}
