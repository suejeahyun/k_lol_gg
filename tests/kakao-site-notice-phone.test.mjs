import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { analyzeRhinoStatic } from "../scripts/lib/messengerbot-rhino-static.mjs";
const path = new URL("../integrations/messengerbot-r/site-notices/KLOL_SITE_NOTICE_COMPANION.js", import.meta.url);
const source = readFileSync(path, "utf8");
const factory = source.slice(0, source.indexOf("var KLOL_SITE_NOTICE ="));
function setup(store = {}, options = {}) {
  const context = vm.createContext({}); vm.runInContext(factory, context);
  const event = { id: "00000000-0000-4000-8000-000000000001", leaseToken: "a".repeat(64), targetHash: "b".repeat(64), text: "합성 내전 안내", leaseUntil: "2026-09-22T01:02:00.000Z" };
  const calls = []; const replies = [];
  let acknowledgeFails = options.acknowledgeFails;
  let locked = false;
  const io = { enter: () => { if (locked) return false; locked = true; return true; }, leave: () => { locked = false; }, read: (key) => store[key] || "", write: (key, value) => { if (!options.writeFails) store[key] = value; }, now: () => Date.parse("2026-09-22T01:00:00Z"), targetHash: () => "b".repeat(64),
    request: (action, data) => { calls.push({ action, data }); if (action === "REGISTER") {
      if (options.registrationThrows) throw Error("synthetic-sensitive-server-body");
      return { registered: options.registrationAccepted !== false };
    }
      if (action === "POLL") return { event: { ...event, ...options.event } }; if (acknowledgeFails) { acknowledgeFails = false; throw Error("NETWORK"); } return { acknowledged: true }; } };
  const worker = context.createKlolSiteNoticeWorker(io);
  context.KLOL_SITE_NOTICE = worker;
  vm.runInContext(source.slice(source.indexOf("function response(")), context);
  const replier = { reply: (text) => { replies.push(text); if (options.throwAfterSend) throw Error("UNCERTAIN"); return options.accepted; } };
  const register = () => { store.KLOL_SITE_NOTICE_ENABLED = "true"; store.KLOL_SITE_NOTICE_REGISTRATION_CODE = "c".repeat(32); return worker.register("사이트알림연동 " + "c".repeat(32), true, replier, "com.kakao.talk"); };
  return { worker, register, store, replies, calls, replier, response: context.response, onStartCompile: context.onStartCompile };
}

test("companion is ES5 and below both editor character limits", () => {
  const syntax = createRequire(import.meta.url)("next/dist/compiled/acorn").parse(source, { ecmaVersion: 5 });
  assert.ok(Object.values(analyzeRhinoStatic(syntax)).every((findings) => findings.length === 0));
  assert.ok(source.length < 65535); assert.ok(source.replace(/\n/g, "\r\n").length < 65535);
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""), /Api\.replyRoom|channelId/);
  assert.ok(source.includes('"installation-id\\nKLOL_V4\\nFEATURES"'), "phone signs the same FEATURES installation that owns inhouse rounds");
});

test("exact status/version commands are local and preserve OFF, settings and the registered target", () => {
  const s = setup({ KLOL_SITE_NOTICE_REGISTRATION_CODE: "c".repeat(32), KLOL_SITE_NOTICE_LEDGER_V1: "{}" });
  const storeBefore = { ...s.store };
  for (const message of ["사이트알림상태", "사이트알림버전"]) {
    assert.equal(s.worker.handleMessage(message, true, s.replier, "com.kakao.talk"), true);
  }
  assert.match(s.replies[0], /휴대폰 알림: 꺼짐\n수신 세션: 등록 필요/);
  assert.match(s.replies[1], /KLOL_SITE_NOTICE_COMPANION_1\.0\.3$/);
  assert.equal(s.worker.status(), "DISABLED"); assert.equal(s.calls.length, 0); assert.deepEqual(s.store, storeBefore);
  s.register(); const afterRegistration = { ...s.store }; const callsBefore = s.calls.length;
  const otherReplies = []; const other = { reply: (text) => otherReplies.push(text) };
  for (const message of ["사이트알림상태", "사이트알림버전"]) s.worker.handleMessage(message, true, other, "com.kakao.talk");
  assert.match(otherReplies[0], /휴대폰 알림: 켜짐\n수신 세션: 등록됨/);
  assert.equal(s.calls.length, callsBefore); assert.deepEqual(s.store, afterRegistration);
  assert.equal(s.worker.status(), "REGISTERED"); s.worker.poll();
  assert.equal(s.replies.at(-1), "합성 내전 안내"); assert.equal(otherReplies.length, 2, "status reply session never becomes the notice target");
});

