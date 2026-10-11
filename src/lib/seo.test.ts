import {test} from 'node:test';
import assert from 'node:assert/strict';
import otherBounds from './other-bounds.json' with {type:'json'};
import {pageSeo,pageDescriptions,siteOrigin,sitemapPaths} from './seo.ts';

test('canonical URLs use the production origin and model aliases share the problem URL',()=>{
 assert.equal(pageSeo('/').canonical,siteOrigin+'/');
 assert.equal(pageSeo('/integer-multiplication/multitape-tm/').canonical,siteOrigin+'/integer-multiplication');
 assert.equal(pageSeo('/about/').canonical,siteOrigin+'/about');
 for(const [path,description] of Object.entries(pageDescriptions)){
  assert.equal(pageSeo(path).description,description);
  assert.ok(description.endsWith('.'));
 }
 assert.equal(new Set(Object.values(pageDescriptions)).size,Object.keys(pageDescriptions).length);
});


test('hidden SSSP pages stay out of search and the sitemap',()=>{
 assert.equal(pageSeo('/directed-sssp').noindex,true);
 assert.equal(pageSeo('/directed-sssp/comparison-addition-sparse/').noindex,true);
 assert.ok(!sitemapPaths.some(path=>path.includes('directed-sssp')));
 assert.deepEqual([...sitemapPaths].sort(),Object.keys(pageDescriptions).filter(path=>!pageSeo(path).noindex).sort());
 assert.ok(sitemapPaths.every(path=>!pageSeo(path).noindex));
});

test('other-bound families have distinct canonical URLs and sitemap entries',()=>{
 assert.deepEqual(sitemapPaths.filter(path=>path.startsWith('/other/')).sort(),otherBounds.families.map(f=>'/other/'+f.slug).sort());
 for(const path of sitemapPaths.filter(path=>path.startsWith('/other/'))){
  assert.equal(pageSeo(path+'/').canonical,siteOrigin+path);
  assert.notEqual(pageSeo(path).description,pageDescriptions['/']);
 }
});
