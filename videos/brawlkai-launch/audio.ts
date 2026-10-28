// New 45-second edit of the project's original chiptune, with frame-aligned game SFX.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMusic, SR, makeBuf, add, hits, noise, tone } from '../../scripts/trailer/music';
import { renderSfx } from '../../src/audio/sfxr';
import { SOUNDS } from '../../src/audio/sounds';
import { cut, cards, DURATION } from './campaign.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const music = renderMusic();
const mix = makeBuf(DURATION);
const bed = makeBuf(DURATION);
// Repeat complete musical phrases to build toward the supers, then resolve on the end card.
const phrases = [[0,3.2],[3.2,9.6],[9.6,14.4],[9.6,17.6],[14.4,22.4],[17.6,20],[14.4,22.4],[22.4,26.6]];
let offset = 0;
for (const [a,b] of phrases) {
  const n = Math.round((b-a)*SR), start = Math.round(a*SR), dst = Math.round(offset*SR);
  for (let i=0;i<n && dst+i<bed.l.length;i++) {
    // Tiny edge fades avoid clicks without weakening the beat grid.
    const edge = Math.min(1,i/(SR*.004),(n-1-i)/(SR*.004));
    bed.l[dst+i] = (music.l[start+i] ?? 0)*edge;
    bed.r[dst+i] = (music.r[start+i] ?? 0)*edge;
  }
  offset += b-a;
}
const effects = makeBuf(DURATION);
const cache = new Map<string, Float32Array>();
let sounds = 0, seed = 42;
const random = () => ((seed = (seed*1664525+1013904223) >>> 0)/4294967296)*2-1;
function play(id: string, at: number, volume = .55, pitch = 1, pan = 0) {
  if (!SOUNDS[id]) return;
  let base = cache.get(id);
  if (!base) { base = renderSfx(SOUNDS[id], SR); cache.set(id,base); }
  const rate = Math.max(.3,pitch*(1+random()*.035));
  const b = new Float32Array(Math.ceil(base.length/rate));
  for (let i=0;i<b.length;i++) { const p=i*rate, k=Math.floor(p); b[i]=(base[k]??0)+((base[k+1]??0)-(base[k]??0))*(p-k); }
  add(effects,at,b,volume,pan);
  sounds++;
}
offset=0;
const skip = new Set(['roundStart','roundEnd','uiOk','uiBack','uiMove']);
for (const s of cut) {
  const log = JSON.parse(fs.readFileSync(path.join(root,'work',s.id+'.json'),'utf8'));
  const last = new Map<string,number>();
  if (log.audio.length) for (const e of log.audio) {
    if (skip.has(e.id) || e.vf >= s.frames) continue;
    const at=offset+e.vf/60;
    if (at-(last.get(e.id)??-10)<.035) continue;
    last.set(e.id,at);
    play(e.id,at,.55*(e.o.volume??1),(e.o.pitch??1)*(e.tp??1),e.o.pan??0);
  } else {
    // Free-running arena shots don't intercept AudioManager. Reconstruct their real hit/explosion cues.
    for (const e of log.events) {
      const at=offset+e.vf/60;
      let id = e.what === 'explosion' ? 'explosion' : /KILL/.test(e.what) ? 'death' : /hit/.test(e.what) ? e.what.split('/').pop() : null;
      if (id && !SOUNDS[id]) id = id==='uzi' ? 'smg' : 'punch';
      if (!id || at-(last.get(id)??-10)<.07) continue;
      last.set(id,at); play(id,at,.5);
    }
  }
  if(offset>0) add(effects,offset-.09,noise(.18,{a:.08,decay:.12,lp:.45,level:1}),.14);
  offset+=s.seconds;
}
for(const c of cards) add(effects,c.at,hits.kick(),c.style?.includes('brand') || c.style==='end' ? .55 : .2);
for(const at of [0,22.4,28.8,40.8]) {
  add(effects,at,hits.crash(),.32);
  add(effects,at,tone(62,.65,{wave:'sine',a:.002,d:.25,s:0,r:.25,slide:-7}),.6);
}
// Duck the bed under loud impacts, keep the effects audible, and fade the final chord.
let envelope=0,peak=0;
for(let i=0;i<mix.l.length;i++) {
  const level=Math.max(Math.abs(effects.l[i]),Math.abs(effects.r[i]));
  envelope += (level-envelope)*(level>envelope?.012:.00035);
  const duck=1/(1+envelope*1.5), fade=Math.min(1,(DURATION-i/SR)/.8);
  mix.l[i]=Math.tanh((bed.l[i]*.9*duck+effects.l[i])*.95)*fade;
  mix.r[i]=Math.tanh((bed.r[i]*.9*duck+effects.r[i])*.95)*fade;
  peak=Math.max(peak,Math.abs(mix.l[i]),Math.abs(mix.r[i]));
}
const gain=.84/(peak||1), pcm=Buffer.alloc(mix.l.length*4), head=Buffer.alloc(44);
for(let i=0;i<mix.l.length;i++){pcm.writeInt16LE(Math.round(mix.l[i]*gain*32767),i*4);pcm.writeInt16LE(Math.round(mix.r[i]*gain*32767),i*4+2);}
head.write('RIFF');head.writeUInt32LE(36+pcm.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(2,22);head.writeUInt32LE(SR,24);head.writeUInt32LE(SR*4,28);head.writeUInt16LE(4,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(pcm.length,40);
fs.writeFileSync(path.join(root,'assets','soundtrack.wav'),Buffer.concat([head,pcm]));
fs.writeFileSync(path.join(root,'audio_meta.json'),JSON.stringify({duration:DURATION,source:'local-original-synthesis',bgm:{path:'assets/soundtrack.wav'},synchronizedGameSounds:sounds,voiceover:null},null,2));
console.log(`45-second soundtrack: ${sounds} synchronized game sounds, peak ${(20*Math.log10(.84)).toFixed(1)} dBFS`);
