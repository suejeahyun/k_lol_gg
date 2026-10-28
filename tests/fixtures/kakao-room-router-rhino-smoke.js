/* eslint-disable */
/* Optional actual-JVM smoke: run with Rhino -strict -w -fatal-warnings.
 * Uses only synthetic notifications and fake Repliers. No Android/device IO.
 */
var module = { exports: {} };
// JVM Rhino has no Android classes. This synthetic Bundle retains the actual
// Java Long object through a Java map; real Android putLong/getLong is separately
// verified by the phone's diagnostic, without a longValue() JS member call.
var android = { os: { Bundle: function () {
  var values = new java.util.HashMap();
  this.putLong = function (key, value) { values.put(key, value); };
  this.getLong = function (key) { return values.get(key); };
} } };
load("integrations/messengerbot-r/room-routing/KAKAO_ROOM_ROUTER.js");
var checks = 0;
function verify(condition) { checks += 1; if (!condition) throw new Error("ROUTER_SMOKE_FAILED_" + checks); }
var bindings = { version: 1, revision: "synthetic-rhino", slots: {
  KLOL_MAIN: { user: "0", shortcutId: "9007199254740993" },
  KLOL_RECRUIT: { user: "0", shortcutId: "9007199254740994" },
  NEXUS_MAIN: { user: "0", shortcutId: "room:000123" },
  NEXUS_RECRUIT: { user: "0", shortcutId: "conversation_opaque-4" }
} };
function syntheticBundle(values) {
  return { get: function (key) { return values[key] == null ? null : values[key]; },
    getLong: function (key) { return java.lang.Long.valueOf(values[key]).longValue(); } };
}
function syntheticNotification(slot, time, chatId) {
  var latest = syntheticBundle({ text: "synthetic-command", time: time, sender: "synthetic-member" });
  var extras = syntheticBundle({ threadId: 0, chatLogId: chatId, "android.messages": [latest] });
  var remoteInput = { getResultKey: function () { return "synthetic-result"; }, getAllowFreeFormInput: function () { return true; } };
  var selectedAction = { actionIntent: {}, getRemoteInputs: function () { return [remoteInput]; } };
  return { getPackageName: function () { return "com.kakao.talk"; },
    getUser: function () { return { getIdentifier: function () { return 0; } }; },
    getKey: function () { return "synthetic-notification"; },
    getNotification: function () { return { flags: 0, extras: extras, actions: [selectedAction],
      getShortcutId: function () { return bindings.slots[slot].shortcutId; } }; } };
}
var replies = new java.util.concurrent.atomic.AtomicInteger(0);
function options() {
  return { now: function () { return 1000; }, read: function () { return JSON.stringify(bindings); },
    log: function () {}, makeReplier: function () { return { reply: function () { replies.incrementAndGet(); return true; } }; } };
}
var slots = ["KLOL_MAIN", "KLOL_RECRUIT", "NEXUS_MAIN", "NEXUS_RECRUIT"];
var roles = ["KLOL_MAIN", "KLOL_NOTICE", "NEXUS_MAIN", "NEXUS_NOTICE"];
var expected = [[true, true, false, false], [false, true, false, false], [false, false, true, true], [false, false, false, true]];
var roleIndex, slotIndex, calls, callback;
for (roleIndex = 0; roleIndex < roles.length; roleIndex += 1) {
  for (slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    calls = 0;
    callback = module.exports.create(roles[roleIndex], function (room, text, sender, group, replier, image, appPackage, mention, logId, shortcutId) {
      calls += 1;
      verify(shortcutId === bindings.slots[slots[slotIndex]].shortcutId);
      verify(/^room-v1-[a-f0-9]{64}$/.test(logId));
      replier.reply("synthetic-result");
    }, options());
    verify(callback(syntheticNotification(slots[slotIndex], 1001, "9007199254740995")) === expected[roleIndex][slotIndex]);
    verify(calls === (expected[roleIndex][slotIndex] ? 1 : 0));
    callback.stop();
  }
}
// Real Java threads exercise the actual ReentrantLock and exact JVM Long paths.
var entered = new java.util.concurrent.CountDownLatch(1);
var running = new java.util.concurrent.atomic.AtomicInteger(0);
var completed = new java.util.concurrent.atomic.AtomicInteger(0);
var overlaps = new java.util.concurrent.atomic.AtomicInteger(0);
var successful = new java.util.concurrent.atomic.AtomicInteger(0);
var retained = null;
var concurrent = module.exports.create("KLOL_MAIN", function (room, text, sender, group, replier) {
  if (running.incrementAndGet() !== 1) overlaps.incrementAndGet();
  entered.countDown();
  java.lang.Thread.sleep(60);
  retained = replier;
  replier.reply("synthetic-result");
  running.decrementAndGet();
  completed.incrementAndGet();
}, options());
var first = new java.lang.Thread(new java.lang.Runnable({ run: function () {
  if (concurrent(syntheticNotification("KLOL_MAIN", 1002, "9007199254740996"))) successful.incrementAndGet();
} }));
var second = new java.lang.Thread(new java.lang.Runnable({ run: function () {
  if (concurrent(syntheticNotification("KLOL_MAIN", 1001, "9007199254740997"))) successful.incrementAndGet();
} }));
first.start();
verify(entered.await(5, java.util.concurrent.TimeUnit.SECONDS));
second.start();
first.join(5000);
second.join(5000);
verify(!first.isAlive() && !second.isAlive());
verify(completed.get() === 2 && successful.get() === 2);
verify(overlaps.get() === 0);
verify(concurrent(syntheticNotification("KLOL_MAIN", 1002, "9007199254740996")) === false);
verify(concurrent(syntheticNotification("KLOL_MAIN", 1000, "9007199254740998")) === false);
concurrent.stop();
var stoppedError = false, beforeStopSend = replies.get();
try { retained.reply("synthetic-stopped"); } catch (expectedStopped) { stoppedError = true; }
verify(stoppedError && replies.get() === beforeStopSend);
verify(concurrent(syntheticNotification("KLOL_MAIN", 1003, "9007199254740999")) === false);
print("ROOM_ROUTER_RHINO_PASS checks=" + checks + " concurrency=2 overlap=0");
