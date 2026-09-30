import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { once } from "node:events";
import { startEphemeralCluster, stopAndRemoveCluster, childTestEnvironment } from "./run-data-contracts";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { JoseSessionCodec } from "../../src/modules/auth/infrastructure/jose-session-codec";
import { hashSessionToken } from "../../src/modules/auth/infrastructure/session-token-hash";
import { ACCOUNT_SESSION_COOKIE_NAME, ADMIN_SESSION_COOKIE_NAME } from "../../src/modules/auth/infrastructure/session-constants";

async function port() {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((done) => server.close(() => done())); return address.port;
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit"); child.kill(); await exited;
}
async function ready(url: string) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Local usage QA server did not start");
}

const cluster = await startEphemeralCluster();
const { database, pool } = createDatabaseHandle(cluster.connectionString);
let app: ChildProcess | undefined, chrome: ChildProcess | undefined, socket: WebSocket | undefined;
const output = resolve(".tmp/usage-qa");
await mkdir(output, { recursive: true });
try {
  await applyMigrations(database);
  const secret = randomBytes(32), admin = randomUUID(), member = randomUUID(), ordinaryAdmin = randomUUID();
  const codec = new JoseSessionCodec({ currentKeyId: "qa", keys: new Map([["qa", secret]]) });
  async function session(userId: string, role: "USER" | "ADMIN" | "SUPER_ADMIN", verified: boolean) {
    await pool.query(`INSERT INTO auth.user_accounts(id,login_id,login_id_normalized,role,status) VALUES($1::uuid,$1::text,$1::text,$2,'APPROVED') ON CONFLICT DO NOTHING`, [userId,role]);
    const issued = new Date(Math.floor(Date.now()/1000)*1000), id = randomUUID();
    const purpose = role === "USER" ? "ACCOUNT" : "ADMIN";
    const token = await codec.encode({ userId,role,purpose,accountStatus:"APPROVED",mustChangePassword:false,authVersion:0,adminTotpVerified:verified,source:"database" }, { sessionId:id,nowMs:issued.getTime(),ttlSeconds:1800 });
    await pool.query(`INSERT INTO auth.sessions(id,token_hash,user_account_id,auth_version,role,purpose,totp_verified_at,kind,issued_at,expires_at)
      VALUES($1,$2,$3,0,$4,$5,$6,'USER',$7,$8)`, [id,hashSessionToken(token),userId,role,purpose,verified?issued:null,issued,new Date(issued.getTime()+1800000)]);
    return token;
  }
  const memberToken = await session(member,"USER",false), adminToken = await session(admin,"SUPER_ADMIN",true), unenrolledToken = await session(admin,"SUPER_ADMIN",false);
  const ordinaryToken = await session(ordinaryAdmin,"ADMIN",true);
  const origin = `http://127.0.0.1:${await port()}`;
  const appPort = new URL(origin).port;
  app = spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",appPort], {
    windowsHide:true, stdio:"ignore", env: { ...childTestEnvironment(cluster.connectionString), NODE_ENV:"production",
      V2_PUBLIC_DATA_SOURCE:"postgres", V2_PUBLIC_ORIGIN:origin, USAGE_ANALYTICS_ENABLED:"true", USAGE_ANALYTICS_SECRET:randomBytes(32).toString("hex"),
      SESSION_SIGNING_KEYS:JSON.stringify({current:"qa",keys:{qa:secret.toString("base64url")}}),
      TOTP_ENCRYPTION_KEYS:JSON.stringify({current:1,keys:{1:randomBytes(32).toString("base64url")}}), V2_AUTH_RATE_LIMIT_PEPPER:randomBytes(32).toString("base64url"),
    },
  });
  await ready(`${origin}/api/health`);
  const event = () => ({id:randomUUID(),kind:"page",route:"/players",target:null});
  const post = (body: unknown, headers: Record<string,string> = {}) => fetch(`${origin}/api/usage/events`, {method:"POST",headers:{origin,"Content-Type":"application/json","User-Agent":"Mozilla/5.0 UsageQA",...headers},body:JSON.stringify(body)});
  assert.equal((await post(event(),{origin:"https://foreign.invalid"})).status,403);
  assert.equal((await post({...event(),query:"sensitive"})).status,400);
  assert.equal((await post({...event(),padding:"x".repeat(1500)})).status,413);
  assert.equal((await post(event(),{dnt:"1"})).status,204);
  assert.equal((await post(event(),{"User-Agent":"Googlebot"})).status,204);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM usage.events")).rows[0].n,0);
  const e = event(), initial = await post(e);
  assert.equal(initial.status,204);
  const visitorCookie = initial.headers.getSetCookie()[0].split(";",1)[0];
  assert.match(visitorCookie,/^klol_usage=/);
  assert.equal((await post(e,{cookie:visitorCookie})).status,204);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM usage.events")).rows[0].n,1);
  assert.equal((await post(event(),{cookie:`${visitorCookie}; ${ACCOUNT_SESSION_COOKIE_NAME}=${memberToken}`})).status,204);
  assert.equal((await post(event(),{cookie:`${ADMIN_SESSION_COOKIE_NAME}=${adminToken}`})).status,204);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM usage.events")).rows[0].n,2);
  assert.equal((await fetch(`${origin}/api/admin/usage/export`)).status,401);
  assert.equal((await fetch(`${origin}/api/admin/usage/export`,{headers:{cookie:`${ADMIN_SESSION_COOKIE_NAME}=${unenrolledToken}`}})).status,403);
  const ordinaryHeaders = {cookie:`${ADMIN_SESSION_COOKIE_NAME}=${ordinaryToken}`};
  for (const path of ["/admin/logs?view=stats", "/admin/logs?view=ai-requests", "/admin/usage", "/api/admin/usage/export", "/api/admin/logs", "/api/admin/logs/stats", "/api/admin/ai-requests", "/admin/kakao?tab=logs", "/admin/kakao?tab=health", "/admin/kakao?tab=settings"]) {
    const r=await fetch(origin+path,{headers:ordinaryHeaders,redirect:"manual"});
    assert.equal(r.status,200,path);
  }
  const forbiddenPage=await fetch(origin+"/admin/site-settings",{headers:ordinaryHeaders,redirect:"manual"});
  assert.equal(forbiddenPage.status,307); assert.equal(forbiddenPage.headers.get("location"),"/forbidden");
  assert.equal((await fetch(origin+"/api/admin/site-settings",{headers:ordinaryHeaders})).status,403);
  for (const path of ["/api/admin/kakao/settings", "/api/admin/kakao/recruit-health"]) assert.equal((await fetch(origin+path,{method:"POST",headers:{...ordinaryHeaders,origin,"Content-Type":"application/json"},body:"{}"})).status,403);
  const adminHeaders = {cookie:`${ADMIN_SESSION_COOKIE_NAME}=${adminToken}`};
  const csv = await fetch(`${origin}/api/admin/usage/export`,{headers:adminHeaders});
  assert.equal(csv.status,200); assert.match(await csv.text(),/고유브라우저/);
  const page = await fetch(`${origin}/admin/usage`,{headers:adminHeaders});
  assert.equal(page.status,200); assert.match(await page.text(),/회원들의 월 방문 빈도/);
  assert.equal((await fetch(`${origin}/api/admin/usage/export?from=invalid`,{headers:adminHeaders})).status,400);
  console.log("[usage-qa] HTTP origin/body validation, exclusions, deduplication, member attribution and admin/TOTP gates passed");

  const debugPort = await port();
  chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless=new","--disable-gpu","--no-first-run",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${resolve(output,`chrome-${Date.now()}`)}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
  await ready(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:"PUT"}).then(r=>r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((done,reject)=>{socket!.addEventListener("open",()=>done(),{once:true});socket!.addEventListener("error",reject,{once:true});});
  let id=0;
  const pending=new Map<number,{resolve:(v:Record<string,unknown>)=>void;reject:(e:Error)=>void}>();
  socket.addEventListener("message",(e)=>{const m=JSON.parse(String(e.data)),p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.reject(new Error(m.error.message));else p.resolve(m.result);}});
  const call=(method:string,params:Record<string,unknown>={})=>new Promise<Record<string,unknown>>((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket!.send(JSON.stringify({id:next,method,params}));});
  const evaluate=async(expression:string)=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return (r.result as {value:unknown}).value;};
  await call("Network.enable");await call("Page.enable");
  await call("Network.setCookie",{name:ADMIN_SESSION_COOKIE_NAME,value:adminToken,url:origin,httpOnly:true,sameSite:"Lax"});
  const axe = await readFile(resolve("node_modules/axe-core/axe.min.js"),"utf8");
  for(const width of [1440,390]){
    await call("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:false});
    await call("Page.navigate",{url:`${origin}/admin/usage`});
    for(let n=0;n<100;n++){if(await evaluate("document.body?.innerText.includes('회원들의 월 방문 빈도')"))break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(await evaluate("document.body.innerText.includes('회원들의 월 방문 빈도')"),true);
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"),false);
    await evaluate(axe);
    const violations = await evaluate("axe.run(document.querySelector('main'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))");
    await writeFile(resolve(output,`accessibility-${width}.json`),JSON.stringify(violations,null,2));
    const screenshot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
    await writeFile(resolve(output,`usage-${width}.png`),Buffer.from(screenshot.data as string,"base64"));
    assert.deepEqual(violations,[]);
  }
  console.log("[usage-qa] 1440px/390px: no horizontal overflow or WCAG A/AA violations; synthetic screenshots saved to .tmp/usage-qa");
  // Exercise the real browser collector against only this disposable database.
  await call("Network.deleteCookies",{name:ADMIN_SESSION_COOKIE_NAME,url:origin});
  await call("Network.setCookie",{name:ACCOUNT_SESSION_COOKIE_NAME,value:memberToken,url:origin,httpOnly:true,sameSite:"Lax"});
  await call("Network.setUserAgentOverride",{userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"});
  await call("Page.addScriptToEvaluateOnNewDocument",{source:"Object.defineProperty(navigator,'webdriver',{get:()=>false})"});
  async function waitForEvent(kind:string,route:string) {
    for(let n=0;n<100;n++){
      const r=await pool.query("SELECT 1 FROM usage.events WHERE kind=$1 AND route=$2 LIMIT 1",[kind,route]);
      if(r.rowCount)return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error(`Browser collector missed ${kind} ${route}`);
  }
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call("Page.navigate",{url:`${origin}/players?q=PRIVATE_SEARCH_MUST_NOT_BE_STORED`});
  await waitForEvent("search","/players");
  const brand = await evaluate("(()=>{const b=document.querySelector('a.brand').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()") as {x:number;y:number};
  await call("Input.dispatchMouseEvent",{type:"mousePressed",...brand,button:"left",clickCount:1});
  await call("Input.dispatchMouseEvent",{type:"mouseReleased",...brand,button:"left",clickCount:1});
  await waitForEvent("page","/");
  await waitForEvent("click","/players");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM usage.events WHERE route LIKE '%PRIVATE%' OR target LIKE '%PRIVATE%'")).rows[0].n,0);
  await evaluate("localStorage.setItem('klol-usage-opt-out','1')");
  const countBefore = (await pool.query("SELECT count(*)::int AS n FROM usage.events")).rows[0].n;
  await call("Page.navigate",{url:`${origin}/players?q=AFTER_OPTOUT`});
  await new Promise(r=>setTimeout(r,1500));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM usage.events")).rows[0].n,countBefore);
  await evaluate("localStorage.removeItem('klol-usage-opt-out')");
  await call("Network.deleteCookies",{name:ACCOUNT_SESSION_COOKIE_NAME,url:origin});
  await call("Page.navigate",{url:origin+"/signup"});
  await waitForEvent("page","/signup");
  const guest=await pool.query("SELECT user_account_id FROM usage.events WHERE route='/signup' ORDER BY occurred_at DESC LIMIT 1");
  assert.equal(guest.rows[0].user_account_id,null);
  console.log("[usage-qa] Real browser member and anonymous signup visits, page/search/link capture and opt-out passed; raw search text was not stored");
} finally {
  socket?.close(); await stop(chrome); await stop(app); await pool.end(); await stopAndRemoveCluster(cluster);
}
