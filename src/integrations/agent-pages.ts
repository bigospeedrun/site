import type {AstroIntegration} from 'astro';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pageMarkdown,type AgentPages} from '../lib/agent-pages';

export default function agentPages(): AstroIntegration {
  return {name:'agent-pages',hooks:{
    'astro:build:done': async ({dir}) => {
      const root=fileURLToPath(dir), pages:AgentPages={};
      async function collect(directory:string):Promise<void> {
        for (const entry of await readdir(directory,{withFileTypes:true})) {
          const file=join(directory,entry.name);
          if(entry.isDirectory()) {await collect(file); continue;}
          if(!entry.name.endsWith('.html')) continue;
          const html=await readFile(file,'utf8');
          const path='/'+relative(root,file).replace(/index\.html$/,'').replace(/\.html$/,'').replace(/\/$/,'');
          const redirect=html.match(/http-equiv="refresh"[^>]*content="[^";]*;url=([^" ]+)/i)?.[1];
          pages[path]={html,markdown:redirect ? `Moved to [${redirect}](${redirect}).\n` : pageMarkdown(html),...(redirect?{redirect}:{})};
        }
      }
      await collect(root);
      await writeFile(join(root,'agent-pages.json'),JSON.stringify(pages));
    },
  }};
}
