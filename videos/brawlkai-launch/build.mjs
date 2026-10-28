import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cut,cards,DURATION } from './campaign.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(root,'assets'),{recursive:true});
fs.mkdirSync(path.join(root,'compositions','frames'),{recursive:true});
fs.copyFileSync('C:/Windows/Fonts/arialbd.ttf',path.join(root,'assets','display.ttf'));
fs.copyFileSync('C:/Windows/Fonts/ARIALNB.TTF',path.join(root,'assets','label.ttf'));
const gsap=await fetch('https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js');
if(!gsap.ok)throw new Error('Could not freeze GSAP');
fs.writeFileSync(path.join(root,'assets','gsap.min.js'),await gsap.text());
// Reuse the actual game glyphs to draw the logo as resolution-independent pixel artwork.
const font=fs.readFileSync(path.join(root,'../../src/art/font.ts'),'utf8');
const obj=font.match(/const BIG[^=]*= (\{[\s\S]*?\n\});/)[1];
const glyphs=Function('return ('+obj+')')();
let x=0,rects=[];
for(const c of 'BRAWLKAI'){
  const rows=glyphs[c].split('|');
  for(let y=0;y<rows.length;y++)for(let k=0;k<rows[y].length;k++)if(rows[y][k]==='#')rects.push(`<rect x="${x+k}" y="${y}" width="1" height="1"/>`);
  x+=Math.max(...rows.map(r=>r.length))+1;
}
fs.writeFileSync(path.join(root,'assets','logo.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${x+1} 10"><g fill="#0b0912" stroke="#0b0912" stroke-width=".48" transform="translate(.35 .55)">${rects.join('')}</g><g fill="#ffd84a">${rects.join('')}</g></svg>`);
const styles=`@font-face{font-family:Display;src:url('assets/display.ttf')}@font-face{font-family:Label;src:url('assets/label.ttf')}
*{box-sizing:border-box}html,body{margin:0;overflow:hidden;background:#0b0912}#root{width:100%;height:100%;background:#0b0912}.clip{position:absolute;inset:0}.footage{width:100%;height:100%;object-fit:cover}.card-content{position:absolute;left:78px;bottom:70px;max-width:1600px;background:#0b0912;border-left:12px solid var(--hue,#ffd84a);padding:20px 32px 22px;box-shadow:8px 8px 0 #000;color:#fff9e8}.eyebrow{font:700 25px/1 Label,sans-serif;letter-spacing:3px;margin-bottom:9px;color:var(--hue,#ffd84a)}.headline{font:700 62px/1.05 Display,sans-serif;letter-spacing:-1px;margin:0}.chapter .headline{font-size:70px}.chapter .eyebrow{font-size:23px;letter-spacing:2px}.brand-content{position:absolute;inset:0;color:#fff9e8;text-align:center}.logo{position:absolute;left:360px;top:102px;width:1200px;height:230px}.tagline{position:absolute;top:355px;left:160px;right:160px;font:700 35px/1.2 Label,sans-serif;letter-spacing:6px}.hero-names{position:absolute;top:710px;left:185px;right:185px;display:grid;grid-template-columns:repeat(3,1fr);font:700 25px Label,sans-serif;letter-spacing:5px}.hook-content{position:absolute;left:90px;top:110px;color:#fff9e8;font:700 78px/1.05 Display,sans-serif;letter-spacing:-2px;text-shadow:6px 6px 0 #0b0912}.hook-content .power{display:block;color:#ffd84a;font-size:94px}.end .logo{top:115px}.end .tagline{top:355px}.url{position:absolute;left:280px;right:280px;top:618px;color:#6ad0ff;font:700 52px/1 Label,sans-serif;letter-spacing:3px}.end-action{position:absolute;left:660px;right:660px;top:445px;padding:16px 18px;background:#ffd84a;color:#0b0912;font:700 27px Label,sans-serif;letter-spacing:4px;box-shadow:8px 8px 0 #000}.fade-black{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}`;
fs.writeFileSync(path.join(root,'styles.css'),styles);
const frames=[{id:'f01-intro',start:0,end:8.8,title:'Tiny fighters. Huge power.'},{id:'f02-power',start:8.8,end:22.4,title:'Power up and bring backup.'},{id:'f03-chaos',start:22.4,end:40.8,title:'Supers and arcade chaos.'},{id:'f04-play',start:40.8,end:45,title:'Play free in your browser.'}];
let offset=0;const footage=cut.map(s=>{const v={...s,at:offset};offset+=s.seconds;return v;});
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for(const frame of frames){
  let dom=[],anim=[];
  for(const s of footage.filter(s=>s.at>=frame.start-.001&&s.at<frame.end-.001))dom.push(`<video id="${frame.id}-${s.id}" class="clip footage" data-start="${(s.at-frame.start).toFixed(3)}" data-duration="${s.seconds}" data-hf-media-start-basis="local" data-track-index="0" src="assets/${s.id}.mp4" muted playsinline></video>`);
  for(const [i,c]of cards.entries()){
    if(c.at<frame.start-.001||c.at>=frame.end-.001)continue;
    const at=c.at-frame.start,id=`${frame.id}-card-${i}`,content=id+'-content';
    let body;
    if(c.style==='brand'||c.style==='end')body=`<div id="${content}" class="brand-content ${c.style==='end'?'end':''}"><img class="logo" src="assets/logo.svg" alt="Brawlkai"/><div class="tagline">${esc(c.sub)}</div>${c.style==='end'?'<div class="end-action">JUMP IN.</div><div class="url">BRAWLKAI.VERCEL.APP</div>':'<div class="hero-names"><span>NARUTO</span><span>LUFFY</span><span>GOKU</span></div>'}</div>`;
    else if(c.style==='hook')body=`<div id="${content}" class="hook-content">${esc(c.text)}<span class="power">${esc(c.sub)}</span></div>`;
    else body=`<div id="${content}" class="card-content ${c.style==='chapter'?'chapter':''}" style="--hue:${c.hue??'#ffd84a'}"><div class="eyebrow">${esc(c.sub)}</div><h2 class="headline">${esc(c.text)}</h2></div>`;
    dom.push(`<div id="${id}" class="clip" data-start="${at.toFixed(3)}" data-duration="${c.dur}" data-track-index="1">${body}</div>`);
    const from = c.style==='brand'||c.style==='end' ? '{scale:1.28,opacity:0}' : c.style==='hook' ? '{x:-110,opacity:0}' : i%2 ? '{x:-85,opacity:0}' : '{y:40,rotation:1,opacity:0}';
    anim.push(`tl.fromTo('#${content}',${from},{x:0,y:0,rotation:0,scale:1,opacity:1,duration:.24,ease:'${i%3===0?'power4.out':i%3===1?'expo.out':'circ.out'}',immediateRender:false},${at.toFixed(3)});`);
    if(c.style==='end')anim.push(`tl.fromTo('#${content} .url',{y:30,opacity:0},{y:0,opacity:1,duration:.35,ease:'power3.out',immediateRender:false},.8);`);
  }
  if(frame.id==='f04-play'){dom.push('<div id="f04-play-fade-track" class="clip" data-start="0" data-duration="4.2" data-track-index="3"><div id="f04-play-fade" class="fade-black"></div></div>');anim.push("tl.fromTo('#f04-play-fade',{opacity:0},{opacity:1,duration:.5,ease:'none',immediateRender:false},3.7);");}
  fs.writeFileSync(path.join(root,`compositions/frames/${frame.id}.html`),`<template><link rel="stylesheet" href="styles.css"/><div id="root" data-composition-id="${frame.id}" data-duration="${frame.end-frame.start}" data-width="1920" data-height="1080">${dom.join('\n')}</div><script>const tl=gsap.timeline({paused:true});${anim.join('\n')}window.__timelines['${frame.id}']=tl;</script></template>`);
}
fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=1920,height=1080"/><script src="assets/gsap.min.js"></script><link rel="stylesheet" href="styles.css"/></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="45" data-width="1920" data-height="1080">${frames.map(f=>`<div id="${f.id}" class="clip" data-composition-id="${f.id}" data-composition-src="compositions/frames/${f.id}.html" data-start="${f.start}" data-duration="${f.end-f.start}" data-track-index="0"></div>`).join('\n')}<audio id="soundtrack" src="assets/soundtrack.wav" data-start="0" data-duration="45" data-track-index="4" data-volume="1"></audio></div><script>window.__timelines.main=gsap.timeline({paused:true});</script></body></html>`);
fs.writeFileSync(path.join(root,'STORYBOARD.md'),`---\nformat: 1920x1080\nduration: 45s\nmessage: "Tiny fighters. Huge power."\narc: Impact → Heroes → Forms → Supers → Chaos → Play\naudience: anime and arcade fighting game fans\nmode: autonomous\nmusic: original chiptune, 150 BPM\n---\n\n${frames.map((f,i)=>`## Frame ${i+1} — ${f.title}\n\n- status: animated\n- src: compositions/frames/${f.id}.html\n- duration: ${(f.end-f.start).toFixed(1)}s\n- transition_in: cut\n- scene: ${f.title}\n- asset_candidates: capture/extracted/asset-descriptions.md; actual deployed gameplay clips ${footage.filter(s=>s.at>=f.start&&s.at<f.end).map(s=>'assets/'+s.id+'.mp4').join(', ')}\n- blueprint: compose\n- motion: kinetic-beat-slam; camera moves are recorded in gameplay\n\n${footage.filter(s=>s.at>=f.start&&s.at<f.end).map(s=>`Scene ${(s.at-f.start).toFixed(1)}–${(s.at+s.seconds-f.start).toFixed(1)}s: ${s.id} gameplay. Feature titles occupy the title-safe band; all combat effects are the real game.`).join('\n')}\n`).join('\n')}`);
console.log(`Built four editable compositions, 18 gameplay clips, ${DURATION}s.`);
