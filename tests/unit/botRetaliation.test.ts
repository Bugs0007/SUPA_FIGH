import {expect,it} from 'vitest';
import {BotController} from '../../src/ai/bot';
import {applyHit} from '../../src/sim/combat';
import {summonClones} from '../../src/sim/hero';
import {World} from '../../src/sim/world';
import {FLAT,spec,intent} from './helpers';
it.each([1,2])('prioritizes recent aggressor %i over an equally close bystander',attacker=>{
 const w=new World(FLAT,[spec('Bot'),spec('Left'),spec('Right')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},42);
 w.fighters.forEach((f,i)=>{f.x=f.px=[140,90,190][i];f.y=f.py=144;f.vx=f.vy=f.invuln=0;});
 const f=w.fighters[0],bot=new BotController(()=>w,0,{difficulty:'hard',seed:5});
 applyHit(w,f,{damage:1,kbX:0,kbY:0,attacker,weapon:'fists',kind:'melee'});
 for(let t=0;t<25;t++){w.step([bot.poll(),intent(),intent()]);w.events.length=0;}
 expect((f.x-140)*(attacker===1?-1:1)).toBeGreaterThan(5);
});

it.each([false,true])('Fireball close-range cluster selection (clones=%s)',clones=>{
 const w=new World(FLAT,[{...spec('S'),hero:'sasuke'},clones?{...spec('N'),hero:'naruto'}:spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},42);
 w.fighters.slice(0,2).forEach((f,i)=>{f.x=f.px=i?(clones?190:85):70;f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.facing=1;});
 if(clones){summonClones(w,w.fighters[1]);w.fighters.filter(c=>c.master===1&&c.alive).forEach((c,i)=>{c.x=c.px=85+i*10;c.y=c.py=144;c.vx=c.vy=c.invuln=0;});}
 const f=w.fighters[0];f.baseCd=999;const bot=new BotController(()=>w,0,{difficulty:'hard',seed:5});
 let used=false;
 for(let t=0;t<120&&!used;t++){
  const output={...bot.poll(),attack:false,interact:false,moveX:0,moveY:0,jump:false};
  w.step(w.fighters.map((_,i)=>i===0?output:intent()));
  used=f.specialKind==='fireball';w.events.length=0;
 }
 expect(used).toBe(clones);
});
