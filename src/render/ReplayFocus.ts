import { FORM_COMBO } from '../sim/data/heroes';
import type { Fighter } from '../sim/fighter';
import { beamOrigin, rasenganPoint, stretchFist } from '../sim/hero';
import { ReplayPlayer, type RoundRecording } from '../sim/replay';
import type { World } from '../sim/world';

interface Point { tick:number; x:number; y:number }
interface Track { source:number; points:Point[]; activeAt:number; victim:boolean; radius:number }
const HISTORY=240;

/** Reconstruct only the finisher's recent tracks; no camera history or extra state in the simulation. */
export class ReplayFocus {
  private probe:ReplayPlayer;
  private actors=new Map<number,Point[]>();
  private moving=new Map<string,Track>();
  private path:Point[]=[];
  private burningTarget:Point[]=[];
  private source:number;
  private ready=false;
  private impact:{x:number;y:number};
  readonly contactTick:number;
  startTick:number;
  subject:'attack'|'victim'='attack';

  constructor(private rec:RoundRecording){
    this.probe=new ReplayPlayer(rec);
    this.source=rec.finalKillAttacker;
    this.contactTick=rec.finalHitTick>0?rec.finalHitTick:rec.finalKillTick;
    this.startTick=Math.max(0,rec.finalKillTick-1-150);
    this.impact={x:rec.finalKillX,y:rec.finalKillY};
  }

  prepare(budget=1500):boolean{
    if(this.ready)return true;
    if(this.source<0){this.ready=true;return true;}
    const first=Math.max(0,this.contactTick-HISTORY);
    const before=this.probe.t;
    if(!this.probe.skipTo(first,budget))return false;
    budget-=this.probe.t-before;
    while(this.probe.t<this.contactTick&&!this.probe.done&&budget-->0){
      this.probe.step();
      this.observe(this.probe.world);
      this.probe.world.events.length=0;
    }
    if(this.probe.t<this.contactTick&&!this.probe.done)return false;
    this.ready=true;
    return true;
  }

  private owns(w:World,id:number):boolean{return id===this.rec.finalKillAttacker||w.fighters[id]?.master===this.rec.finalKillAttacker;}

