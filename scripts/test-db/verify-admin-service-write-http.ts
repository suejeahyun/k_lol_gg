import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import sharp from "sharp";

// Consume the existing disposable browser fixture. Never start a server, load
// deployment credentials, accept a production URL, or mutate an existing entity.
type Json = Record<string, unknown>;
type Reply = { status: number; body: Json; etag: string | null; replayed: boolean };
type Step = { name: string; status: number; etag: string | null; replayed: boolean };
type Group = { name: string; passed: boolean; steps: Step[]; error?: string };

function object(value: unknown): Json {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Expected a JSON object");
  return value as Json;
}
function text(value: unknown): string {
  assert.equal(typeof value, "string", "Expected text");
  return value as string;
}
function uuid(value: unknown): string {
  const id = text(value);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  return id;
}
function childPath(root: string, supplied: string) {
  const absolute = resolve(supplied);
  const child = relative(resolve(root), absolute);
  assert.ok(child && !child.startsWith("..") && !isAbsolute(child), "QA file must remain inside its workspace directory");
  return absolute;
}

assert.equal(process.env.V2_DB_TEST_MODE, "true", "Explicit disposable QA mode is required");
const readyPath = childPath(".tmp", process.argv[2] ?? ".tmp/completion-browser-before-ready.json");
const outputPath = childPath("docs/qa-evidence", process.argv[3] ?? "docs/qa-evidence/service-completion-v1.0.5-2026-10-06/admin-service-write-http.json");
const allowedGroups = ["support-to-admin-review", "event-create-revise-cancel-restore", "destruction-create-schedule-cancel-restore", "highlight-save-publish-archive", "gallery-draft-upload-publish-archive", "discipline-create-update-cancel", "linked-team-submission-read"];
const selectedGroups = process.argv[4]?.split(",") ?? allowedGroups;
assert.ok(selectedGroups.length > 0 && selectedGroups.every((name) => allowedGroups.includes(name)), "Unknown QA group");
const ready = object(JSON.parse((await readFile(readyPath, "utf8")).replace(/^\uFEFF/u, "")));
const address = new URL(text(ready.origin));
assert.equal(address.protocol, "http:");
assert.equal(address.hostname, "127.0.0.1");
assert.ok(Number(address.port) > 1024 && address.port !== "5432");
assert.equal(address.username + address.password + address.search + address.hash, "");
assert.equal(address.pathname, "/");
const origin = address.origin;
assert.match(text(ready.loginId), /^browser_super_[0-9a-f]{8}$/u);
uuid(ready.actorUserAccountId);
uuid(ready.actorPlayerId);
uuid(ready.seasonId);
const adminTarget = object(object(ready.targets).admin);
assert.match(text(adminTarget.loginId), /^qa_admin_[0-9a-f]{8}$/u);
const password = text(ready.password);
assert.ok(password.length >= 24);
const runId = randomUUID();
const groups: Group[] = [];
let steps: Step[] = [];
let superCookie = "";
let adminCookie = "";

