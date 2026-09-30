import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { startEphemeralCluster, stopAndRemoveCluster, childTestEnvironment } from "./run-data-contracts";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";

const cluster = await startEphemeralCluster();
const { database, pool } = createDatabaseHandle(cluster.connectionString);
let app: ChildProcess | undefined;
try {
  await applyMigrations(database);
  const password = `Synthetic-${randomBytes(20).toString("hex")}!`;
  const hash = await hashPassword(password);
  const actors = new Map<string, string>();
  for (const [login, role, status, temporary] of [["plain_admin", "ADMIN", "APPROVED", false], ["legacy_admin", "ADMIN", "APPROVED", false], ["plain_super", "SUPER_ADMIN", "APPROVED", false], ["normal_user", "USER", "APPROVED", false], ["pending_admin", "ADMIN", "PENDING", false], ["temporary_admin", "ADMIN", "APPROVED", true]] as const) {
    const id = randomUUID(); actors.set(login, id);
    await pool.query(`INSERT INTO auth.user_accounts(id,login_id,login_id_normalized,password_hash,role,status,must_change_password) VALUES($1,$2,$2,$3,$4,$5,$6)`, [id,login,hash,role,status,temporary]);
  }
  // Valid legacy envelope structure with an unavailable key: password login must never decrypt it.
  await pool.query(`INSERT INTO auth.admin_totp_credentials(user_account_id,secret_ciphertext,secret_iv,secret_auth_tag,key_version,enabled_at,last_used_step) VALUES($1,$2,$3,$4,99,now(),123)`, [actors.get("legacy_admin"),randomBytes(32),randomBytes(12),randomBytes(16)]);
  const listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const address=listener.address();assert.ok(address && typeof address!=="string");const port=address.port;await new Promise<void>(done=>listener.close(()=>done()));
  const origin=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{windowsHide:true,stdio:"ignore",env:{...childTestEnvironment(cluster.connectionString),NODE_ENV:"production",V2_PUBLIC_DATA_SOURCE:"postgres",V2_PUBLIC_ORIGIN:origin,SESSION_SIGNING_KEYS:JSON.stringify({current:"qa",keys:{qa:randomBytes(32).toString("base64url")}}),TOTP_ENCRYPTION_KEYS:"",V2_AUTH_RATE_LIMIT_PEPPER:randomBytes(32).toString("base64url")}});
  for(let i=0;i<120;i++){try{if((await fetch(origin+"/api/health")).ok)break;}catch { /* server startup */ }await new Promise(r=>setTimeout(r,250));}
  const login=(loginId:string, supplied=password, suppliedOrigin=origin)=>fetch(origin+"/api/admin/login",{method:"POST",headers:{origin:suppliedOrigin,"Content-Type":"application/json"},body:JSON.stringify({loginId,password:supplied})});
  const html=await fetch(origin+"/admin/login?next=%2Fadmin%2Fusage").then(r=>r.text());
  assert.ok(html.includes("관리자 아이디와 비밀번호로 로그인"));assert.ok(!html.includes("one-time-code"));
  assert.equal((await login("plain_admin",password,"https://foreign.invalid")).status,403);
  assert.equal((await login("plain_admin","incorrect-password")).status,401);
  for(const name of ["normal_user","pending_admin","temporary_admin"])assert.equal((await login(name)).status,403,name);
  const cookies=new Map<string,string>();
  for(const name of ["plain_admin","legacy_admin","plain_super"]){
    const response=await login(name);assert.equal(response.status,200,name);
    assert.deepEqual(await response.json(),{success:true,requiresTwoFactorSetup:false});
    const header=response.headers.get("set-cookie")!;assert.match(header,/HttpOnly/i);assert.match(header,/SameSite=Strict/i);assert.match(header,/Max-Age=1800/);
    const cookie=header.split(";",1)[0];cookies.set(name,cookie);
    const token=cookie.split("=")[1];const payload=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString());assert.equal(payload.adminTotpVerified,false);
    const persisted=(await pool.query('SELECT totp_verified_at FROM auth.sessions WHERE id=$1',[payload.jti])).rows;assert.equal(persisted.length,1);assert.equal(persisted[0].totp_verified_at,null);
    assert.equal((await fetch(origin+"/admin/usage",{headers:{cookie},redirect:"manual"})).status,200,name);
    assert.equal((await fetch(origin+"/api/admin/usage/export",{headers:{cookie}})).status,200,name);
    const retired=await fetch(origin+"/admin/security?setup=required&next=%2Fadmin%2Fusage",{headers:{cookie},redirect:"manual"});assert.equal(retired.status,307);assert.equal(retired.headers.get("location"),"/admin/usage");
  }
  const admin=cookies.get("plain_admin")!,superCookie=cookies.get("plain_super")!;
  for(const path of ["/admin/logs","/admin/kakao?tab=settings","/admin/kakao?tab=health","/admin/kakao/rooms","/admin/riot?tab=accounts&action=bulk-link"])assert.equal((await fetch(origin+path,{headers:{cookie:admin},redirect:"manual"})).status,200,path);
  assert.equal((await fetch(origin+"/api/admin/site-settings",{headers:{cookie:admin}})).status,403);
  for(const [path,method] of [["/api/admin/security/totp","GET"],["/api/admin/security/totp/setup","POST"],["/api/admin/security/totp/setup","DELETE"],["/api/admin/security/totp/enable","POST"],["/api/admin/security/totp/disable","POST"]]){
    assert.equal((await fetch(origin+path,{method,headers:{origin,cookie:admin}})).status,410,path);
    assert.equal((await fetch(origin+path,{method,headers:{origin}})).status,401,path);
  }
  const settings=await fetch(origin+"/api/admin/site-settings",{headers:{cookie:superCookie}});assert.equal(settings.status,200);
  const request={method:"PUT",headers:{origin,cookie:superCookie,"Content-Type":"application/json","If-Match":settings.headers.get("etag")!,"Idempotency-Key":randomUUID()},body:JSON.stringify({brandName:"Synthetic password-only admin"})};
  assert.equal((await fetch(origin+"/api/admin/site-settings",request)).status,200,"durable SUPER mutation without TOTP");
  assert.equal((await fetch(origin+"/api/admin/site-settings",{...request,headers:{...request.headers,cookie:admin}})).status,403,"ADMIN still cannot mutate site settings");
  assert.equal((await fetch(origin+"/api/admin/site-settings",{...request,headers:{...request.headers,origin:"https://foreign.invalid"}})).status,403);
  const saved=(await pool.query('SELECT brand_name FROM operations.site_settings')).rows;assert.equal(saved[0].brand_name,"Synthetic password-only admin");
  await pool.query('UPDATE auth.user_accounts SET auth_version=auth_version+1 WHERE id=$1',[actors.get("legacy_admin")]);
  assert.equal((await fetch(origin+"/api/admin/session",{headers:{cookie:cookies.get("legacy_admin")!}})).status,401,"stale auth version");
  const [name,token]=admin.split("=");const pieces=token.split(".");pieces[2]=(pieces[2][0]==="A"?"B":"A")+pieces[2].slice(1);
  assert.equal((await fetch(origin+"/api/admin/session",{headers:{cookie:`${name}=${pieces.join(".")}`}})).status,401,"tampered token");
  assert.equal((await fetch(origin+"/api/admin/logout",{method:"POST",headers:{origin,cookie:admin}})).status,200);
  assert.equal((await fetch(origin+"/api/admin/session",{headers:{cookie:admin}})).status,401,"revoked session");
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth.admin_totp_credentials')).rows[0].n,1,"legacy credential preserved");
  console.log("[admin-password-qa] Password-only ADMIN/SUPER and legacy-TOTP accounts; real DB sessions and SUPER mutation; role/status/origin/tamper/revocation gates; retired endpoints; no enrollment form: passed");
} finally {
  if(app && app.exitCode===null){const done=once(app,"exit");app.kill();await done;}
  await pool.end();await stopAndRemoveCluster(cluster);
}
