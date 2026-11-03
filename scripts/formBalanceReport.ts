// Usage: npx vite-node scripts/formBalanceReport.ts <survey.json> <report.md>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
interface Cell {
  form:number; group:string[]; rounds:number; wins:Record<string,number>; draws:number; timeouts:number;
  points:Record<string,number>; blocks?:{wins:Record<string,number>;draws:number}[];
}
interface Survey { studyRounds?:number; cells:Cell[]; seed:number; simulationSha256?:string; scenarioRules?:string; provenance?:{rule:string;sourceRuns:{label:string;sha256:string;cells:number;usedCells:number}[]}; }
const [source,out]=process.argv.slice(2);
if(!source||!out)throw new Error('Pass survey JSON and report markdown paths');
const data=JSON.parse(readFileSync(source,'utf8')) as Survey;
const cells=data.cells.sort((a,b)=>a.form-b.form||a.group.length-b.group.length||a.group.join('/').localeCompare(b.group.join('/')));
const percent=(v:number)=>(v*100).toFixed(1)+'%';
const share=(c:Cell,h:string)=>c.wins[h]/(c.rounds-c.draws);
function interval(c:Cell,h:string):string {
  const n=c.rounds-c.draws,p=n?c.wins[h]/n:0,k=c.blocks?.length??0;
  if(k<2)return 'not recorded';
  const residual=c.blocks!.reduce((s,b)=>s+(b.wins[h]-p*Object.values(b.wins).reduce((x,y)=>x+y,0))**2,0);
  const e=1.96*Math.sqrt(k/(k-1)*residual)/n;
  return percent(Math.max(0,p-e))+'–'+percent(Math.min(1,p+e));
}
const bad=cells.filter(c=>c.group.some(h=>Math.abs(share(c,h)-1/c.group.length)>.05));
const lines=[
  '# Same-starting-form character balance survey','',
  `${cells.length}/55 combinations completed; ${cells.reduce((s,c)=>s+c.rounds,0).toLocaleString()} rounds. Seed ${data.seed}.`,
  `Simulation bundle SHA-256: ${data.simulationSha256??'not recorded'}.`,'',
  ...(data.studyRounds ? [`${data.studyRounds.toLocaleString()} rounds were executed across the full and targeted passes; the table uses only the 55,000 final-config samples rather than pooling different variants.`,''] : []),
  data.scenarioRules??'Exploratory scouting schedule; see source revision.','',
  ...(data.provenance ? [data.provenance.rule,...data.provenance.sourceRuns.map(r=>`${r.label}: ${r.cells} completed cohorts, ${r.usedCells} used here; bundle ${r.sha256}.`),''] : []),
  'Every character starts each round at the same level (0 = base; 1–4 = transformations). Forms can break naturally. Draws include simultaneous finishes and capped unresolved rounds; they are never assigned an artificial winner. Win shares below exclude draws. Equal-share targets are 50%, 33.3%, and 25%.',
  `The practical screening band is ±5 percentage points; ${bad.length} combinations lie outside it. Passing this screen does not prove equal chances for human players. Confidence intervals are approximate 95% intervals clustered by seed/slot-swap block; individual map slices have much less evidence than the combined results.`,
  '', '## Overall duel shares by starting form','',
  '| Form | Naruto | Sasuke | Luffy | Goku |','|---|---:|---:|---:|---:|',
];
for(let form=0;form<5;form++){
  const row=['naruto','sasuke','luffy','goku'].map(h=>{
    const cs=cells.filter(c=>c.form===form&&c.group.length===2&&c.group.includes(h));
    return percent(cs.reduce((s,c)=>s+c.wins[h],0)/cs.reduce((s,c)=>s+c.rounds-c.draws,0));
  });
  lines.push(`| ${form} | ${row.join(' | ')} |`);
}
lines.push('','## Four-way results','',
  '| Form | Character | Decisive win share | Mean placement points |','|---|---|---:|---:|');
for(const c of cells.filter(c=>c.group.length===4))for(const h of c.group){
  lines.push(`| ${c.form} | ${h} | ${percent(share(c,h))} | ${((c.points?.[h]??0)/c.rounds).toFixed(2)} |`);
}
lines.push('','## Every combination','',
  '| Form | Fighters: decisive win share (95% interval) | Draws / rounds | Timeouts | Screen |',
  '|---|---|---:|---:|---|');
for(const c of cells){
  const values=c.group.map(h=>h+' '+percent(share(c,h))+' ('+interval(c,h)+')').join('; ');
  lines.push(`| ${c.form} | ${values} | ${c.draws}/${c.rounds} | ${c.timeouts} | ${bad.includes(c)?'REVIEW':'within band'} |`);
}
lines.push('','## Reproduce','',
  'See [study methodology](README.md). Explicit runner options:', '', '```powershell',
  `node tests/e2e/screenshots/balance/runner.mjs --rounds 1000 --seed ${data.seed} --out tests/e2e/screenshots/balance/recheck.json`,
  'npx vite-node scripts/formBalanceReport.ts <survey.json> <report.md>','```','',
  'Checkpoints contain only completed combinations. An incomplete matrix is not a finished validation.');
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,lines.join('\n')+'\n');
console.log(`${cells.length} combinations; ${bad.length} outside band; report ${out}`);
