import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageMarkdown,agentResponse,prefersMarkdown} from './agent-pages.ts';

test('Markdown keeps table evidence, collapsed details and exact math once',()=>{
 const html='<main><h1>Bounds</h1><p><span class="katex"><span>duplicate</span><annotation encoding="application/x-tex">O(n \\log n)</annotation></span></p><table><tr><th>Bound</th><th>Evidence</th></tr><tr><td>n</td><td><a href="https://example.com/proof">Claimed</a></td></tr></table><details><summary>Assumptions</summary><p>Only integers &amp; exact arithmetic.</p></details><script>secret</script></main>';
 const md=pageMarkdown(html);
 assert.match(md,/# Bounds/);assert.match(md,/\| Bound \| Evidence \|/);assert.match(md,/\[Claimed\]\(https:\/\/example.com\/proof\)/);
 assert.match(md,/Only integers & exact arithmetic/);assert.equal(md.split('O(n').length,2);assert.doesNotMatch(md,/duplicate|secret/);
});
test('Accept quality and explicit exclusions select the representation',()=>{
 for(const accept of ['text/markdown','text/html;q=0.5, text/markdown','text/markdown, */*']) assert.equal(prefersMarkdown(accept),true,accept);
 for(const accept of ['', '*/*','text/html','text/markdown;q=0','text/markdown;q=0.2, text/html','text/markdown;q=0, */*']) assert.equal(prefersMarkdown(accept),false,accept);
});
test('Responses preserve status, type, cache separation, HEAD and redirects',async()=>{
 const pages={'/':{html:'<main>Home</main>',markdown:'# Home'},'/404':{html:'<main>Missing</main>',markdown:'# Missing\n[Home](/)'},'/old':{html:'',markdown:'',redirect:'/about#submit'}};
 for(const accept of ['text/html','text/markdown']) {
  const request=(path:string,method='GET')=>new Request('https://example.com'+path,{method,headers:{accept}});
  const ok=agentResponse(request('/'),pages);assert.equal(ok.status,200);assert.equal(ok.headers.get('vary'),'Accept');assert.match(ok.headers.get('content-type')!,new RegExp(accept));assert.equal(ok.headers.get('cache-control'),'private, no-store');
  const missing=agentResponse(request('/missing'),pages);assert.equal(missing.status,404);assert.match(await missing.text(),/Missing/);
  assert.equal(agentResponse(request('/404'),pages).status,404);
  assert.equal(await agentResponse(request('/','HEAD'),pages).text(),'');
  assert.equal(agentResponse(request('/','POST'),pages).status,405);
  const moved=agentResponse(request('/old'),pages);assert.equal(moved.status,301);assert.equal(moved.headers.get('location'),'/about#submit');
  assert.equal(agentResponse(request('/__proto__'),pages).status,404);
 }
});
test('Embedded chart HTML stays in attributes; paginated rows remain readable',()=>{
 const html='<main><progress-chart data-chart="{&quot;bound&quot;:&quot;<span>private chart payload</span>&quot;}"><p>Progress</p></progress-chart><table><tr><th>Rank</th></tr><tr hidden><td>11</td><td class="mobile-meta">duplicate</td></tr></table><p class="no-results" hidden>No results</p></main>';
 const md=pageMarkdown(html);assert.match(md,/Progress/);assert.match(md,/\| 11 \|/);assert.doesNotMatch(md,/private chart payload|duplicate|No results/);
});
