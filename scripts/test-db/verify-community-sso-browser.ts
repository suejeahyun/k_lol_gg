import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDatabase } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { communitySites, communitySsoClients, communitySsoIdentities, players, userAccounts } from "../../src/platform/db/schema";
import { createDefaultCommunitySiteConfig } from "../../src/modules/community-sites/domain/site-configuration";
import { activateManagedSiteDatabase, initializeManagedSiteDatabase } from "../../src/modules/community-sites/infrastructure/managed-site-database";
import { communitySsoClientHash } from "../../src/modules/auth/infrastructure/community-sso-crypto";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { IsolatedChromium } from "./isolated-chromium";
import { startEphemeralCluster, stopAndRemoveCluster } from "./run-data-contracts";

// Real production bundles and ordinary auth only. Two loopback HTTPS sites exercise Strict cookies.
const root = resolve(import.meta.dirname, "../..");
const processes: ChildProcess[] = [], proxies: HttpsServer[] = [], pools: Pool[] = [];
const temp = await mkdtemp(join(tmpdir(), "gg-sso-e2e-"));
const cluster = await startEphemeralCluster();
let browser: IsolatedChromium | undefined;
const browsers: IsolatedChromium[] = [];
const logs: string[] = [], evidence: string[] = [];
const secret = () => randomBytes(32).toString("base64url");

async function availablePort() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((done) => server.close(() => done())); return address.port;
}
async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  processes.push(child); let log = "";
  for (const stream of [child.stdout!, child.stderr!]) stream.on("data", (chunk) => { log = (log + chunk.toString()).slice(-20000); });
  const code = await new Promise<number | null>((done, reject) => { child.once("error", reject); child.once("exit", done); });
  if (code !== 0) { logs.push(log); throw new Error(`Synthetic subprocess failed (${code}).`); }
}
async function safeEnvironment() {
  const keep = new Set(["path", "systemroot", "systemdrive", "windir", "temp", "tmp", "userprofile", "appdata", "localappdata", "comspec", "pathext"]);
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", ...Object.fromEntries(Object.entries(process.env).filter(([key]) => keep.has(key.toLowerCase()))) };
  for (const file of (await readdir(root)).filter((file) => /^\.env(?:\.(?:local|production|production\.local|development|development\.local|test|test\.local))?$/u.test(file))) {
    for (const match of (await readFile(resolve(root, file), "utf8")).matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gmu)) env[match[1]!] = "";
  }
  Object.assign(env, { NODE_ENV: "production", V2_E2E_BUILD: "true", NEXT_TELEMETRY_DISABLED: "1", V2_PUBLIC_DATA_SOURCE: "postgres", DATABASE_POOL_MAX: "3",
    COMMUNITY_NETWORK_ENABLED: "true", COMMUNITY_SITES_ENABLED: "true", HUB_PROVISIONING_ENABLED: "false", V2_TEST_AUTH_ENABLED: "false", V2_RIOT_INTEGRATION_ENABLED: "false", V2_OPENAI_COMPLETION_ENABLED: "false", V2_CRON_ENABLED: "false", KAKAO_SITE_NOTICE_ENABLED: "false", USAGE_ANALYTICS_ENABLED: "false",
    DATABASE_URL: "", NEXUS_DATABASE_URL: "", HUB_DATABASE_URL: "", COMMUNITY_DATABASE_URL: "" });
  return env;
}
function secrets() { return { SESSION_SIGNING_KEYS: JSON.stringify({ current: "sso-test", keys: { "sso-test": secret() } }), TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { 1: secret() } }), V2_AUTH_RATE_LIMIT_PEPPER: secret(), OPERATIONS_JOB_SECRET: secret(), CRON_SECRET: secret() }; }
async function startApp(env: NodeJS.ProcessEnv, port: number) {
  const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  processes.push(child); let log = "";
  for (const stream of [child.stdout!, child.stderr!]) stream.on("data", (chunk) => { log = (log + chunk.toString()).slice(-20000); });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) { logs.push(log); throw new Error("Synthetic application exited."); }
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { evidence.push(`production application ready: ${env.NEXT_PUBLIC_SERVICE_ID}`); return; } } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  logs.push(log); throw new Error("Synthetic application did not become healthy.");
}
async function proxy(port: number, targetPort: number, pfx: Buffer) {
  const server = createHttpsServer({ pfx, passphrase: "" }, (request, response) => {
    const upstream = httpRequest({ host: "127.0.0.1", port: targetPort, path: request.url, method: request.method,
      headers: { ...request.headers, "x-forwarded-proto": "https", "x-forwarded-host": request.headers.host } }, (result) => { response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response); });
    upstream.on("error", () => { if (response.destroyed || response.writableEnded) return; if (response.headersSent) { response.destroy(); return; } response.writeHead(502); response.end(); }); request.pipe(upstream);
  });
  proxies.push(server); await new Promise<void>((done) => server.listen(port, "127.0.0.1", done));
}
async function fill(name: string, value: string) { await browser!.focus(`[name="${name}"]`); await browser!.insertText(value); }
async function submit() { await browser!.focus('button[type="submit"]'); await browser!.pressEnter(); }
async function consent(password?: string) {
  await browser!.waitFor('Boolean(document.querySelector("input[name=termsAccepted]"))', "SSO consent");
  if (password) await fill("password", password);
  for (const name of ["termsAccepted", "privacyAccepted"]) { await browser!.focus(`[name="${name}"]`); await browser!.pressSpace(); }
  await submit();
}

