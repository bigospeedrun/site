import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../../public/analytics.js',import.meta.url),'utf8');
function load(hostname:string){
 const scripts:any[]=[];
 const context:any={location:{hostname},document:{createElement:()=>({}),head:{appendChild:(s:any)=>scripts.push(s)}}};
 context.window=context;
 runInNewContext(script,context);
 return {context,scripts};
}
test('analytics never initializes or requests Google scripts on previews or lookalike hosts',()=>{
 for(const host of ['localhost','127.0.0.1','preview.example.org','bigospeedrun.com.example.org']){
  const {context,scripts}=load(host);
  assert.equal(scripts.length,0);
  assert.equal(context.dataLayer,undefined);
 }
});
test('both production hosts configure the assigned GA property once with existing privacy choices',()=>{
 for(const host of ['bigospeedrun.com','www.bigospeedrun.com']){
  const {context,scripts}=load(host);
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-MZ689LR3LG');
  const config=Array.from(context.dataLayer[1]) as any[];
  assert.equal(config[0],'config');assert.equal(config[1],'G-MZ689LR3LG');
  assert.equal(config[2].anonymize_ip,true);
  assert.equal(config[2].allow_google_signals,false);
  assert.equal(config[2].allow_ad_personalization_signals,false);
 }
});
