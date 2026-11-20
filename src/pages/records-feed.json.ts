import {problems,boardRecords} from '../lib/data';
import {problemLinks,problemDisplayName,modelDisplayName,isPrimaryModel} from '../lib/navigation';
import {feedBoard,modelFeedBoard,otherFeedBoard} from '../lib/records-feed';
import otherBounds from '../lib/other-bounds-data';
// The two landing-page tables: the Big O problems, then the Other bounds rows.
export function GET(){
 const boards=[
  ...problemLinks.map(([slug])=>problems.find(p=>p.slug===slug)!).map(p=>({...feedBoard(p,boardRecords(p),problemDisplayName(p.slug)),table:'big-o' as const})),
  // The later models of the races (the randomized APSP board): a board each, after the Big O boards, before Other bounds.
  ...problems.filter(p=>!isPrimaryModel(p)).map(p=>({...modelFeedBoard(p,boardRecords(p),modelDisplayName(p.slug,p.modelId,false,p.title)),table:'big-o' as const})),
  ...otherBounds.families.map(otherFeedBoard),
 ];
 return new Response(JSON.stringify({schema_version:1,boards}),{headers:{'Content-Type':'application/json'}});
}
