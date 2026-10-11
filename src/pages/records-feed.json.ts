import {problems,boardRecords} from '../lib/data';
import {problemLinks,problemDisplayName} from '../lib/navigation';
import {feedBoard} from '../lib/records-feed';
export function GET(){
 const boards=problemLinks.map(([slug])=>problems.find(p=>p.slug===slug)!).map(p=>feedBoard(p,boardRecords(p),problemDisplayName(p.slug)));
 return new Response(JSON.stringify({schema_version:1,boards}),{headers:{'Content-Type':'application/json'}});
}
