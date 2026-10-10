import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {agentResponse,type AgentPages} from '../src/lib/agent-pages.ts';
let pages:Promise<AgentPages>;
export default {async fetch(request:Request) {
  pages ??= readFile(join(process.cwd(),'dist/agent-pages.json'),'utf8').then(JSON.parse);
  const url=new URL(request.url);
  return agentResponse(request,await pages,'/'+(url.searchParams.get('agentPath')??''));
}};
