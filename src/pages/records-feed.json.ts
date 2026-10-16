import {problems,boardRecords} from '../lib/data';
import {problemLinks,problemDisplayName} from '../lib/navigation';
import {feedBoard,otherFeedBoard} from '../lib/records-feed';
import otherBounds from '../lib/other-bounds.json';
// The two landing-page tables: the Big O problems, then the Other bounds rows.
export function GET(){
 const boards=[
  ...problemLinks.map(([slug])=>problems.find(p=>p.slug===slug)!).map(p=>({...feedBoard(p,boardRecords(p),problemDisplayName(p.slug)),table:'big-o' as const})),
  ...otherBounds.families.map(otherFeedBoard),
 ];
 return new Response(JSON.stringify({schema_version:1,boards}),{headers:{'Content-Type':'application/json'}});
}
