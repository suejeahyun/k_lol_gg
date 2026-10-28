import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { analyzeRhinoStatic } from "../scripts/lib/messengerbot-rhino-static.mjs";

const source = readFileSync(new URL("../integrations/messengerbot-r/room-routing/KAKAO_ROOM_ROUTER.js", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const slots = ["KLOL_MAIN", "KLOL_RECRUIT", "NEXUS_MAIN", "NEXUS_RECRUIT"];
const names = ["LOL - K", "K롤방 구인구직방", "NEXUS", "NEXUS구인구직방"];
const roles = { KLOL_MAIN: [0, 1], KLOL_NOTICE: [1], NEXUS_MAIN: [2, 3], NEXUS_NOTICE: [3] };
const registry = () => ({ version: 1, revision: "synthetic-v1", slots: Object.fromEntries(slots.map((key, i) => [key, { user: "0", shortcutId: String(101 + i) }])) });
const bundle = (data) => ({ get: (key) => data[key] ?? null, getLong: (key) => data[key] ?? 0 });
const input = (key = "synthetic-result", freeform = true) => ({ getResultKey: () => key, getAllowFreeFormInput: () => freeform });
const action = (id = "synthetic-action", inputs = [input()]) => ({ id, actionIntent: { id }, getRemoteInputs: () => inputs });
function notification(options = {}) {
  const values = { text: "봇버전", time: 1001, sender: "synthetic-member", ...options.message };
  const extras = { threadId: 0, "android.messages": [bundle(values)], ...options.extras };
  const value = { flags: 0, extras: bundle(extras), actions: [action()],
    getShortcutId: () => Object.hasOwn(options, "shortcutId") ? options.shortcutId : "101", ...options.notification };
  return {
    getPackageName: () => options.appPackage ?? "com.kakao.talk",
    getNotification: () => value,
    getUser: () => ({ getIdentifier: () => options.user ?? 0 }),
    getKey: () => options.key ?? "synthetic-notification-key",
  };
}
function harness(options = {}) {
  const context = vm.createContext({ module: { exports: {} }, ...options.globals });
  vm.runInContext(source, context);
  let stored = JSON.stringify(options.registry ?? registry());
  let depth = 0;
  const calls = [], replies = [], logs = [], reads = [], digests = [];
  const lock = { busy: false, tryLock() { if (this.busy) return false; depth += 1; return true; }, lock() { depth += 1; }, unlock() { depth -= 1; assert.ok(depth >= 0); } };
  const io = {
    now: () => 1000,
    read: () => { reads.push(true); return stored; },
    readLong: (extras, key) => extras.get(key),
    digest(value) { const hashed = createHash("sha256").update(value).digest("hex"); digests.push(hashed); return hashed; },
    makeReplier(selected) { return { reply(text) { replies.push({ action: selected.id, text }); return true; } }; },
    log: (code, role) => logs.push({ code, role }),
    lock,
    ...options.io,
  };
  const handler = options.handler ?? ((...args) => { calls.push(args); args[4].reply("synthetic-reply"); });
  const router = context.module.exports.create(options.role ?? "KLOL_MAIN", handler, io);
  return { router, calls, replies, logs, reads, digests, lock, context, io,
    setRegistry(value) { stored = typeof value === "string" ? value : JSON.stringify(value); },
    depth: () => depth };
}

test("router is ES5 and has no Rhino strict-warning patterns", () => {
  const result = analyzeRhinoStatic(acorn.parse(source, { ecmaVersion: 5 }));
  for (const [key, value] of Object.entries(result)) if (Array.isArray(value)) assert.equal(value.length, 0, key);
  assert.doesNotMatch(source, /Api\.(?:replyRoom|bindSession)|setInterval|setTimeout|\.setDataBase\(/);
});

test("all four profile roles route only their explicitly bound slots, with exact legacy arguments", () => {
  for (const [role, allowed] of Object.entries(roles)) {
    for (let slot = 0; slot < slots.length; slot += 1) {
      const h = harness({ role });
      assert.equal(h.router(notification({ shortcutId: String(101 + slot) })), allowed.includes(slot), `${role}/${slots[slot]}`);
      assert.equal(h.calls.length, allowed.includes(slot) ? 1 : 0);
      if (allowed.includes(slot)) {
        const args = h.calls[0];
        assert.equal(args.length, 11);
        assert.equal(args[0], names[slot]);
        assert.equal(args[1], "봇버전");
        assert.equal(args[2], "synthetic-member");
        assert.equal(args[3], true);
        assert.equal(args[5], null);
        assert.equal(args[6], "com.kakao.talk");
        assert.equal(args[7], false);
        assert.match(args[8], /^room-v1-[a-f0-9]{64}$/);
        assert.equal(args[9], String(101 + slot));
        assert.equal(args[10], "");
      } else assert.equal(h.replies.length, 0);
      assert.equal(h.depth(), 0);
    }
  }
});

test("package, summaries, history-only and stale events are rejected before registry reads", () => {
  const cases = [
    { appPackage: "com.kakao.talk.other" }, { appPackage: "COM.KAKAO.TALK" },
    { notification: { flags: 512 } }, { notification: { extras: null } },
    { extras: { "android.messages": [] } }, { extras: { "android.messages": null, "android.text": "봇버전" } },
    { message: { time: 1000 } }, { message: { time: 999 } }, { message: { time: null } },
    { message: { time: Infinity } }, { message: { time: 1001.1 } }, { message: { time: 9007199254740992 } },
    { message: { text: null } }, { message: { text: "" } },
  ];
  for (const options of cases) {
    const h = harness();
    assert.equal(h.router(notification(options)), false);
    assert.deepEqual(h.reads, []);
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.replies, []);
  }
});

test("only the latest MessagingStyle bundle is processed and title never selects a room", () => {
  const h = harness();
  h.router(notification({ extras: { "android.title": "NEXUS", "android.conversationTitle": "NEXUS", "android.messages": [
    bundle({ text: "ignored-history", time: 1002, sender: "old-sender" }),
    bundle({ text: "latest-command", time: 1003, sender: "latest-sender" }),
  ] } }));
  assert.deepEqual(h.calls.map((args) => args.slice(0, 3)), [["LOL - K", "latest-command", "latest-sender"]]);
  const wrong = harness();
  assert.equal(wrong.router(notification({ shortcutId: "999", extras: { threadId: "101", "android.title": "LOL - K" } })), false);
  assert.equal(wrong.calls.length, 0);
});

test("sender Person is preferred, legacy sender is fallback, and title is never an identity fallback", () => {
  for (const [message, expected] of [
    [{ sender_person: { getName: () => "synthetic-person" }, sender: "different-legacy" }, "synthetic-person"],
    [{ sender_person: { getName: () => null }, sender: "synthetic-legacy" }, "synthetic-legacy"],
    [{ sender_person: { getName: () => "" }, sender: "synthetic-legacy" }, "synthetic-legacy"],
  ]) {
    const h = harness();
    assert.equal(h.router(notification({ message })), true);
    assert.equal(h.calls[0][2], expected);
  }
  const h = harness();
  assert.equal(h.router(notification({ message: { sender: null }, extras: { "android.title": "synthetic-title" } })), false);
  assert.equal(h.reads.length, 0);
});

test("registry must contain exactly four unique valid explicit bindings and a revision", () => {
  const mutations = [
    (r) => { r.version = 2; }, (r) => { delete r.revision; }, (r) => { r.revision = ""; },
    (r) => { delete r.slots.NEXUS_MAIN; }, (r) => { r.slots.EXTRA = r.slots.KLOL_MAIN; },
    (r) => { r.slots.NEXUS_MAIN.shortcutId = r.slots.KLOL_MAIN.shortcutId; },
    (r) => { r.slots.NEXUS_MAIN = { ...r.slots.KLOL_MAIN, user: "10" }; },
    (r) => { r.slots.NEXUS_MAIN.user = 0; }, (r) => { r.slots.NEXUS_MAIN.user = "-1"; },
    (r) => { r.slots.NEXUS_MAIN.user = "00"; }, (r) => { r.slots.NEXUS_MAIN.user = "2147483648"; },
    ...[0, 103, null, "", " ", "a b", "a\nb", "\u0001", "a\u200bb", "x".repeat(257)].map((value) => (r) => { r.slots.NEXUS_MAIN.shortcutId = value; }),
    (r) => { delete r.slots.NEXUS_MAIN.shortcutId; r.slots.NEXUS_MAIN.threadId = "103"; },
  ];
  for (const mutate of mutations) {
    const r = registry(); mutate(r);
    const h = harness({ registry: r });
    assert.equal(h.router(notification()), false);
    assert.equal(h.calls.length, 0);
    assert.equal(h.replies.length, 0);
    assert.equal(h.depth(), 0);
  }
  for (const text of ["", "{", "null", "[]"]) {
    const h = harness(); h.setRegistry(text);
    assert.equal(h.router(notification()), false);
    assert.equal(h.calls.length, 0);
  }
});

test("same shortcut under another Android user cannot cross a binding", () => {
  const h = harness();
  assert.equal(h.router(notification({ user: 10 })), false);
  assert.equal(h.router(notification({ user: -1 })), false);
  assert.equal(h.router(notification({ user: "00" })), false);
  assert.equal(h.calls.length, 0);
});

test("opaque shortcut IDs preserve exact strings, prefixes and digits beyond Number precision", () => {
  const r = registry();
  const ids = ["9007199254740992", "9007199254740993", "room:000123", "conversation_opaque-4"];
  slots.forEach((slot, i) => { r.slots[slot].shortcutId = ids[i]; });
  for (let index = 0; index < 4; index += 1) {
    const h = harness({ role: index < 2 ? "KLOL_MAIN" : "NEXUS_MAIN", registry: r });
    assert.equal(h.router(notification({ shortcutId: ids[index] })), true);
    assert.equal(h.calls[0][0], names[index]);
    assert.equal(h.calls[0][9], ids[index]);
  }
  const h = harness();
  assert.equal(h.router(notification({ shortcutId: 101 })), false, "numeric shortcut IDs must not be coerced");
  for (const shortcutId of [null, undefined, "", "unknown", "101 ", "101\u0000", "prefix101", "101suffix"]) {
    assert.equal(h.router(notification({ shortcutId })), false);
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.router(notification({ shortcutId: "101", extras: { threadId: 0 } })), true, "zero Kakao subthread field cannot block an explicit shortcut binding");
});

test("exactly one usable freeform reply Action is required", () => {
  const cases = [null, [], [action("choice", [input("choice", false)])],
    [action("first"), action("second")], [action("missing-key", [input(null)])],
    [{ actionIntent: null, getRemoteInputs: () => [input()] }],
  ];
  for (const actions of cases) {
    const h = harness();
    assert.equal(h.router(notification({ notification: { actions } })), false);
    assert.equal(h.calls.length, 0);
    assert.equal(h.replies.length, 0);
  }
  const h = harness();
  assert.equal(h.router(notification({ notification: { actions: [action("ignored", []), action("chosen")] } })), true);
  assert.equal(h.replies[0].action, "chosen");
});

test("duplicates are suppressed but unseen post-boot messages delivered out of order are preserved", () => {
  const h = harness();
  assert.equal(h.router(notification({ message: { time: 1003 } })), true);
  assert.equal(h.router(notification({ message: { time: 1003 } })), false);
  assert.equal(h.router(notification({ message: { time: 1002, text: "delayed-command" } })), true);
  assert.equal(h.router(notification({ message: { time: 1004 } })), true);
  assert.equal(h.calls.length, 3);
  assert.notEqual(h.calls[0][8], h.calls[1][8]);
});

test("exact chatLogId dedupes a repeated message even when notification key changes", () => {
  const h = harness();
  assert.equal(h.router(notification({ extras: { chatLogId: "9007199254740993" }, key: "first" })), true);
  assert.equal(h.router(notification({ extras: { chatLogId: "9007199254740993" }, key: "second" })), false);
  assert.equal(h.router(notification({ extras: { chatLogId: "9007199254740994" }, key: "second" })), true);
  assert.equal(h.calls.length, 2);
});

test("failed reply retries preserve the request identity; accepted reply followed by error cannot duplicate", () => {
  const seen = [];
  let attempts = 0;
  const h = harness({ handler(...args) { seen.push(args[8]); args[4].reply("synthetic"); }, io: {
    makeReplier: () => ({ reply() { attempts += 1; if (attempts === 1) throw new Error("synthetic-canceled"); return true; } }),
  } });
  assert.equal(h.router(notification()), false);
  assert.equal(h.router(notification()), true);
  assert.equal(h.router(notification()), false);
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
  const accepted = harness({ handler(...args) { args[4].reply("synthetic"); throw new Error("after-accept"); } });
  assert.equal(accepted.router(notification()), false);
  assert.equal(accepted.router(notification()), false);
  assert.equal(accepted.replies.length, 1);
  assert.equal(accepted.depth(), 0);
});

test("a false reply remains retryable and ignored ordinary messages do not flood logs", () => {
  let sends = 0;
  const h = harness({ io: { makeReplier: () => ({ reply() { sends += 1; return sends > 1; } }) } });
  assert.equal(h.router(notification()), true);
  assert.equal(h.router(notification()), true);
  assert.equal(h.router(notification()), false);
  assert.equal(sends, 2);
  const ignored = harness({ handler() {} });
  assert.equal(ignored.router(notification({ message: { text: "synthetic-ordinary-conversation" } })), true);
  assert.equal(ignored.router(notification({ message: { text: "synthetic-ordinary-conversation" } })), false);
  assert.deepEqual(ignored.logs, [{ code: "LOAD", role: "KLOL_MAIN" }]);
});

test("routing acquires a blocking lock rather than dropping commands under contention; reentry is rejected", () => {
  const h = harness(); h.lock.busy = true;
  assert.equal(h.router(notification()), true);
  assert.equal(h.router(notification({ message: { time: 1002 } })), true);
  assert.equal(h.calls.length, 2);
  let nested, count = 0;
  const recursive = harness({ handler() { count += 1; nested = recursive.router(notification({ message: { time: 1002 } })); } });
  assert.equal(recursive.router(notification()), true);
  assert.equal(nested, false);
  assert.equal(count, 1);
  assert.equal(recursive.depth(), 0);
});

test("active binding snapshot cannot silently change after an accepted route", () => {
  const h = harness();
  assert.equal(h.router(notification()), true);
  const changed = registry(); changed.revision = "synthetic-v2";
  h.setRegistry(changed);
  assert.equal(h.router(notification({ message: { time: 1002 } })), false);
  assert.equal(h.calls.length, 1);
});

test("stop disables queued callbacks and revokes retained companion Repliers", () => {
  let retained;
  const h = harness({ role: "KLOL_NOTICE", handler(...args) { retained = args[4]; } });
  assert.equal(h.router(notification({ shortcutId: "102" })), true);
  retained.reply("synthetic-before-stop");
  h.router.stop();
  assert.throws(() => retained.reply("synthetic-after-stop"), /ROOM_ROUTER_STOPPED/);
  assert.equal(h.router(notification({ shortcutId: "102", message: { time: 1002 } })), false);
  assert.equal(h.replies.length, 1);
  assert.equal(h.reads.length, 1);
  assert.equal(h.depth(), 0);
});

test("native Replier captures the exact pending action, uses flags zero, and cannot retarget on a later notification", () => {
  const sent = [], captured = [];
  const platform = {
    content: { Intent: function () { this.flags = 0; } },
    os: { Bundle: function () { this.values = {}; this.putCharSequence = (key, value) => { this.values[key] = value; }; } },
    app: { RemoteInput: { addResultsToIntent(inputs, intent, results) { intent.inputs = inputs; intent.results = results.values; } } },
  };
  const contextValue = {};
  const h = harness({ globals: { Packages: { android: platform }, Api: { getContext: () => contextValue } }, io: { makeReplier: undefined }, handler(...args) { captured.push(args[4]); } });
  const first = action("first", [input("one"), input("two", false)]);
  first.actionIntent = { send(context, code, intent) { sent.push({ id: "first", context, code, intent }); } };
  const second = action("second");
  second.actionIntent = { send(context, code, intent) { sent.push({ id: "second", context, code, intent }); } };
  h.router(notification({ notification: { actions: [first] } }));
  h.router(notification({ message: { time: 1002 }, notification: { actions: [second] } }));
  first.actionIntent = second.actionIntent;
  captured[0].reply("synthetic-first-reply");
  captured[1].reply("synthetic-second-reply");
  assert.deepEqual(sent.map((entry) => entry.id), ["first", "second"]);
  assert.equal(sent[0].context, contextValue);
  assert.equal(sent[0].code, 0);
  assert.equal(sent[0].intent.flags, 0);
  assert.deepEqual(sent[0].intent.results, { one: "synthetic-first-reply", two: "synthetic-first-reply" });
});

test("native Long boundary self-tests direct and Android Bundle paths without assuming longValue exists", () => {
  const exact = { toString: (value) => typeof value === "object" ? value.exact : String(value),
    valueOf: (value) => ({ exact: value }) };
  const android = { os: { Bundle: function () {
    const values = {};
    this.putLong = (key, value) => { values[key] = value; };
    this.getLong = (key) => values[key];
  } } };
  const h = harness({ globals: { java: { lang: { Long: exact } }, android }, io: { readLong: undefined } });
  assert.equal(h.router(notification({ extras: { chatLogId: { exact: "9007199254740993" } } })), true);
  const expectedId = createHash("sha256").update(JSON.stringify(["KLOL_MAIN", "0", "101", "chatLogId", "9007199254740993"])).digest("hex");
  assert.equal(h.calls[0][8], "room-v1-" + expectedId);
  const brokenLong = { ...exact, toString: (value) => String(Number(typeof value === "object" ? value.exact : value)) };
  assert.throws(() => harness({ globals: { java: { lang: { Long: brokenLong } }, android }, io: { readLong: undefined } }), /ROOM_LONG_UNSAFE/);
  const brokenBundle = { os: { Bundle: function () {
    let value;
    this.putLong = (_, item) => { value = item; };
    this.getLong = () => Number(value.exact);
  } } };
  assert.throws(() => harness({ globals: { java: { lang: { Long: exact } }, android: brokenBundle }, io: { readLong: undefined } }), /ROOM_LONG_UNSAFE/);
});
