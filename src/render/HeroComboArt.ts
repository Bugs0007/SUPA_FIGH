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
  constructor(back:G,private front:G,private luffy:LuffyAbilityArt){this.avatar=new AvatarArt(back,front);}

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
      // Susanoo throws the punch: a spectral arm from above the fighter's shoulder, in the same pixels as everything else.
      if(opacity>.02){
        const hx=x+side*(reach-3)*extension,hy=handY-3;
        this.avatar.arm(this.front,{kind:'susanoo',s:[x-side*4,y-23],e:this.elbow(x-side*4,y-23,hx,hy,upper?-9:-5),h:[hx,hy],d:side,thick:lv===4?7:5},opacity);
        this.streaks(hx,hy,side,reach,0xd8ccff,opacity);
      }
      return true;
    }
    if(f.hero==='naruto'&&lv===4){
      // Kurama's chakra: a gold arm with a clawed fist, and the other arm drawing back behind the fighter.
      const hx=x+side*(reach-3)*extension,hy=handY-1;
      this.avatar.arm(this.front,{kind:'kurama',s:[x-side*4,y-21],e:this.elbow(x-side*4,y-21,hx,hy,upper?-8:-4),h:[hx,hy],d:side,thick:5},opacity);
      this.streaks(hx,hy,side,reach,0xffe89b,opacity);
      return true;
    }
    if(f.hero==='naruto'&&lv>0){
      // The red chakra cloaks grow a smaller clawed arm.
      const hx=x+side*(reach-3)*extension,hy=handY;
      this.avatar.arm(this.front,{kind:'claw',s:[x-side*3,y-17],e:this.elbow(x-side*3,y-17,hx,hy,upper?-6:-3),h:[hx,hy],d:side,thick:lv===1?3:4},opacity);
      this.streaks(hx,hy,side,reach,lv===3?0xd8483f:0xff6a62,opacity);
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

  /** The elbow of a punching arm: halfway along, pushed up (negative) or down so the arm bends instead of being a ruler. */
  private elbow(sx:number,sy:number,hx:number,hy:number,bend:number):[number,number]{
    return [Math.round((sx+hx)/2),Math.round((sy+hy)/2+bend)];
  }

  /** Whoosh marks behind the fist: a few dashes on whole pixels. */
  private streaks(x:number,y:number,d:number,reach:number,color:number,alpha:number):void{
    const len=Math.min(15,Math.round(reach*.5));
    for(const [dy,l,gap] of [[-4,len*.7,2],[0,len,3],[4,len*.6,1]] as const){
      const x0=Math.round(x-d*(gap+8)),w=Math.max(2,Math.round(l));
      this.front.fillStyle(color,alpha*.7).fillRect(d>0?x0-w:x0,Math.round(y+dy),w,1);
    }
  }

  private strokes(x:number,y:number,d:number,reach:number,color:number,alpha:number):void{
    for(let i=-1;i<=1;i++)this.front.lineStyle(1,color,alpha*.35).lineBetween(x-d*Math.min(17,reach*.6),y+i*5,x-d*3,y+i*5);
  }
}

/** Amaterasu's colours: violet rim, black body, dark plum heart */
const BLACK_FLAME={rim:0x80529e,body:0x171320,heart:0x39213f};

/**
 * Black tongues cling to the actual victim; this is also used by the art-study target. Pixel flames: each tongue is a
 * stack of whole-pixel rows that narrows and leans as it rises, with a one-pixel violet rim and a plum heart.
 */
export function drawBlackFlames(g:G,x:number,y:number,w:number,h:number,time:number,alpha=1):void{
  const step=Math.floor(time*14);
  // pass 0 paints every tongue's rim (the whole silhouette one pixel wider), pass 1 the black bodies over it, so the
  // tongues merge into one flame with a single violet edge
  for(const pass of [0,1]){
    for(let i=0;i<9;i++){
      const xx=Math.round(x+(i-4)*w*.16),base=Math.round(y-(i%3)*h*.2);
      const len=7+((i*5+step)%4)*3,lean=((i+step)%3)-1,hw=2+(i%2);
      for(let j=0;j<len;j++){
        const t=j/len,half=Math.max(0,Math.round(hw*(1-t*t))),cx=xx+Math.round(lean*t*3),yy=base-j;
        if(pass===0)g.fillStyle(BLACK_FLAME.rim,alpha).fillRect(cx-half-1,yy-(j===len-1?1:0),half*2+3,j===len-1?2:1);
        else{
          g.fillStyle(BLACK_FLAME.body,alpha).fillRect(cx-half,yy,half*2+1,1);
          if(t<.5&&half>1)g.fillStyle(BLACK_FLAME.heart,alpha).fillRect(cx,yy,1,1);
        }
      }
    }
  }
}