test("diagnostics ignore ordinary messages, slash variants and untrusted app callbacks", () => {
  const s = setup();
  for (const message of ["/사이트알림상태", " 사이트알림상태", "사이트알림버전 extra", "봇버전", "내전현황", "사이트알림연동 invalid"]) {
    assert.equal(s.worker.handleMessage(message, true, s.replier, "com.kakao.talk"), false);
  }
  for (const message of ["사이트알림상태", "사이트알림버전"]) {
    assert.equal(s.worker.handleMessage(message, true, s.replier, "other.app"), false);
    assert.equal(s.worker.handleMessage(message, true, {}, "com.kakao.talk"), false);
  }
  assert.deepEqual(s.calls, []); assert.deepEqual(s.replies, []); assert.deepEqual(s.store, {});
});

test("registration results use fixed Korean replies and never poll or expose secrets", () => {
  for (const options of [{}, { registrationAccepted: false }, { registrationThrows: true }, { writeFails: true }]) {
    const s = setup({ KLOL_SITE_NOTICE_ENABLED: "true", KLOL_SITE_NOTICE_REGISTRATION_CODE: "c".repeat(32) }, options);
    assert.equal(s.worker.handleMessage("사이트알림연동 " + "c".repeat(32), true, s.replier, "com.kakao.talk"), true);
    const success = Object.keys(options).length === 0;
    assert.match(s.replies[0], success ? /수신 세션을 등록했어요/ : /등록에 실패.*새 등록 코드/);
    assert.doesNotMatch(s.replies[0], /c{32}|b{64}|synthetic-sensitive-server-body|https?:/);
    assert.equal(s.worker.status(), success ? "REGISTERED" : "REGISTRATION_REQUIRED");
    assert.ok(s.calls.every((call) => call.action === "REGISTER"));
    if (!options.writeFails) assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "");
    assert.equal(s.store.KLOL_SITE_NOTICE_LEDGER_V1, undefined);
  }
});

test("OFF and repeated registration replies cannot enable polling or replace a session", () => {
  const s = setup({ KLOL_SITE_NOTICE_REGISTRATION_CODE: "c".repeat(32) });
  s.worker.handleMessage("사이트알림연동 " + "c".repeat(32), true, s.replier, "com.kakao.talk");
  assert.match(s.replies[0], /꺼져 있어 등록하지 않았어요/); assert.equal(s.calls.length, 0);
  assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "c".repeat(32)); assert.equal(s.worker.status(), "DISABLED");
  s.register(); const before = { ...s.store }; const callsBefore = s.calls.length; const otherReplies = [];
  s.worker.handleMessage("사이트알림연동 " + "d".repeat(32), true, { reply: (text) => otherReplies.push(text) }, "com.kakao.talk");
  assert.match(otherReplies[0], /이미 등록.*대상은 변경하지 않았어요/); assert.equal(s.calls.length, callsBefore); assert.deepEqual(s.store, before);
  s.worker.poll(); assert.equal(s.replies.at(-1), "합성 내전 안내"); assert.equal(otherReplies.length, 1);
});