try {
  assert.equal(process.platform, "win32", "Local certificate generation currently requires PowerShell 7.");
  const certificateScript = join(temp, "certificate.ps1");
  await writeFile(certificateScript, `$key=[System.Security.Cryptography.RSA]::Create(2048)
$request=[System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=GG SSO synthetic loopback',$key,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san=[System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('localhost');$san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
$request.CertificateExtensions.Add($san.Build())
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
$cert=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(1))
[IO.File]::WriteAllBytes((Join-Path $env:SSO_CERT_DIRECTORY 'cert.pfx'),$cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,''))
[IO.File]::WriteAllText((Join-Path $env:SSO_CERT_DIRECTORY 'cert.pem'),$cert.ExportCertificatePem())
$cert.Dispose();$key.Dispose()
`);
  await run("pwsh", ["-NoProfile", "-File", certificateScript], { ...await safeEnvironment(), SSO_CERT_DIRECTORY: temp });
  const cert = await readFile(join(temp, "cert.pem")); const pfx = await readFile(join(temp, "cert.pfx"));
  const spki = createHash("sha256").update(new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" })).digest("base64");
  const [hubPort, childPort, hubInner, childInner] = await Promise.all(Array.from({ length: 4 }, availablePort));
  const hubOrigin = `https://127.0.0.1:${hubPort}`, childOrigin = `https://localhost:${childPort}`;
  const hubPool = new Pool({ connectionString: cluster.connectionString, max: 3 }); pools.push(hubPool);
  const hub = createDatabase(hubPool); await applyMigrations(hub);
  const childName = `klol_v2_test_sso_child_${randomBytes(8).toString("hex")}`; assert.match(childName, /^klol_v2_test_sso_child_[a-f0-9]{16}$/u);
  await hubPool.query(`CREATE DATABASE "${childName}"`);
  const childUrl = new URL(cluster.connectionString); childUrl.pathname = `/${childName}`;
  assertSafeTestDatabase({ connectionString: childUrl.href, nodeEnv: "test", testMode: "true" });
  const childPool = new Pool({ connectionString: childUrl.href, max: 1 }); pools.push(childPool); const child = createDatabase(childPool);
  const siteId = randomUUID(), ownerId = randomUUID(), memberId = randomUUID(), clientSecret = secret(), password = `Synthetic-${secret()}!1a`;
  for (const [id, loginId] of [[ownerId, "sso-owner"], [memberId, "sso-member"]]) await hub.insert(userAccounts).values({ id, loginId, loginIdNormalized: loginId, passwordHash: await hashPassword(password), role: "USER", status: "APPROVED" });
  const configuration = { ...createDefaultCommunitySiteConfig(), slug: "synthetic-sso", name: "합성 SSO 커뮤니티" };
  await hub.insert(communitySites).values({ id: siteId, ownerUserAccountId: ownerId, slug: configuration.slug, configurationJson: configuration, publishedConfigurationJson: configuration, status: "AWAITING_OWNER", origin: childOrigin });
  await hub.insert(communitySsoClients).values({ siteId, secretHash: communitySsoClientHash(clientSecret) });
  await initializeManagedSiteDatabase(childPool, { siteId, ownerHubUserId: ownerId, hubOrigin, configuration, revision: 1 });
  const common = { ...await safeEnvironment(), NODE_EXTRA_CA_CERTS: join(temp, "cert.pem") };
  const hubEnv = { ...common, ...secrets(), NEXT_DIST_DIR: ".next-sso-hub", NEXT_PUBLIC_SERVICE_ID: "hub", NEXT_PUBLIC_SITE_URL: hubOrigin, V2_PUBLIC_ORIGIN: hubOrigin, HUB_DATABASE_URL: cluster.connectionString };
  const childEnv = { ...common, ...secrets(), NEXT_DIST_DIR: ".next-sso-child", NEXT_PUBLIC_SERVICE_ID: "community", NEXT_PUBLIC_COMMUNITY_ID: siteId, NEXT_PUBLIC_COMMUNITY_NAME: configuration.name, NEXT_PUBLIC_COMMUNITY_SHORT_NAME: "합성", NEXT_PUBLIC_SITE_URL: childOrigin, V2_PUBLIC_ORIGIN: childOrigin, COMMUNITY_DATABASE_URL: childUrl.href, COMMUNITY_HUB_ORIGIN: hubOrigin, COMMUNITY_HUB_CLIENT_SECRET: clientSecret };
  for (const env of [hubEnv, childEnv]) {
    const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
    config.compilerOptions.baseUrl = "..";
    config.include = ["../next-env.d.ts", "../src/**/*.ts", "../src/**/*.tsx", `../${env.NEXT_DIST_DIR}/types/**/*.ts`];
    config.exclude = ["../node_modules"];
    await writeFile(resolve(root, `.private/${env.NEXT_DIST_DIR.slice(1)}-tsconfig.json`), JSON.stringify(config, null, 2));
    console.log(`[sso-browser] Building isolated ${env.NEXT_PUBLIC_SERVICE_ID} production bundle`);
    await run(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "build"], env);
  }
  await Promise.all([startApp(hubEnv, hubInner), startApp(childEnv, childInner)]);
  await Promise.all([proxy(hubPort, hubInner, pfx), proxy(childPort, childInner, pfx)]);
  browser = await IsolatedChromium.launch(hubOrigin, { localCertificateSpki: spki });
  browsers.push(browser);
  await browser.navigate(`${childOrigin}/`); assert.ok((await browser.evaluate<string>("document.body.innerText")).includes("사이트 공개 준비 중"));
  await browser.navigate(`${childOrigin}/login`);
  assert.equal(await browser.evaluate<number>("fetch('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)"), 403);
  evidence.push("unpublished anonymous home and local signup blocked");
  await browser.navigate(`${hubOrigin}/login?next=/`); await fill("loginId", "sso-owner"); await fill("password", password); await submit();
  await browser.waitFor(`location.origin === ${JSON.stringify(hubOrigin)} && location.pathname === '/'`, "ordinary HUB login");
  await browser.navigate(`${childOrigin}/api/auth/community-sso/start?purpose=ACCOUNT&next=/`); await consent();
  await browser.waitFor(`location.origin === ${JSON.stringify(childOrigin)} && location.pathname === '/'`, "owner preview SSO");
  assert.ok(!(await browser.evaluate<string>("document.body.innerText")).includes("사이트 공개 준비 중"));
  evidence.push("cross-site Strict-cookie owner ACCOUNT SSO and owner preview passed");
  await browser.navigate(`${childOrigin}/api/auth/community-sso/start?purpose=ADMIN&next=/admin`); await consent(password);
  await browser.waitFor(`location.origin === ${JSON.stringify(childOrigin)} && location.pathname.startsWith('/admin')`, "local owner administrator SSO");
  assert.equal((await child.select().from(userAccounts))[0].role, "SUPER_ADMIN");
  assert.equal((await hub.select().from(userAccounts).where(eq(userAccounts.id, ownerId)))[0].role, "USER");
  evidence.push("fresh-password hub USER becomes only pre-provisioned local SUPER_ADMIN");
  await writeFile(resolve(root, ".private/sso-owner-preview.png"), await browser.captureScreenshot());
  await browser.clearCookies(); await browser.navigate(`${hubOrigin}/login?next=/`); await fill("loginId", "sso-member"); await fill("password", password); await submit();
  await browser.waitFor(`location.origin === ${JSON.stringify(hubOrigin)} && location.pathname === '/'`, "member HUB login");
  await browser.navigate(`${childOrigin}/api/auth/community-sso/start?purpose=ACCOUNT&next=/`);
  await browser.waitFor("document.body.innerText.includes('사이트가 아직 공개되지 않았거나')", "nonowner unpublished SSO refusal");
  assert.equal((await child.select().from(userAccounts)).length, 1);
  evidence.push("nonowner cannot create a local identity before publication");
  await activateManagedSiteDatabase(childPool, { siteId, ownerHubUserId: ownerId });
  await hub.update(communitySites).set({ status: "ACTIVE" }).where(eq(communitySites.id, siteId));
  await browser.navigate(`${childOrigin}/api/auth/community-sso/start?purpose=ACCOUNT&next=/`); await consent();
  await browser.waitFor(`location.origin === ${JSON.stringify(childOrigin)} && location.pathname === '/account/community-profile'`, "new member profile onboarding");
  await fill("memberName", "합성 가입 회원"); await fill("riotId", "SyntheticMember#SSO"); await submit();
  await browser.waitFor("!document.querySelector('input[name=memberName]') && Boolean(document.querySelector('[role=status]'))", "completed local profile registration");
  const mapping = (await child.select().from(communitySsoIdentities).where(eq(communitySsoIdentities.hubSubject, memberId)))[0]; assert.ok(mapping);
  const localMember = (await child.select().from(userAccounts).where(eq(userAccounts.id, mapping.userAccountId)))[0];
  assert.equal(localMember.role, "USER"); assert.equal(localMember.status, "PENDING");
  const player = (await child.select().from(players).where(eq(players.userAccountId, localMember.id)))[0]; assert.ok(player); assert.equal(player.status, "INACTIVE");
  evidence.push("published member consent creates only local USER/PENDING and INACTIVE profile");
  await writeFile(resolve(root, ".private/sso-member-onboarding.png"), await browser.captureScreenshot());
  assert.equal(await browser.evaluate<number>("fetch('/api/recruits',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)"), 403);
  const memberBrowser = browser;
  browser = await IsolatedChromium.launch(hubOrigin, { localCertificateSpki: spki }); browsers.push(browser);
  await browser.navigate(`${hubOrigin}/login?next=/`); await fill("loginId", "sso-owner"); await fill("password", password); await submit();
  await browser.waitFor(`location.origin === ${JSON.stringify(hubOrigin)} && location.pathname === '/'`, "reviewer HUB login");
  await browser.navigate(`${childOrigin}/api/auth/community-sso/start?purpose=ADMIN&next=/admin`); await consent(password);
  await browser.waitFor(`location.origin === ${JSON.stringify(childOrigin)} && location.pathname.startsWith('/admin')`, "reviewer local admin SSO");
  const approval = await browser.evaluate<{ status: number; body: unknown }>(`fetch('/api/admin/users/${localMember.id}/approve',{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':${JSON.stringify(`"${localMember.revision}"`)},'Idempotency-Key':${JSON.stringify(randomUUID())}},body:JSON.stringify({publicReason:'프로필 확인 완료',internalReason:'합성 브라우저 검증',expectedClaimId:null,claimOwnershipReviewed:false})}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(approval.status, 200, JSON.stringify(approval.body));
  assert.equal((await child.select().from(players).where(eq(players.id, player.id)))[0].status, "ACTIVE");
  assert.deepEqual(browser.getRuntimeErrors(), []);
  browser = memberBrowser;
  await browser.navigate(`${childOrigin}/api/auth/community-sso/start?purpose=ACCOUNT&next=/`); await consent();
  await browser.waitFor(`location.origin === ${JSON.stringify(childOrigin)} && location.pathname === '/'`, "approved member reauthentication");
  const recruitBody = { type: "CREATE_PARTY", payload: { recruitDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()), resetSequence: 0, recruitNumber: 1, partyType: "FLEX_RANK", title: "합성 SSO 회원 첫 모집", maximumMembers: 5, members: [{ name: "합성 가입 회원", position: "TOP", slotNo: 1, substitute: false }], scheduledStartAt: null, protectedUntil: null } };
  const recruit = await browser.evaluate<{ status: number; body: unknown }>(`fetch('/api/recruits',{method:'POST',headers:{'Content-Type':'application/json','If-Match':'"0"','Idempotency-Key':${JSON.stringify(randomUUID())}},body:JSON.stringify(${JSON.stringify(recruitBody)})}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.ok(recruit.status === 200 || recruit.status === 201, JSON.stringify(recruit));
  evidence.push("pending member cannot recruit; real local-admin approval activates profile, then member SSO can create first recruitment");
  assert.deepEqual(browser.getRuntimeErrors(), []);
  await writeFile(resolve(root, ".private/community-sso-browser-result.json"), JSON.stringify({ passed: true, syntheticOnly: true, productionBundles: ["hub", "community"], distinctOrigins: true, operatingServicesConfigured: false, checks: evidence }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: evidence }));
} catch (error) {
  if (browser) { logs.push(await browser.evaluate<string>("location.origin + location.pathname + '\\n' + document.body.innerText").catch(() => "browser unavailable")); await writeFile(resolve(root, ".private/sso-failure.png"), await browser.captureScreenshot()).catch(() => undefined); }
  await writeFile(resolve(root, ".private/community-sso-browser-error.log"), logs.join("\n").replace(/postgres(?:ql)?:\/\/[^\s'"]+/gu, "[synthetic database]"));
  throw error;
} finally {
  await Promise.all(browsers.map((item) => item.close()));
  for (const server of proxies) { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); }
  for (const child of processes) if (child.exitCode === null) { const exited = new Promise((done) => child.once("exit", done)); child.kill("SIGTERM"); await Promise.race([exited, new Promise((done) => setTimeout(done, 5000))]); if (child.exitCode === null) child.kill("SIGKILL"); }
  await Promise.all(pools.map((pool) => pool.end())); await stopAndRemoveCluster(cluster);
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + "\\gg-sso-e2e-")); await rm(temp, { recursive: true, force: true });
}