async function request(name: string, path: string, options: RequestInit = {}): Promise<Reply> {
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  const response = await fetch(`${origin}${path}`, { ...options, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  const raw: unknown = await response.json();
  const body = object(raw);
  const result = { status: response.status, body, etag: response.headers.get("etag"), replayed: response.headers.get("idempotency-replayed") === "true" };
  steps.push({ name, status: result.status, etag: result.etag, replayed: result.replayed });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/u, `${name}: no-store`);
  return result;
}
function key(label: string) { return `qa-${label}-${randomUUID()}`; }
function mutation(name: string, path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, revision: number, requestKey = key(name), cookie = superCookie, extra: Record<string, string> = {}) {
  const revisionHeader = path.includes("/competitions/destruction") ? "X-Destruction-Revision" : "If-Match";
  return request(name, path, { method, headers: { cookie, origin, "content-type": "application/json", [revisionHeader]: `"${revision}"`, "idempotency-key": requestKey, ...extra }, body: JSON.stringify(body) });
}
function success(reply: Reply, status: number, revision?: number) {
  assert.equal(reply.status, status, `Expected ${status}; response code ${String(reply.body.code ?? "none")}`);
  if (revision !== undefined) assert.equal(reply.etag, `"${revision}"`);
}
function oneCommit(replies: Reply[]) {
  assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 412], "Concurrent distinct writes must commit once and reject stale state");
  return replies.findIndex((reply) => reply.status === 200);
}
function duplicate(replies: Reply[], status: number, revision?: number) {
  for (const reply of replies) success(reply, status, revision);
  assert.deepEqual(replies[0]!.body, replies[1]!.body, "Same idempotency key must return the original committed response");
  assert.equal(replies.filter((reply) => reply.replayed).length, 1);
}
async function group(name: string, execute: () => Promise<void>) {
  if (!selectedGroups.includes(name)) return;
  steps = [];
  try { await execute(); groups.push({ name, passed: true, steps }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Unknown QA failure";
    groups.push({ name, passed: false, steps, error: message.replaceAll(password, "[synthetic-secret]").replaceAll(superCookie || "never-cookie", "[synthetic-session]").replaceAll(adminCookie || "never-cookie", "[synthetic-session]") });
  }
  process.stdout.write(`[admin-service-http] ${name}: ${groups.at(-1)!.passed ? "PASS" : "FAIL"}\n`);
}
async function login(loginId: string) {
  const response = await fetch(`${origin}/api/admin/login`, { method: "POST", redirect: "manual", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ loginId, password }), signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, "Synthetic administrator login must succeed");
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("klol_v2_session="))?.split(";")[0];
  assert.ok(cookie, "Synthetic administrator session must be returned");
  return cookie;
}

const health = await request("fixture-health", "/api/health");
success(health, 200);
assert.equal(health.body.status, "ready");
superCookie = await login(text(ready.loginId));
adminCookie = await login(text(adminTarget.loginId));
const actor = await request("fixture-identity", `/api/admin/users/${uuid(ready.actorUserAccountId)}`, { headers: { cookie: superCookie } });
success(actor, 200);
assert.equal(object(actor.body.account).loginId, ready.loginId, "Fixture must authenticate its newly generated synthetic account");

await group("support-to-admin-review", async () => {
  const input = { nickname: `QA 문의 ${runId.slice(0, 8)}`, replyTo: `qa-${runId.slice(0, 8)}@example.invalid`, category: "오류 신고", content: `합성 비공개 문의 ${runId}`, consent: true };
  const requestKey = key("support");
  const post = (label: string, body: unknown, requestOrigin = origin) => request(label, "/api/support", { method: "POST", headers: { origin: requestOrigin, "content-type": "application/json", "idempotency-key": requestKey }, body: JSON.stringify(body) });
  success(await post("support-origin", input, "https://foreign.invalid"), 403);
  success(await post("support-consent", { ...input, consent: false }), 400);
  const replies = await Promise.all([post("support-create", input), post("support-concurrent-retry", input)]);
  duplicate(replies, 201);
  assert.deepEqual(Object.keys(replies[0]!.body).sort(), ["receiptId", "submittedAt"]);
  const id = uuid(replies[0]!.body.receiptId), path = `/api/admin/operation-forms/suggestions/${id}`;
  success(await post("support-key-mismatch", { ...input, content: "변경된 합성 문의" }), 409);
  success(await request("support-private-anonymous", path), 401);
  const initial = await request("support-admin-read", path, { headers: { cookie: superCookie } });
  success(initial, 200);
  assert.equal(object(object(initial.body.form).payload).content, input.content);
  const notes = ["합성 검토 A", "합성 검토 B"], keys = notes.map(() => key("review"));
  const reviews = await Promise.all(notes.map((note, index) => mutation(`support-review-${index}`, path, "PATCH", { status: "IN_REVIEW", adminNote: note }, 0, keys[index])));
  const winner = oneCommit(reviews);
  success(reviews[winner]!, 200, 1);
  const replay = await mutation("support-review-replay", path, "PATCH", { status: "IN_REVIEW", adminNote: notes[winner] }, 0, keys[winner]);
  success(replay, 200, 1); assert.equal(replay.replayed, true);
  const fresh = await request("support-review-persisted", path, { headers: { cookie: superCookie } });
  assert.equal(object(fresh.body.form).adminNote, notes[winner]);
  const deleteKey = key("support-delete"), reason = { reason: "합성 검증 정리" };
  success(await mutation("support-delete", path, "DELETE", reason, 1, deleteKey), 200, 2);
  const deletedReplay = await mutation("support-delete-replay", path, "DELETE", reason, 1, deleteKey);
  success(deletedReplay, 200, 2); assert.equal(deletedReplay.replayed, true);
  success(await request("support-deleted-read", path, { headers: { cookie: superCookie } }), 404);
});