  private observe(w:World):void{
    const target=w.fighters[this.rec.finalKillVictim];
    if(target){this.burningTarget.push({tick:w.tick,x:target.x,y:target.y-target.h/2});if(this.burningTarget.length>HISTORY+1)this.burningTarget.shift();}
    for(const f of w.fighters)if(this.owns(w,f.id)&&(f.alive||this.actors.has(f.id))){
      const points=this.actors.get(f.id)??[];
      points.push({tick:w.tick,...attackPoint(f)});
      if(points.length>HISTORY+1)points.shift();
      this.actors.set(f.id,points);
    }
    const moving=(key:string,source:number,x:number,y:number,px:number,py:number,active:boolean,victim=false,radius=0)=>{
      let track=this.moving.get(key);
      if(!active&&(!track||track.activeAt<w.tick-1))return;
      if(!track){track={source,points:[{tick:w.tick-1,x:px,y:py}],activeAt:w.tick,victim:false,radius};this.moving.set(key,track);}
      track.points.push({tick:w.tick,x,y});track.victim ||= victim;
      if(active)track.activeAt=w.tick;
      if(track.points.length>HISTORY+1)track.points.shift();
    };
    w.bullets.forEach((b,i)=>{
      if(this.owns(w,b.owner)&&b.weapon===this.rec.finalKillWeapon)moving(`b:${i}:${b.serial}`,b.owner,b.x,b.y,b.px,b.py,b.active,b.hitIds.includes(this.rec.finalKillVictim),b.explosion?.radius??b.size);
    });
    for(const it of w.items)if(this.owns(w,it.thrownBy)&&it.weaponId===this.rec.finalKillWeapon&&(it.live||it.thrownDmg>0))moving(`i:${it.id}`,it.thrownBy,it.x,it.y-it.h/2,it.px,it.py-it.h/2,it.active);
    for(const p of w.props)if(this.owns(w,p.thrownBy>=0?p.thrownBy:p.lastBy)&&p.type===this.rec.finalKillWeapon)moving(`p:${p.id}`,p.thrownBy>=0?p.thrownBy:p.lastBy,p.x,p.y-p.h/2,p.px,p.py-p.h/2,p.active);
    for(const [key,track] of this.moving)if(track.points[track.points.length-1].tick<w.tick-HISTORY)this.moving.delete(key);
    if(w.tick!==this.contactTick)return;
    const hit=[...w.events].reverse().find(e=>e.t==='hit'&&!e.corpse&&e.victim===this.rec.finalKillVictim&&e.attacker===this.rec.finalKillAttacker);
    const victim=w.fighters[this.rec.finalKillVictim];
    this.impact=hit?.t==='hit'?{x:hit.x,y:hit.y}:victim?{x:victim.x,y:victim.y-victim.h/2}:this.impact;
    let best:Track|undefined,score=Infinity;
    for(const track of this.moving.values()){
      const end=track.points[track.points.length-1];
      if(end.tick<w.tick-1)continue;
      const d=Math.hypot(end.x-this.impact.x,end.y-this.impact.y);
      if(d>Math.max(80,track.radius+35))continue;
      const value=d-(track.victim?1000:0);
      if(value<score){score=value;best=track;}
    }
    if(hit?.t==='hit'&&hit.kind==='fire'){
      // A persistent flame is the finishing attack; it stays on the burning target, not its distant caster.
      this.path=this.burningTarget;
      this.startTick=Math.max(0,Math.min(this.startTick,this.contactTick-1-60));
    }else if(best){
      this.source=best.source;
      const first=best.points[0].tick;
      this.path=[...(this.actors.get(this.source)??[]).filter(p=>p.tick<first),...best.points];
      this.startTick=Math.max(0,Math.min(this.startTick,first-1-30,this.contactTick-1-60));
    }else{
      let distance=Infinity;
      for(const [source,points] of this.actors){
        const actor=w.fighters[source];
        if(!actor.alive&&actor.stateTime>.04)continue;
        const p=points[points.length-1],d=Math.hypot(p.x-this.impact.x,p.y-this.impact.y);
        if(d<distance){distance=d;this.source=source;this.path=points;}
      }
      this.startTick=Math.max(0,Math.min(this.startTick,this.contactTick-1-60));
    }
    // Contact itself is part of the attack, even if the projectile's pool slot disappeared at impact.
    if(this.path.length)this.path[this.path.length-1]={tick:this.contactTick,...this.impact};
  }

  target(w:World,alpha:number):{x:number;y:number;follow:true}|null{
    const victim=w.fighters[this.rec.finalKillVictim];
    if(victim&&(this.source<0||this.rec.finalKillEnvironmental&&w.tick>=this.contactTick)){
      this.subject='victim';
      return {x:victim.px+(victim.x-victim.px)*alpha,y:victim.py+(victim.y-victim.py)*alpha,follow:true};
    }
    this.subject='attack';
    if(w.tick>=this.contactTick)return {...this.impact,follow:true};
    const time=w.tick-1+alpha;
    if(this.path.length&&time>=this.path[0].tick){
      let lo=0,hi=this.path.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(this.path[mid].tick<=time)lo=mid;else hi=mid-1;}
      const a=this.path[lo],b=this.path[Math.min(lo+1,this.path.length-1)];
      const t=Math.max(0,Math.min(1,(time-a.tick)/Math.max(1,b.tick-a.tick)));
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,follow:true};
    }
    let attacker=w.fighters[this.source];
    if(attacker&&!attacker.alive&&attacker.master>=0)attacker=w.fighters[attacker.master];
    return attacker?{...attackPoint(attacker),follow:true}:null;
  }
}

function attackPoint(f:Fighter):{x:number;y:number}{
  if(f.state==='special'){
    if(f.specialKind==='rasengan')return rasenganPoint(f);
    if(f.specialKind==='formCombo'&&f.hero==='sasuke')return {x:f.anchorX,y:Math.min(1,f.stateTime/FORM_COMBO.windup)*(f.anchorY-11)};
    if(f.specialKind==='beam'||f.specialKind==='superBeam'){
      const o=beamOrigin(f);return {x:o.x+f.facing*Math.cos(f.stretchAngle)*f.stretchLen,y:o.y+Math.sin(f.stretchAngle)*f.stretchLen};
    }
    if(f.stretchLen>0){const p=stretchFist(f,f.stretchAngle,f.stretchLen);return {x:p.x1,y:p.y1};}
  }
  return {x:f.x+f.facing*8,y:f.y-f.h/2};
}
