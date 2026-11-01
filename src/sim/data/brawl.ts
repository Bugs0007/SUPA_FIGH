/** Championship points by round placement, from first through tenth. */
export const BRAWL_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export interface BrawlPlacement { team: number; place: number; points: number }

/** Same-tick eliminations share the lower occupied place, never an arbitrary fighter-id tiebreak. */
export function rankBrawl(teams: readonly number[], eliminated: ReadonlyMap<number, number>): BrawlPlacement[] {
  const ordered = teams.map(team => ({ team, tick: eliminated.get(team) ?? Infinity })).sort((a,b)=>b.tick-a.tick || a.team-b.team);
  const results: BrawlPlacement[] = [];
  for(let i=0;i<ordered.length;){
    let end=i+1;
    while(end<ordered.length&&ordered[end].tick===ordered[i].tick)end++;
    for(let j=i;j<end;j++)results.push({team:ordered[j].team,place:end,points:BRAWL_POINTS[end-1]??0});
    i=end;
  }
  return results;
}
