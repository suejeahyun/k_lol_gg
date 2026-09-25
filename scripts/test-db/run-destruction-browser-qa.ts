/** Disposable PostgreSQL + the production Next bundle. Never loads workspace .env files. */
import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { JoseSessionCodec } from "../../src/modules/auth/infrastructure/jose-session-codec";
import { parseSessionSigningKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { hashSessionToken } from "../../src/modules/auth/infrastructure/session-token-hash";
import type { DestructionAggregate } from "../../src/modules/competitions/destruction/state";
import { startEphemeralCluster, stopAndRemoveCluster, childTestEnvironment } from "./run-data-contracts";
import { runDestructionBrowserInteractions } from "./destruction-browser-interactions.mjs";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "docs/qa/destruction-review-refresh-2026-09-25");
const cluster = await startEphemeralCluster();
const pool = new Pool({ connectionString: cluster.connectionString });
let server: ReturnType<typeof spawn> | undefined;
let edge: ReturnType<typeof createHttpServer> | undefined;
try {
  await mkdir(output, { recursive: true });
  const tests = await execFile(process.execPath, ["--import", "tsx", "--test", "tests/database/destruction-competition.contract.test.ts"], { cwd: root, env: childTestEnvironment(cluster.connectionString), windowsHide: true });
  await writeFile(resolve(output, "database-contract.txt"), tests.stdout);
  const source = (await pool.query<{ id: string; aggregate_json: DestructionAggregate; created_by_user_account_id: string }>("select id, aggregate_json, created_by_user_account_id from competition.destruction_competitions where status = 'COMPLETED' and coalesce(aggregate_json->'configuration'->>'gameMode', 'CLASSIC') = 'CLASSIC' limit 1")).rows[0]!;
  const scenarios: Record<string, string> = { completed: source.id };
  for (const status of ["RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY"] as const) {
    const id = randomUUID();
    const original = JSON.parse(JSON.stringify(source.aggregate_json).replaceAll(source.id, id)) as DestructionAggregate;
    const unassigned = original.participants.map((entry) => ({ ...entry, teamId: null, isCaptain: false, auctionStatus: "PENDING" as const, purchasePoints: null, drawOrder: null }));
    const auction = original.participants.map((entry) => entry.isCaptain ? entry : { ...entry, teamId: null, auctionStatus: "PENDING" as const, purchasePoints: null, drawOrder: null });
    const first = auction.find((entry) => !entry.isCaptain)!;
    const aggregate: DestructionAggregate = {
      ...original, id, revision: 1, title: `멸망전 재구축 검증 · ${status}`, lifecycle: { status, cancelledFrom: null, cancellationReason: null },
      galleryId: null, tournamentBracket: null, qualifiedTeamIds: [], replacements: [], auctionPaused: false,
      participants: status === "RECRUITING" ? [] : status === "TEAM_BUILDING" ? unassigned : status === "AUCTION" ? auction.map((entry) => entry.id === first.id ? { ...entry, auctionStatus: "DRAWN", drawOrder: 1 } : entry) : original.participants,
      teams: ["RECRUITING", "TEAM_BUILDING"].includes(status) ? [] : original.teams.map((team) => ({ ...team, remainingAuctionPoints: team.initialAuctionPoints, confirmed: status === "PRELIMINARY" })),
      applications: original.applications.map((entry, index) => ({ ...entry, status: status === "RECRUITING" && index < 3 ? "APPLIED" : "CONFIRMED" })),
      preliminaryFixtures: status === "PRELIMINARY" ? original.preliminaryFixtures : [],
      mvpBallots: status === "PRELIMINARY" ? original.mvpBallots.filter((ballot) => original.preliminaryFixtures.some((fixture) => fixture.id === ballot.fixtureId)).map((ballot) => ({ ...ballot, finalizedPlayerId: null, finalizedAt: null, selectionMethod: null, votes: [], round: 1, candidatePlayerIds: ballot.participantPlayerIds })) : [],
      rosterSnapshots: status === "PRELIMINARY" ? original.rosterSnapshots.filter((snapshot) => original.preliminaryFixtures.some((fixture) => fixture.id === snapshot.fixtureId)) : [],
    };
    await pool.query("insert into competition.destruction_competitions (id,title,title_normalized,status,preliminary_format,team_count,participant_count,gallery_id,aggregate_json,revision,created_by_user_account_id,updated_by_user_account_id,created_at,updated_at) values ($1,$2,$2,$3,$4,4,$5,null,$6,1,$7,$7,now(),now())", [id, aggregate.title, status, aggregate.configuration.preliminaryFormat, aggregate.participants.length, JSON.stringify(aggregate), source.created_by_user_account_id]);
    for (const application of aggregate.applications) await pool.query("insert into competition.destruction_application_index (tournament_id,application_id,owner_user_account_id,player_id,position,status,updated_at) values ($1,$2,$3,$4,$5,$6,now())", [id, application.id, application.userAccountId, application.playerId, application.position, application.status]);
    scenarios[status.toLowerCase()] = id;
  }
  const aramRow = (await pool.query<{ id: string }>("select id from competition.destruction_competitions where aggregate_json->'configuration'->>'gameMode' = 'ARAM' limit 1")).rows[0]!;
  scenarios["aram-completed"] = aramRow.id;
  const mayhemSource = (await pool.query<{ aggregate_json: DestructionAggregate }>("select aggregate_json from competition.destruction_competitions where id=$1", [scenarios.team_building])).rows[0]!.aggregate_json;
  const mayhemId = randomUUID();
  const mayhemAggregate = { ...mayhemSource, participants: mayhemSource.participants.map((p) => ({ ...p, position: null })), id: mayhemId, title: "증바람 멸망전 · 전적 준비 대기", configuration: { ...mayhemSource.configuration, gameMode: "ARAM_MAYHEM" } };
  await pool.query("insert into competition.destruction_competitions (id,title,title_normalized,status,preliminary_format,team_count,participant_count,aggregate_json,revision,created_by_user_account_id,updated_by_user_account_id,created_at,updated_at) values ($1,$2,$2,'TEAM_BUILDING',$3,4,20,$4,1,$5,$5,now(),now())", [mayhemId, mayhemAggregate.title, mayhemAggregate.configuration.preliminaryFormat, JSON.stringify(mayhemAggregate), source.created_by_user_account_id]);
  scenarios["mayhem-pending"] = mayhemId;
  for (const mode of ["ARAM", "ARAM_MAYHEM"] as const) {
    const completed = (await pool.query<{ aggregate_json: DestructionAggregate }>("select aggregate_json from competition.destruction_competitions where aggregate_json->'configuration'->>'gameMode'=$1 and status='COMPLETED' limit 1", [mode])).rows[0]!.aggregate_json;
    const id = randomUUID();
    const first = completed.participants.find((p) => !p.isCaptain)!;
    const snapshot = { ...completed, id, revision: 1, title: mode + " · 경매 연출 검증", lifecycle: { status: "AUCTION", cancelledFrom: null, cancellationReason: null }, tournamentBracket: null, preliminaryFixtures: [], mvpBallots: [], rosterSnapshots: [], qualifiedTeamIds: [], teams: completed.teams.map((t) => ({ ...t, confirmed: false, remainingAuctionPoints: t.initialAuctionPoints })), participants: completed.participants.map((p) => p.isCaptain ? p : { ...p, teamId: null, purchasePoints: null, drawOrder: p.id === first.id ? 1 : null, auctionStatus: p.id === first.id ? "DRAWN" : "PENDING" }) };
    await pool.query("insert into competition.destruction_competitions (id,title,title_normalized,status,preliminary_format,team_count,participant_count,aggregate_json,revision,created_by_user_account_id,updated_by_user_account_id,created_at,updated_at) values ($1,$2,$2,'AUCTION',$3,4,20,$4,1,$5,$5,now(),now())", [id, snapshot.title, snapshot.configuration.preliminaryFormat, JSON.stringify(snapshot), source.created_by_user_account_id]);
    scenarios[mode === "ARAM" ? "aram-auction" : "mayhem-auction"] = id;
  }
  for (const gameMode of ["ARAM", "ARAM_MAYHEM"] as const) {
    const id = randomUUID();
    const original = (await pool.query<{ aggregate_json: DestructionAggregate }>("select aggregate_json from competition.destruction_competitions where id=$1", [scenarios.recruiting])).rows[0]!.aggregate_json;
    const snapshot = { ...original, id, configuration: { ...original.configuration, gameMode, recruitmentLimit: 40 }, applications: original.applications.map((p) => ({ ...p, position: null })) };
    await pool.query("insert into competition.destruction_competitions (id,title,title_normalized,status,preliminary_format,team_count,participant_count,aggregate_json,revision,created_by_user_account_id,updated_by_user_account_id,created_at,updated_at) values ($1,$2,$2,'RECRUITING',$3,4,0,$4,1,$5,$5,now(),now())", [id, gameMode + " 모집 검증", snapshot.configuration.preliminaryFormat, JSON.stringify(snapshot), source.created_by_user_account_id]);
    for (const app of snapshot.applications) await pool.query("insert into competition.destruction_application_index (tournament_id,application_id,owner_user_account_id,player_id,position,status,updated_at) values ($1,$2,$3,$4,null,$5,now())", [id, app.id, app.userAccountId, app.playerId, app.status]);
    scenarios[gameMode === "ARAM" ? "aram-recruiting" : "mayhem-recruiting"] = id;
  }
  const signingKeys = JSON.stringify({ current: "qa", keys: { qa: randomBytes(32).toString("base64url") } });
  const codec = new JoseSessionCodec(parseSessionSigningKeyring(signingKeys));
  const sessionId = randomUUID();
  const token = await codec.encode({ userId: source.created_by_user_account_id, role: "SUPER_ADMIN", purpose: "ADMIN", accountStatus: "APPROVED", mustChangePassword: false, authVersion: 0, adminTotpVerified: true, source: "database" }, { sessionId });
  const decoded = (await codec.decode(token))!;
  await pool.query("insert into auth.sessions (id,token_hash,user_account_id,auth_version,role,purpose,totp_verified_at,issued_at,expires_at) values ($1,$2,$3,0,'SUPER_ADMIN','ADMIN',$4,$4,$5)", [sessionId, hashSessionToken(token), source.created_by_user_account_id, new Date(decoded.issuedAt), new Date(decoded.expiresAt)]);
  const ownerId = source.aggregate_json.applications[0]!.userAccountId;
  const accountSessionId = randomUUID();
  const accountToken = await codec.encode({ userId: ownerId, role: "USER", purpose: "ACCOUNT", accountStatus: "APPROVED", mustChangePassword: false, authVersion: 0, adminTotpVerified: false, source: "database" }, { sessionId: accountSessionId });
  const accountDecoded = (await codec.decode(accountToken))!;
  await pool.query("insert into auth.sessions (id,token_hash,user_account_id,auth_version,role,purpose,issued_at,expires_at) values ($1,$2,$3,0,'USER','ACCOUNT',$4,$5)", [accountSessionId, hashSessionToken(accountToken), ownerId, new Date(accountDecoded.issuedAt), new Date(accountDecoded.expiresAt)]);
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No loopback port");
  const port = address.port;
  await new Promise<void>((done) => reservation.close(() => done()));
  const backendOrigin = `http://127.0.0.1:${port}`;
  const transport = { legacyMutationRequests: 0, applicationRevisionRequests: 0, rewrittenResponses: 0 };
  // Reproduce the deployed edge's response-side conditional handling. A successful
  // write can otherwise be replaced by a non-JSON 412 after the DB already committed.
  edge = createHttpServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) if (value !== undefined && !["connection", "content-length"].includes(key)) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const mutation = !["GET", "HEAD"].includes(request.method ?? "GET");
      if (mutation && headers.has("if-match")) transport.legacyMutationRequests += 1;
      if (mutation && headers.has("x-destruction-revision")) transport.applicationRevisionRequests += 1;
      const upstream = await fetch(backendOrigin + request.url, { method: request.method, headers, body: mutation ? Buffer.concat(chunks) : undefined, redirect: "manual" });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      const expected = headers.get("if-match");
      if (expected && expected !== upstream.headers.get("etag")?.replace(/^W\//, "")) {
        transport.rewrittenResponses += 1;
        response.writeHead(412, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("An error occurred\n\nPRECONDITION_FAILED\n");
        return;
      }
      response.statusCode = upstream.status;
      upstream.headers.forEach((value, key) => { if (!["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(key)) response.setHeader(key, value); });
      if (upstream.headers.getSetCookie().length) response.setHeader("set-cookie", upstream.headers.getSetCookie());
      response.end(bytes);
    } catch { response.writeHead(502); response.end("QA upstream unavailable"); }
  });
  await new Promise<void>((done) => edge!.listen(0, "127.0.0.1", done));
  const edgeAddress = edge.address();
  if (!edgeAddress || typeof edgeAddress === "string") throw new Error("No edge loopback port");
  const origin = `http://127.0.0.1:${edgeAddress.port}`;
  server = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...childTestEnvironment(cluster.connectionString), NODE_ENV: "production", V2_PUBLIC_DATA_SOURCE: "postgres", V2_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SITE_URL: origin, SESSION_SIGNING_KEYS: signingKeys, TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { 1: randomBytes(32).toString("base64url") } }), V2_AUTH_RATE_LIMIT_PEPPER: randomBytes(32).toString("base64url") } });
  let serverLog = "";
  server.stdout?.on("data", (data) => { serverLog += data.toString(); }); server.stderr?.on("data", (data) => { serverLog += data.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${origin}/competitions/destruction/${scenarios.auction}`)).ok) { ready = true; break; } } catch { /* starting */ }
    if (server.exitCode !== null) break;
    await new Promise((done) => setTimeout(done, 300));
  }
  if (!ready) throw new Error(`QA server not ready: ${serverLog.slice(-1500)}`);
  const authCheck = await fetch(`${origin}/api/admin/competitions/destruction/${scenarios.auction}`, { headers: { Cookie: `klol_v2_session=${token}` } });
  if (!authCheck.ok) throw new Error(`QA admin session rejected: ${authCheck.status}`);
  if (!process.argv.includes("--interactions-only")) {
  const routes = [390, 768, 1440].flatMap((width) => Object.entries(scenarios).flatMap(([name, id]) => [
    { path: `/competitions/destruction/${id}`, name: `${name}-public-${width}`, expectedRedirect: { destination: `/competitions/destruction/${id}` }, viewport: { width, height: 1000, mobile: width === 390 } },
    { path: `/admin/progress/destruction/${id}`, name: `${name}-admin-${width}`, session: "admin", expectedRedirect: { destination: `/admin/progress/destruction/${id}` }, viewport: { width, height: 1000, mobile: width === 390 } },
  ]));
  for (const width of [390, 1440]) for (const name of ["recruiting", "preliminary", "aram-recruiting", "mayhem-recruiting"]) routes.push({ path: `/competitions/destruction/${scenarios[name]}`, name: `${name}-account-${width}`, session: "account", expectedRedirect: { destination: `/competitions/destruction/${scenarios[name]}` }, viewport: { width, height: 1000, mobile: width === 390 } });
  const plan = resolve(output, "capture-plan.json");
  await writeFile(plan, JSON.stringify(routes, null, 2));
  console.log(`[destruction-browser] capturing ${routes.length} pages at ${origin}`);
  await execFile(process.execPath, ["scripts/capture-page-qa.mjs", "--origin", origin, "--routes", plan, "--output", resolve(output, "screenshots"), "--admin-cookie", `klol_v2_session=${token}`, "--account-cookie", `klol_v2_account_session=${accountToken}`], { cwd: root, env: childTestEnvironment(cluster.connectionString), windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  const report = JSON.parse(await readFile(resolve(output, "screenshots/index.json"), "utf8")) as { routes: { name: string; issues: string[] }[] };
  const failures = report.routes.filter((route) => route.issues.length);
  await writeFile(resolve(output, "server.log"), serverLog);
  console.log("[destruction-browser] captures complete");
  if (failures.length) throw new Error(`Browser QA failures: ${JSON.stringify(failures.map(({ name, issues }) => ({ name, issues })))}`);
  }
  await runDestructionBrowserInteractions({ origin, tournamentId: scenarios.auction, mayhemId, accountToken, recruitingIds: [scenarios["aram-recruiting"], scenarios["mayhem-recruiting"]], adminToken: token, output, root });
  await writeFile(resolve(output, "edge-transport.json"), JSON.stringify(transport, null, 2));
  if (transport.legacyMutationRequests || transport.rewrittenResponses || !transport.applicationRevisionRequests) throw new Error("Browser mutations must preserve application revisions without triggering edge HTTP conditionals");
  console.log("[destruction-browser] interactions and accessibility passed");
} finally {
  if (edge) { edge.closeAllConnections(); await new Promise<void>((done) => edge!.close(() => done())); }
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise((done) => server!.once("exit", done)), new Promise((done) => setTimeout(done, 5000))]);
  }
  await pool.end();
  await stopAndRemoveCluster(cluster);
}
