import {expect,it} from 'vitest';
import {HEROES} from '../../src/sim/data/heroes';
import {gatlingHit,summonClones} from '../../src/sim/hero';
import {World} from '../../src/sim/world';
import {FLAT,spec} from './helpers';
function setup(){
 const w=new World(FLAT,[{...spec('L'),hero:'luffy'},{...spec('N'),hero:'naruto'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},42);
 w.fighters.slice(0,3).forEach((f,i)=>{f.x=f.px=70+i*30;f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.facing=1;});return w;
}
it('Gatling shares damage across separate opposing teams',()=>{
 const w=setup(),[f,n,e]=w.fighters,g=HEROES.luffy.second.gatling!;
 gatlingHit(w,f,g,false);
 expect(100-n.hp).toBeCloseTo(g.damage*g.crowdDamageByLevel![0]);
 expect(100-e.hp).toBeCloseTo(g.damage*g.crowdDamageByLevel![0]);
});
it('one opponent and its clones retain full single-opponent damage',()=>{
 const w=setup(),[f,n,e]=w.fighters,g=HEROES.luffy.second.gatling!;e.x=400;
 summonClones(w,n);const clones=w.fighters.filter(c=>c.master===n.id&&c.alive);
 clones.forEach((c,i)=>{c.x=110+i*10;c.y=144;c.invuln=0;});
 gatlingHit(w,f,g,false);
 expect(100-n.hp).toBeCloseTo(g.damage);
 for(const c of clones)expect(c.maxHp-c.hp).toBeCloseTo(g.damage);
});
it('teammates of an opponent count as one opposing team',()=>{
 const w=setup(),[f,n,e]=w.fighters,g=HEROES.luffy.second.gatling!;n.team=e.team=2;
 gatlingHit(w,f,g,false);
 expect(100-n.hp).toBeCloseTo(g.damage);expect(100-e.hp).toBeCloseTo(g.damage);
});