await group("event-create-revise-cancel-restore", async () => {
  const eventId = randomUUID(), path = `/api/admin/competitions/events/${eventId}`;
  const settings = { title: `합성 이벤트 ${runId.slice(0, 8)}`, description: "HTTP 저장 검증", format: "ARAM", recruitmentOpensAt: new Date(Date.now() - 60_000).toISOString(), recruitmentClosesAt: new Date(Date.now() + 3_600_000).toISOString(), bracketBestOf: 1 };
  const body = { eventId, settings }, createKey = key("event-create");
  duplicate(await Promise.all([0, 1].map((i) => mutation(`event-create-${i}`, "/api/admin/competitions/events", "POST", body, 0, createKey))), 201, 1);
  const editor = await fetch(`${origin}/admin/progress/event/${eventId}`, { headers: { cookie: superCookie }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  assert.equal(editor.status, 200);
  const editorHtml = await editor.text();
  assert.ok(editorHtml.includes("이벤트 설정 수정") && editorHtml.includes('name="recruitmentOpensAt"'), "Eligible event exposes settings controls through the real authenticated page");
  assert.ok(editorHtml.includes(new Date(Date.parse(settings.recruitmentOpensAt) + 9 * 3_600_000).toISOString().slice(0, -1)), "Event settings render the saved instant in Korean time");
  steps.push({ name: "event-settings-page", status: editor.status, etag: null, replayed: false });
  success(await mutation("event-key-mismatch", "/api/admin/competitions/events", "POST", { ...body, settings: { ...settings, title: "변경된 이벤트" } }, 0, createKey), 409);
  const changed = ["A", "B"].map((suffix) => ({ ...settings, title: `${settings.title} ${suffix}` }));
  const results = await Promise.all(changed.map((value, index) => mutation(`event-revise-${index}`, path, "PATCH", { type: "REPLACE_SETTINGS", payload: { settings: value } }, 1)));
  const winner = oneCommit(results);
  const read = await request("event-revised-read", path, { headers: { cookie: superCookie } });
  assert.equal(object(object(read.body.event).settings).title, changed[winner]!.title);
  const cancelBody = { type: "CANCEL_EVENT", payload: { reason: "합성 취소 검증" } }, cancelKey = key("event-cancel");
  success(await mutation("event-cancel", path, "PATCH", cancelBody, 2, cancelKey), 200, 3);
  const replay = await mutation("event-cancel-replay", path, "PATCH", cancelBody, 2, cancelKey);
  success(replay, 200, 3); assert.equal(replay.replayed, true);
  success(await mutation("event-restore", path, "PATCH", { type: "RESTORE_EVENT", payload: {} }, 3), 200, 4);
  const restored = await request("event-restored-read", path, { headers: { cookie: superCookie } });
  assert.equal(object(object(restored.body.event).lifecycle).status, "PLANNED");
  success(await mutation("event-final-cancel", path, "PATCH", cancelBody, 4), 200, 5);
  const cancelledEditor = await fetch(`${origin}/admin/progress/event/${eventId}`, { headers: { cookie: superCookie }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  assert.equal(cancelledEditor.status, 200);
  assert.ok(!(await cancelledEditor.text()).includes("이벤트 설정 수정"), "Cancelled event must not expose settings mutation controls");
  steps.push({ name: "event-cancelled-settings-hidden", status: cancelledEditor.status, etag: null, replayed: false });
});

await group("destruction-create-schedule-cancel-restore", async () => {
  const tournamentId = randomUUID(), path = `/api/admin/competitions/destruction/${tournamentId}`;
  const body = { tournamentId, title: `합성 멸망전 ${runId.slice(0, 8)}`, configuration: { gameMode: "CLASSIC", preliminaryFormat: "FULL_ROUND_ROBIN_BO1", preliminaryRoundCount: 1, teamCount: 4, laneLimits: { TOP: 4, JGL: 4, MID: 4, ADC: 4, SUP: 4 } } };
  const createKey = key("destruction-create");
  duplicate(await Promise.all([0, 1].map((i) => mutation(`destruction-create-${i}`, "/api/admin/competitions/destruction", "POST", body, 0, createKey))), 201, 1);
  const schedules = [1, 2].map((hours) => ({ recruitmentEndsAt: new Date(Date.now() + hours * 3_600_000).toISOString(), auctionStartsAt: null, preliminaryStartsAt: null, tournamentStartsAt: null }));
  const results = await Promise.all(schedules.map((schedule, index) => mutation(`destruction-schedule-${index}`, path, "PATCH", { type: "SET_SCHEDULE", payload: schedule }, 1)));
  const winner = oneCommit(results);
  const read = await request("destruction-schedule-read", path, { headers: { cookie: superCookie } });
  assert.equal(object(object(read.body.destruction).schedule).recruitmentEndsAt, schedules[winner]!.recruitmentEndsAt);
  const cancel = { type: "CANCEL_DESTRUCTION", payload: { reason: "합성 취소 검증" } }, cancelKey = key("destruction-cancel");
  success(await mutation("destruction-cancel", path, "PATCH", cancel, 2, cancelKey), 200, 3);
  const replay = await mutation("destruction-cancel-replay", path, "PATCH", cancel, 2, cancelKey);
  success(replay, 200, 3); assert.equal(replay.replayed, true);
  success(await mutation("destruction-admin-restore-denied", path, "PATCH", { type: "RESTORE_DESTRUCTION", payload: {} }, 3, key("restore-denied"), adminCookie), 403);
  success(await mutation("destruction-super-restore", path, "PATCH", { type: "RESTORE_DESTRUCTION", payload: {} }, 3), 200, 4);
  success(await mutation("destruction-final-cancel", path, "PATCH", cancel, 4), 200, 5);
});

await group("highlight-save-publish-archive", async () => {
  const body = { title: `합성 하이라이트 ${runId.slice(0, 8)}`, description: "HTTP 게시 검증", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", thumbnailAssetId: null, sortOrder: 0 };
  const createKey = key("highlight-create");
  const replies = await Promise.all([0, 1].map((i) => mutation(`highlight-create-${i}`, "/api/admin/highlights", "POST", body, 0, createKey)));
  duplicate(replies, 201, 0);
  const id = uuid(object(replies[0]!.body.highlight).id), path = `/api/admin/highlights/${id}`;
  success(await request("highlight-draft-private", `/api/highlights/${id}`), 404);
  const inputs = ["A", "B"].map((suffix) => ({ ...body, title: `${body.title} ${suffix}` }));
  const results = await Promise.all(inputs.map((input, index) => mutation(`highlight-update-${index}`, path, "PATCH", input, 0)));
  const winner = oneCommit(results);
  const current = await request("highlight-update-persisted", path, { headers: { cookie: superCookie } });
  assert.equal(object(current.body.highlight).title, inputs[winner]!.title);
  success(await mutation("highlight-publish", path, "PATCH", { action: "PUBLISH" }, 1), 200, 2);
  success(await request("highlight-public", `/api/highlights/${id}`), 200);
  const archiveKey = key("highlight-archive");
  success(await mutation("highlight-archive", path, "DELETE", {}, 2, archiveKey), 200, 3);
  const replay = await mutation("highlight-archive-replay", path, "DELETE", {}, 2, archiveKey);
  success(replay, 200, 3); assert.equal(replay.replayed, true);
  success(await request("highlight-archived-private", `/api/highlights/${id}`), 404);
  const retained = await request("highlight-retained", path, { headers: { cookie: superCookie } });
  assert.equal(object(retained.body.highlight).status, "ARCHIVED");
});

await group("gallery-draft-upload-publish-archive", async () => {
  const body = { title: `합성 갤러리 ${runId.slice(0, 8)}`, description: "격리 가짜 저장소 PNG 검증", imageAssetIds: [] as string[] };
  const created = await mutation("gallery-create", "/api/admin/images", "POST", body, 0);
  success(created, 201, 0);
  const id = uuid(object(created.body.gallery).id), path = `/api/admin/images/${id}`;
  const emptyPublish = await mutation("gallery-empty-publish-rejected", path, "PATCH", { action: "PUBLISH" }, 0);
  success(emptyPublish, 409);
  assert.equal(emptyPublish.body.code, "INVALID_TRANSITION");
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#348ac2" } }).png().toBuffer();
  const upload = await request("gallery-upload", `${path}/assets`, { method: "POST", headers: { cookie: superCookie, origin, "content-type": "image/png", "if-match": '"0"', "x-upload-byte-size": String(bytes.length), "x-content-sha256": createHash("sha256").update(bytes).digest("hex"), "x-file-name": "synthetic-service-qa.png" }, body: new Uint8Array(bytes) });
  success(upload, 201);
  const assetId = uuid(object(upload.body.asset).assetId);
  success(await mutation("gallery-attach", path, "PATCH", { ...body, imageAssetIds: [assetId] }, 0), 200, 1);
  success(await mutation("gallery-publish", path, "PATCH", { action: "PUBLISH" }, 1), 200, 2);
  const published = await request("gallery-public", `/api/images/${id}`);
  success(published, 200);
  assert.ok(JSON.stringify(published.body).includes(assetId), "Published gallery exposes its own uploaded image");
  success(await mutation("gallery-stale-archive", path, "DELETE", {}, 1), 412);
  success(await mutation("gallery-archive", path, "DELETE", {}, 2), 200, 3);
  success(await request("gallery-archived-private", `/api/images/${id}`), 404);
  const retained = await request("gallery-retained", path, { headers: { cookie: superCookie } });
  assert.equal(object(retained.body.gallery).status, "ARCHIVED");
});

await group("discipline-create-update-cancel", async () => {
  const body = { userAccountId: null, playerId: null, targetName: `합성 검증 ${runId}`, targetNickname: null, targetTagLine: null, type: "CAUTION", category: "GENERAL", source: "ISOLATED_HTTP_QA", reason: "실제 회원과 무관한 합성 기록", internalNote: "합성 내부 메모" };
  const createKey = key("discipline-create");
  const replies = await Promise.all([0, 1].map((i) => mutation(`discipline-create-${i}`, "/api/admin/discipline-records", "POST", body, 0, createKey)));
  duplicate(replies, 201, 0);
  const id = uuid(object(replies[0]!.body.record).id), path = `/api/admin/discipline-records/${id}`;
  success(await request("discipline-anonymous-denied", path), 401);
  success(await mutation("discipline-admin-update-denied", path, "PATCH", { reason: "권한 검증", internalNote: null }, 0, key("discipline-denied"), adminCookie), 403);
  const inputs = ["A", "B"].map((suffix) => ({ reason: `합성 수정 ${suffix}`, internalNote: `합성 내부 ${suffix}` }));
  const results = await Promise.all(inputs.map((input, index) => mutation(`discipline-update-${index}`, path, "PATCH", input, 0)));
  const winner = oneCommit(results);
  const persisted = await request("discipline-updated-read", path, { headers: { cookie: superCookie } });
  assert.equal(persisted.body.reason, inputs[winner]!.reason);
  const cancel = { reason: "합성 기록 취소" }, cancelKey = key("discipline-cancel");
  success(await mutation("discipline-cancel", path, "DELETE", cancel, 1, cancelKey), 200, 2);
  const replay = await mutation("discipline-cancel-replay", path, "DELETE", cancel, 1, cancelKey);
  success(replay, 200, 2); assert.equal(replay.replayed, true);
  const retained = await request("discipline-cancelled-read", path, { headers: { cookie: superCookie } });
  assert.equal(retained.body.active, false);
});

await group("linked-team-submission-read", async () => {
  const draftId = uuid(object(object(ready.fixtures).sourceIds).draftId);
  const accountLogin = await fetch(`${origin}/api/auth/login`, { method: "POST", redirect: "manual", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ loginId: text(ready.loginId), password }), signal: AbortSignal.timeout(20_000) });
  assert.equal(accountLogin.status, 200, "Synthetic ACCOUNT login must succeed");
  const accountCookie = accountLogin.headers.getSetCookie().find((value) => value.startsWith("klol_v2_account_session="))?.split(";")[0];
  assert.ok(accountCookie, "Synthetic ACCOUNT session must be returned");
  steps.push({ name: "linked-team-account-login", status: accountLogin.status, etag: null, replayed: false });
  const before = await request("linked-team-owner-read", `/api/team-tools/drafts/${draftId}`, { headers: { cookie: accountCookie } });
  success(before, 200);
  const draft = object(before.body.draft);
  assert.equal(draft.ownerUserAccountId, ready.actorUserAccountId, "The existing fixture draft belongs to the authenticated synthetic actor");
  assert.notEqual(draft.status, "ARCHIVED");
  assert.ok(Array.isArray(draft.candidates));
  const candidate = draft.candidates.map(object).find((entry) => entry.signature === draft.selectedCandidateSignature && entry.source === draft.selectedCandidateSource && entry.evaluationRound === draft.evaluationRound);
  assert.ok(candidate && Array.isArray(candidate.assignments), "The fixture has a currently selected complete layout");
  const assignments = candidate.assignments.map(object);
  assert.equal(assignments.length, 10);
  const playerIds = assignments.map((assignment) => uuid(assignment.playerId));
  assert.equal(new Set(playerIds).size, 10);

  const created = await mutation("linked-team-submission-create", "/api/me/match-submissions", "POST", {
    requestId: randomUUID(), seasonId: uuid(ready.seasonId), title: `합성 팀 연결 ${runId.slice(0, 8)}`,
    organizer: "격리 HTTP 검증", seriesNumber: 1, note: null, playedOn: new Date().toISOString().slice(0, 10),
    startedAt: null, expectedGameCount: 2, teamBalanceDraftId: draftId,
  }, 0, key("linked-team-create"), accountCookie);
  success(created, 201);
  const submissionId = uuid(created.body.submissionId), publicCode = text(created.body.publicCode);
  // Canonical WEB codes: domain/match.ts and createSubmission use MR2 + 8-byte hex.
  assert.match(publicCode, /^MR2[0-9A-F]{16}$/u);
  const ownPath = `/api/me/match-submissions/${publicCode}`;
  for (const gameNumber of [1, 2]) {
    const current = await request(`linked-team-before-upload-${gameNumber}`, ownPath, { headers: { cookie: accountCookie } });
    success(current, 200);
    const revision = object(current.body.submission).revision;
    assert.ok(typeof revision === "number" && Number.isSafeInteger(revision));
    const bytes = await sharp({ create: { width: 960, height: 540, channels: 3, background: gameNumber === 1 ? "#428acd" : "#ac5291" } }).png().toBuffer();
    const uploaded = await request(`linked-team-upload-${gameNumber}`, `${ownPath}/images`, { method: "POST", headers: {
      cookie: accountCookie, origin, "content-type": "image/png", "if-match": `"${revision}"`, "idempotency-key": key("linked-team-image"),
      "x-content-sha256": createHash("sha256").update(bytes).digest("hex"), "x-match-game-number": String(gameNumber), "x-upload-file-name": "synthetic-linked-team.png",
    }, body: new Uint8Array(bytes) });
    success(uploaded, 201);
  }
  const complete = await request("linked-team-complete-owner-read", ownPath, { headers: { cookie: accountCookie } });
  success(complete, 200);
  const submission = object(complete.body.submission);
  assert.equal(submission.status, "PENDING_REVIEW");
  assert.equal(submission.teamBalanceDraftId, draftId);
  assert.deepEqual(submission.receivedGameNumbers, [1, 2]);
  const adminPath = `/admin/matches/submissions/${submissionId}`;
  const page = await fetch(`${origin}${adminPath}`, { headers: { cookie: adminCookie }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("현재 팀 배치 불러오기"), "The real ADMIN page exposes the explicit linked-team action");
  const flight = [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/gu)]
    .flatMap((match) => { const frame: unknown = JSON.parse(match[1]!); return Array.isArray(frame) && typeof frame[1] === "string" ? [frame[1]] : []; }).join("");
  function pageProp(name: string) {
    const marker = `"${name}":`, index = flight.indexOf(marker);
    assert.ok(index >= 0, `The real page serializes ${name}`);
    const start = index + marker.length;
    assert.equal(flight[start], "{", `Expected inline ${name} props`);
    let depth = 0, quoted = false, escaped = false;
    for (let offset = start; offset < flight.length; offset++) {
      const character = flight[offset];
      if (quoted) { if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === '"') quoted = false; continue; }
      if (character === '"') quoted = true;
      else if (character === "{") depth++;
      else if (character === "}" && --depth === 0) return object(JSON.parse(flight.slice(start, offset + 1)));
    }
    throw new Error(`Incomplete ${name} page props`);
  }
  const linkedTeam = pageProp("linkedTeam"), catalog = pageProp("catalog");
  assert.equal(linkedTeam.draftId, draftId);
  assert.equal(linkedTeam.revision, draft.revision);
  assert.ok(Array.isArray(linkedTeam.assignments) && Array.isArray(catalog.players));
  assert.equal(linkedTeam.assignments.length, 10);
  for (const playerId of playerIds) {
    assert.ok(linkedTeam.assignments.some((row) => object(row).playerId === playerId), "Current selected player is included in linked-team props");
    assert.ok(catalog.players.some((row) => object(row).id === playerId && object(row).status === "ACTIVE"), "Current selected player is included in the active review catalog");
  }
  steps.push({ name: "linked-team-real-admin-page-props", status: page.status, etag: null, replayed: false });
  success(await request("linked-team-admin-api-anonymous-denied", `/api/admin/matches/submissions/${submissionId}`), 401);
  const anonymous = await fetch(`${origin}${adminPath}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  assert.ok([303, 307].includes(anonymous.status), "Anonymous review page must redirect to administrator login");
  const destination = new URL(anonymous.headers.get("location") ?? "", origin);
  assert.equal(destination.origin, origin);
  assert.equal(destination.pathname, "/admin/login");
  assert.equal(destination.searchParams.get("next"), adminPath);
  steps.push({ name: "linked-team-admin-page-anonymous-denied", status: anonymous.status, etag: null, replayed: false });
  const after = await request("linked-team-fixture-unchanged", `/api/team-tools/drafts/${draftId}`, { headers: { cookie: accountCookie } });
  success(after, 200);
  assert.equal(object(after.body.draft).revision, draft.revision, "Reading linked teams must not mutate the existing fixture draft");
});

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ checkedAt: new Date().toISOString(), origin, runId, scope: "Existing loopback disposable PostgreSQL + Next production fixture. Only newly created synthetic entities. Fake private image storage; no external provider delivery or browser UI claim.", passed: groups.every((result) => result.passed), groups }, null, 2)}\n`);
if (groups.some((result) => !result.passed)) process.exitCode = 1;
