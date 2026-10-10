// Serve the build with the same negotiation handler as api/markdown.ts.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {agentResponse,type AgentPages} from '../src/lib/agent-pages.ts';
const root=resolve('dist');
const pages=JSON.parse(await readFile(resolve(root,'agent-pages.json'),'utf8')) as AgentPages;
const option=(name:string,fallback:string)=>{const i=process.argv.lastIndexOf(name);return i<0?fallback:process.argv[i+1];};
const mime:Record<string,string>={'.css':'text/css','.js':'text/javascript','.json':'application/json','.xml':'application/xml','.txt':'text/plain','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.woff':'font/woff','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url??'/','http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    const file=resolve(root,'.'+pathname);
    if(file.startsWith(root+sep) && !pathname.endsWith('.html') && pathname!=='/agent-pages.json' && !pathname.startsWith('/api/')) {
      try {
        if((await stat(file)).isFile()) {
          res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});
          res.end(req.method==='HEAD'?undefined:await readFile(file));return;
        }
      } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
    }
    const response=agentResponse(new Request(url,{method:req.method,headers:{accept:req.headers.accept??''}}),pages,pathname);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  } catch {res.writeHead(500);res.end('Preview could not serve this request.');}
}).listen(Number(option('--port','4321')),option('--host','127.0.0.1'),()=>console.log('Serving the generated site with content negotiation.'));
