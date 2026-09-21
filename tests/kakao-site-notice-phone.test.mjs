import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
const path = new URL("../integrations/messengerbot-r/site-notices/KLOL_SITE_NOTICE_COMPANION.js", import.meta.url);
const source = readFileSync(path, "utf8");
const factory = source.slice(source.indexOf("function createKlolSiteNoticeWorker"), source.indexOf("var KLOL_SITE_NOTICE ="));
function setup(store = {}, options = {}) {
  const context = vm.createContext({}); vm.runInContext(factory, context);
  const event = { id: "00000000-0000-4000-8000-000000000001", leaseToken: "a".repeat(64), targetHash: "b".repeat(64), text: "합성 내전 안내", leaseUntil: "2026-09-22T01:02:00.000Z" };
  const calls = []; const replies = [];
  let acknowledgeFails = options.acknowledgeFails;
  let locked = false;
  const io = { enter: () => { if (locked) return false; locked = true; return true; }, leave: () => { locked = false; }, read: (key) => store[key] || "", write: (key, value) => { if (!options.writeFails) store[key] = value; }, now: () => Date.parse("2026-09-22T01:00:00Z"), targetHash: () => "b".repeat(64),
    request: (action, data) => { calls.push({ action, data }); if (action === "REGISTER") return { registered: true };
      if (action === "POLL") return { event: { ...event, ...options.event } }; if (acknowledgeFails) { acknowledgeFails = false; throw Error("NETWORK"); } return { acknowledged: true }; } };
  const worker = context.createKlolSiteNoticeWorker(io);
  const replier = { reply: (text) => { replies.push(text); if (options.throwAfterSend) throw Error("UNCERTAIN"); return options.accepted; } };
  const register = () => { store.KLOL_SITE_NOTICE_ENABLED = "true"; store.KLOL_SITE_NOTICE_REGISTRATION_CODE = "c".repeat(32); return worker.register("사이트알림연동 " + "c".repeat(32), true, replier, "com.kakao.talk"); };
  return { worker, register, store, replies, calls, replier };
}

test("companion is ES5 and below both editor character limits", () => {
  createRequire(import.meta.url)("next/dist/compiled/acorn").parse(source, { ecmaVersion: 5 });
  assert.ok(source.length < 65535); assert.ok(source.replace(/\n/g, "\r\n").length < 65535);
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""), /Api\.replyRoom|channelId/);
  assert.ok(source.includes('"installation-id\\nKLOL_V4\\nFEATURES"'), "phone signs the same FEATURES installation that owns inhouse rounds");
});
test("no registration, disabled, wrong app/code, or another session cannot send", () => {
  const s = setup(); s.worker.poll(); assert.equal(s.calls.length, 0);
  s.store.KLOL_SITE_NOTICE_ENABLED = "true"; s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE = "c".repeat(32);
  assert.equal(s.worker.register("사이트알림연동 " + "c".repeat(32), true, s.replier, "other.app"), false);
  assert.equal(s.worker.register("사이트알림연동 invalid", true, s.replier, "com.kakao.talk"), false);
  assert.equal(s.register(), true); assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "");
  assert.equal(s.register(), false); s.worker.poll(); assert.equal(s.replies.length, 1);
});
test("ACK loss retries ACK without sending again, including after restart", () => {
  const s = setup({}, { acknowledgeFails: true }); s.register(); s.worker.poll(); s.worker.poll();
  assert.equal(s.replies.length, 1); assert.equal(s.calls.filter((item) => item.action === "ACK").length, 2);
  const restarted = setup(s.store); assert.equal(restarted.worker.status(), "REGISTRATION_REQUIRED"); restarted.worker.poll();
  assert.equal(restarted.calls.length, 0); restarted.register(); restarted.worker.poll();
  assert.equal(restarted.replies.length, 0); assert.equal(restarted.calls.at(-1).data.outcome, "SENT");
});
test("crash marker or ambiguous SDK result never resends automatically", () => {
  const store = { KLOL_SITE_NOTICE_LEDGER_V1: JSON.stringify({ "00000000-0000-4000-8000-000000000001": { state: "PREPARED", at: Date.parse("2026-09-22T01:00:00Z") } }) };
  const s = setup(store); s.register(); s.worker.poll(); assert.equal(s.replies.length, 0); assert.equal(s.calls.at(-1).data.outcome, "UNCERTAIN");
  const thrown = setup({}, { throwAfterSend: true }); thrown.register(); thrown.worker.poll(); thrown.worker.poll();
  assert.equal(thrown.replies.length, 1); assert.equal(thrown.calls.at(-1).data.outcome, "UNCERTAIN");
});
test("ledger write failure, wrong target and stale lease fail closed before send", () => {
  for (const options of [{ event: { targetHash: "d".repeat(64) } }, { event: { leaseUntil: "2026-09-22T00:00:00Z" } }]) {
    const s = setup({}, options); s.register(); s.worker.poll(); assert.equal(s.replies.length, 0);
  }
  const options = {}; const s = setup({}, options); s.register(); options.writeFails = true; s.worker.poll(); assert.equal(s.replies.length, 0);
});
test("explicit SDK rejection is retryable after manual session renewal", () => {
  const s = setup({}, { accepted: false }); s.register(); s.worker.poll(); assert.equal(s.calls.at(-1).data.outcome, "RETRY");
  assert.equal(s.worker.status(), "REGISTRATION_REQUIRED"); assert.deepEqual(JSON.parse(s.store.KLOL_SITE_NOTICE_LEDGER_V1), {});
});
