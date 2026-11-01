/** Last place earns zero; every position above it earns one more point. Teams count as one entrant. */
export const brawlPoints = (entrants:number,place:number):number => Math.max(0,entrants-place);
export const brawlPointScale = (entrants:number):number[] => Array.from({length:entrants},(_,i)=>brawlPoints(entrants,i+1));
export interface BrawlPlacement { team: number; place: number; points: number }

/** Same-tick eliminations share the lower occupied place, never an arbitrary fighter-id tiebreak. */
export function rankBrawl(teams: readonly number[], eliminated: ReadonlyMap<number, number>): BrawlPlacement[] {
  const ordered = teams.map(team => ({ team, tick: eliminated.get(team) ?? Infinity })).sort((a,b)=>b.tick-a.tick || a.team-b.team);
  const results: BrawlPlacement[] = [];
  for(let i=0;i<ordered.length;){
    let end=i+1;
    while(end<ordered.length&&ordered[end].tick===ordered[i].tick)end++;
    for(let j=i;j<end;j++)results.push({team:ordered[j].team,place:end,points:brawlPoints(teams.length,end)});
    i=end;
  }
  return results;
}
