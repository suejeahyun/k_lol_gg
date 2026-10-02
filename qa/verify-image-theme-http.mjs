import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {discoverAppPages, classifyRoute} from '../scripts/build-page-capture-plan.mjs';
const fixture=JSON.parse(await fs.readFile('.tmp/ux-qa/result.json','utf8'));
const {origin}=fixture; assert.equal(new URL(origin).hostname,'127.0.0.1');
const cookies={};
for(const [session,url] of [['admin','/api/admin/login'],['account','/api/auth/login']]){
 const res=await fetch(origin+url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({loginId:'ux-admin',password:'QaOnlyPass2026!'})});
 assert.equal(res.status,200,session+' sign in');cookies[session]=res.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
}
const playersHtml=await(await fetch(origin+'/players')).text();
const playerId=playersHtml.match(/href="\/players\/([a-f0-9-]{36})"/)?.[1];assert.ok(playerId);
const parameters={playerId,eventId:fixture.eventId,imageIndex:'0'};
const pages=await discoverAppPages('src/app');
const rows=[];
const styles=new Map();
for(const page of pages){
 let missing=false;
 const route=page.route.replace(/\[([^\]]+)\]/g,(_,key)=>{if(parameters[key])return parameters[key];missing=true;return '00000000-0000-4000-8000-000000000001';});
 const session=classifyRoute(page.route).session;
 let target=origin+route,res;
 const headers=cookies[session]?{cookie:cookies[session]}:{};
 for(let i=0;i<8;i++){
  res=await fetch(target,{headers,redirect:'manual'});
  if(res.status<300||res.status>=400)break;
  target=new URL(res.headers.get('location'),target).href;
 }
 const html=await res.text();
 assert.ok(res.status<500,`${route}: ${res.status}`);
 assert.ok(!/Application error:|Internal Server Error/.test(html),route);
 const cssUrls=[...html.matchAll(/href="([^\"]+\.css(?:\?[^\"]*)?)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
 for(const css of cssUrls)if(!styles.has(css)){const r=await fetch(origin+css);assert.equal(r.status,200,css);styles.set(css,await r.text());}
 const themed=cssUrls.some(css=>styles.get(css).includes('/images/theme/v1/world'));
 if(res.status===200)assert.ok(themed,`${route} includes shared artwork CSS`);
 if(res.status===404)assert.ok(missing,`${route} has no seeded record`);
 rows.push({route:page.route,resolved:route,session,status:res.status,finalPath:new URL(target).pathname,missingFixture:missing,themeStyles:themed,rasterIcons:(html.match(/data-theme-icon=/g)||[]).length});
}
const manifest=JSON.parse(await fs.readFile('docs/design/image-theme-v1.json','utf8'));
const assets=[];
for(const item of manifest.assets.flatMap(a=>[a,...(a.mobile?[a.mobile]:[])])){
 const res=await fetch(origin+'/'+item.path.replace(/^public\//,''));
 assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/image\/webp/);
 const data=Buffer.from(await res.arrayBuffer());assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);
 assets.push({path:item.path,status:res.status,bytes:data.length});
}
const report={checkedAt:new Date().toISOString(),origin,pages:rows.length,statusCounts:rows.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),fixtureLimit:'Dynamic records other than event/player are absent in this small isolated UI fixture. Their 404 or guarded redirects verify themed boundary rendering only.',pagesWithMissingFixture:rows.filter(r=>r.missingFixture).length,rows,assets};
await fs.mkdir('docs/qa-evidence/image-theme-v1.0.0-2026-10-03',{recursive:true});
await fs.writeFile('docs/qa-evidence/image-theme-v1.0.0-2026-10-03/local-http.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pages:report.pages,statusCounts:report.statusCounts,missingFixture:report.pagesWithMissingFixture,assets:assets.length,playerId}));