test("installed response callback reports status and registration without queue delivery", () => {
  const s = setup({ KLOL_SITE_NOTICE_ENABLED: "true", KLOL_SITE_NOTICE_REGISTRATION_CODE: "c".repeat(32) }, { throwAfterSend: true });
  s.response("unused", "사이트알림상태", "unused", true, s.replier, null, "com.kakao.talk");
  assert.match(s.replies[0], /등록 필요/); assert.deepEqual(s.calls, []);
  s.response("unused", "사이트알림연동 " + "c".repeat(32), "unused", true, s.replier, null, "com.kakao.talk");
  assert.equal(s.worker.status(), "REGISTERED", "feedback SDK failure cannot undo the successful registration");
  assert.deepEqual(s.calls.map((call) => call.action), ["REGISTER"]);
  s.onStartCompile(); assert.equal(s.worker.status(), "REGISTRATION_REQUIRED");
  s.response("unused", "사이트알림상태", "unused", true, s.replier, null, "com.kakao.talk");
  assert.match(s.replies.at(-1), /등록 필요/); assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "");
  assert.deepEqual(s.calls.map((call) => call.action), ["REGISTER"]);
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

function runtime(options = {}) {
  const logs = [], replies = [], timers = [];
  const store = { KLOL_SITE_NOTICE_ENABLED: "true", KLOL_SITE_NOTICE_REGISTRATION_CODE: "c".repeat(32) };
  const context = vm.createContext({
    KLOL_SITE_NOTICE_SETUP_FAILED: options.setupFails === true,
    Log: { i: (value) => logs.push(value) },
    DataBase: {
      getDataBase: (key) => { if (options.storageFails) throw Error("synthetic-private-value"); return store[key]; },
      setDataBase: (key, value) => { store[key] = value; },
    },
    java: { util: { concurrent: { locks: { ReentrantLock: function () {
      if (options.lockFails) throw Error("synthetic-private-value");
      this.tryLock = () => true; this.unlock = () => {};
    } } } } },
    setInterval: (callback) => { if (options.timerFails) throw Error("synthetic-private-value"); timers.push(callback); return 1; },
    clearInterval: () => {},
  });
  vm.runInContext(source, context);
  const replier = { reply(text) {
    assert.equal(this, replier, "SDK method retains its original receiver");
    if (options.replyFails) throw Error("synthetic-private-value");
    replies.push(text); return options.accepted;
  } };
  return { context, store, logs, replies, timers, replier,
    send: (message, group = true, app = "com.kakao.talk") => context.response("private-room", message, "private-sender", group, replier, null, app) };
}

test("whole installed runtime answers local diagnostics without credentials, network or registration", () => {
  const s = runtime(); const before = { ...s.store };
  s.send("사이트알림버전"); s.send("사이트알림진단"); s.send("사이트알림상태");
  assert.match(s.replies[0], /COMPANION_1\.0\.3$/);
  assert.match(s.replies[1], /초기화: READY/);
  assert.match(s.replies[2], /등록 필요/);
  assert.deepEqual(s.store, before); assert.equal(s.timers.length, 1);
  assert.ok(s.logs.includes("[KLOL_SITE_NOTICE] CALLBACK_RECEIVED"));
  assert.ok(s.logs.includes("[KLOL_SITE_NOTICE] REPLY_ACCEPTED"));
  assert.doesNotMatch(s.logs.join("\n"), /private-room|private-sender|c{32}/);
});

test("initialization failures leave version and fixed failure-stage diagnostics available", () => {
  for (const [flag, stage] of [["setupFails", "SETUP"], ["lockFails", "LOCK"], ["storageFails", "STORAGE"], ["timerFails", "TIMER"]]) {
    const s = runtime({ [flag]: true });
    assert.equal(s.context.KLOL_SITE_NOTICE, null);
    s.send("사이트알림버전"); s.send("사이트알림진단"); s.send("사이트알림상태");
    assert.match(s.replies[0], /COMPANION_1\.0\.3$/);
    assert.ok(s.replies[1].includes("초기화: " + stage));
    assert.ok(s.replies[2].includes("초기화 실패: " + stage));
    assert.doesNotThrow(() => s.context.onStartCompile());
    assert.doesNotMatch([...s.logs, ...s.replies].join("\n"), /synthetic-private-value/);
    assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "c".repeat(32));
  }
});

