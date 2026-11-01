import { Raster, toRuns, type Baked, type Pt } from './pixelRaster';
import { avatarAim } from '../sim/data/heroes';

export interface AimedSpirit { baked: Baked; pad: number }
const cache=new WeakMap<Baked,Map<string,AimedSpirit>>();

/** Rigid pixel-grid body tilt around the feet, without texture filtering or stretching. */
export function aimSpirit(sprite:Baked,kind:'susanoo'|'kurama',ax:number,feet:number,_muzzleX:number,_muzzleY:number,angle:number):AimedSpirit{
  const step=Math.round(avatarAim(angle)*64);
  if(step===0)return {baked:sprite,pad:0};
  const key=kind+step;
  let poses=cache.get(sprite);if(!poses){poses=new Map();cache.set(sprite,poses);}
  const old=poses.get(key);if(old)return old;
  const a=step/64,pad=Math.max(sprite.w,sprite.h),w=sprite.w+pad*2,h=sprite.h+pad*2;
  const r=new Raster(w,h),materials:{c:number;a:number}[]=[];
  const ids=new Map<string,number>();
  const point=(x:number,y:number):Pt=>{
    const c=Math.cos(a),s=Math.sin(a),dx=x-ax-.5,dy=y-feet-.5;
    return [pad+ax+.5+dx*c-dy*s,pad+feet+.5+dx*s+dy*c];
  };
  for(const run of sprite.runs){
    const k=run.c+':'+(run.a??1);let id=ids.get(k);
    if(id===undefined){materials.push({c:run.c,a:run.a??1});id=materials.length;ids.set(k,id);}
    // One quad per pixel keeps bending continuous across neighbouring runs.
    for(let x=run.x;x<run.x+run.w;x++)r.poly([point(x,run.y),point(x+1,run.y),point(x+1,run.y+1),point(x,run.y+1)],id);
  }
  const colors=new Int32Array(w*h).fill(-1),alphas=new Float32Array(w*h);
  for(let i=0;i<r.m.length;i++)if(r.m[i]){const m=materials[r.m[i]-1];colors[i]=m.c;alphas[i]=m.a;}
  const result={baked:toRuns(colors,w,h,alphas),pad};
  if(poses.size>=4)poses.delete(poses.keys().next().value!);
  poses.set(key,result);return result;
}
