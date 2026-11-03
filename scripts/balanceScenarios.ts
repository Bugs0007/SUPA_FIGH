/** A complete map × difficulty × fall-death block, repeated with fresh seeds. */
export function balanceScenario(trial:number,mapCount:number):{mapIndex:number;difficulty:'hard'|'expert';fallDeath:boolean}{
 const index=trial*(2*mapCount+1);
 const block=Math.floor(index/mapCount);
 return {mapIndex:index%mapCount,difficulty:Math.floor(block/2)%2===0?'hard':'expert',fallDeath:block%2===0};
}