test("rejected callback contexts stay silent and record only fixed local diagnostic codes", () => {
  const s = runtime(); const before = { ...s.store };
  s.send("사이트알림진단", false, "other.private.app"); s.send("사이트알림진단", true, "other.private.app");
  s.context.response("room", "사이트알림진단", "sender", true, {}, null, "com.kakao.talk");
  assert.deepEqual(s.replies, []); assert.deepEqual(s.store, before);
  for (const code of ["GROUP_FLAG_COMPAT", "PACKAGE_REJECTED", "REPLIER_MISSING"]) assert.ok(s.logs.includes("[KLOL_SITE_NOTICE] " + code));
  const count = s.logs.length;
  for (const text of ["내전현황", "/사이트알림진단", " 사이트알림진단", "사이트알림연동 invalid"]) s.send(text);
  assert.equal(s.logs.length, count);
  assert.doesNotMatch(s.logs.join("\n"), /other.private.app|invalid|sender/);
});

test("reply failure and SDK rejection produce fixed local evidence without leaking exceptions", () => {
  for (const options of [{ replyFails: true }, { accepted: false }]) {
    const s = runtime(options); assert.doesNotThrow(() => s.send("사이트알림버전"));
    assert.ok(s.logs.includes("[KLOL_SITE_NOTICE] " + (options.replyFails ? "REPLY_FAILED" : "REPLY_REJECTED")));
    assert.doesNotMatch(s.logs.join("\n"), /synthetic-private-value/);
    assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "c".repeat(32));
  }
});

test("reported open-chat false group flag still answers version, diagnostics and status locally", () => {
  for (const flag of [false, undefined, null, 0]) {
    const s = runtime(); const before = { ...s.store };
    for (const message of ["사이트알림버전", "사이트알림진단", "사이트알림상태"]) {
      s.context.response("room", message, "sender", flag, s.replier, null, "com.kakao.talk");
    }
    assert.match(s.replies[0], /COMPANION_1\.0\.3$/);
    assert.match(s.replies[1], /그룹 표시: 꺼짐\/미제공 \(호환 처리\)/);
    assert.match(s.replies[1], /초기화: READY/);
    assert.match(s.replies[2], /등록 필요/);
    assert.deepEqual(s.store, before);
    assert.ok(s.logs.includes("[KLOL_SITE_NOTICE] GROUP_FLAG_COMPAT"));
    assert.ok(s.logs.includes("[KLOL_SITE_NOTICE] REPLY_ACCEPTED"));
  }
});

test("false group flag requires exact one-use code and retains only explicitly registered session", () => {
  const s = setup({ KLOL_SITE_NOTICE_ENABLED: "true", KLOL_SITE_NOTICE_REGISTRATION_CODE: "c".repeat(32) });
  s.response("room", "사이트알림연동 " + "d".repeat(32), "sender", false, s.replier, null, "com.kakao.talk");
  s.worker.poll(); assert.equal(s.calls.length, 0);
  assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "c".repeat(32));
  s.response("room", "사이트알림연동 " + "c".repeat(32), "sender", false, s.replier, null, "com.kakao.talk");
  assert.equal(s.worker.status(), "REGISTERED");
  assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "");
  const otherReplies = []; const other = { reply: (text) => otherReplies.push(text) };
  s.response("other-room", "사이트알림진단", "sender", false, other, null, "com.kakao.talk");
  s.response("other-room", "사이트알림연동 " + "c".repeat(32), "sender", false, other, null, "com.kakao.talk");
  s.worker.poll(); s.worker.poll();
  assert.equal(s.replies.filter((text) => text === "합성 내전 안내").length, 1);
  assert.equal(otherReplies.filter((text) => text === "합성 내전 안내").length, 0);
  assert.equal(s.calls.filter((call) => call.action === "REGISTER").length, 1);
});

test("false group flag never permits debug, missing-package or other-app registration", () => {
  for (const app of ["", undefined, "debug", "other.app"]) {
    const s = setup({ KLOL_SITE_NOTICE_ENABLED: "true", KLOL_SITE_NOTICE_REGISTRATION_CODE: "c".repeat(32) });
    s.response("room", "사이트알림연동 " + "c".repeat(32), "sender", false, s.replier, null, app);
    s.worker.poll(); assert.deepEqual(s.calls, []); assert.deepEqual(s.replies, []);
    assert.equal(s.store.KLOL_SITE_NOTICE_REGISTRATION_CODE, "c".repeat(32));
  }
});
