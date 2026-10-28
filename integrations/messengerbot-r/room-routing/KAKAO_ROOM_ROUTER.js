/* eslint-disable */
/* Legacy MessengerBot R: explicitly bound Android conversation shortcuts only.
 * No title/sender room inference, global reply cache, network or registry writes.
 * This module must be installed as global_modules/KAKAO_ROOM_ROUTER.js.
 */
var ROOM_ROUTER_VERSION = "1.0.0";
var ROOM_BINDING_KEY = "KAKAO_ROOM_BINDINGS_V1";
var ROOM_SLOTS = ["KLOL_MAIN", "KLOL_RECRUIT", "NEXUS_MAIN", "NEXUS_RECRUIT"];
var ROOM_NAMES = ["LOL - K", "K롤방 구인구직방", "NEXUS", "NEXUS구인구직방"];
var ROOM_ROLES = { KLOL_MAIN: [0, 1], KLOL_NOTICE: [1], NEXUS_MAIN: [2, 3], NEXUS_NOTICE: [3] };
function roomPositiveLong(value) {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
    (value.length < 19 || value <= "9223372036854775807");
}
function roomUser(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,9})$/.test(value) &&
    (value.length < 10 || value <= "2147483647");
}
function roomShortcut(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    !/[\s\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/.test(value);
}
function roomRegistry(raw) {
  if (raw == null || String(raw).length > 4096) return null;
  var value = JSON.parse(String(raw)), keys, index, other, slot;
  if (!value || value.version !== 1 || typeof value.revision !== "string" ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(value.revision) || !value.slots ||
      Object.prototype.toString.call(value.slots) !== "[object Object]") return null;
  keys = Object.keys(value.slots);
  if (keys.length !== ROOM_SLOTS.length) return null;
  for (index = 0; index < ROOM_SLOTS.length; index += 1) {
    slot = value.slots[ROOM_SLOTS[index]];
    if (!slot || !roomUser(slot.user) || !roomShortcut(slot.shortcutId)) return null;
    // A repeated shortcut is rejected even across Android users. Never guess
    // whether a collision denotes another room, service or phone profile.
    for (other = 0; other < index; other += 1) {
      if (value.slots[ROOM_SLOTS[other]].shortcutId === slot.shortcutId) return null;
    }
  }
  return value;
}
function roomNativeLongReader() {
  var LongType = java.lang.Long, probe = "9007199254740993";
  var platform = typeof android !== "undefined" ? android : Packages.android;
  var probeBundle = new platform.os.Bundle();
  probeBundle.putLong("value", LongType.valueOf(probe));
  // Keep Java Long objects on both sides of the overload. String(raw), +raw,
  // JSON and intermediate JS arithmetic would silently round large message IDs.
  // MessengerBot's custom wrapper exposes Long as a number without longValue.
  // Test the actual Android Bundle boundary instead of calling that member.
  if (String(LongType.toString(LongType.valueOf(probe))) !== probe ||
      String(LongType.toString(probeBundle.getLong("value"))) !== probe) {
    throw new Error("ROOM_LONG_UNSAFE");
  }
  return function (bundle, key) {
    if (!bundle || bundle.get(key) == null) return null;
    var value = String(LongType.toString(bundle.getLong(key)));
    return roomPositiveLong(value) ? value : null;
  };
}
function roomNativeDigest(value) {
  var bytes = java.security.MessageDigest.getInstance("SHA-256").digest(
    new java.lang.String(value).getBytes(java.nio.charset.StandardCharsets.UTF_8));
  var out = "", index, part;
  for (index = 0; index < bytes.length; index += 1) {
    part = bytes[index] & 255;
    out += (part < 16 ? "0" : "") + String(java.lang.Integer.toHexString(part));
  }
  return out;
}
function roomNativeReplier(action) {
  var platform = typeof android !== "undefined" ? android : Packages.android;
  var pending = action.actionIntent, inputs = action.getRemoteInputs(), keys = [], index;
  var context = Api.getContext();
  for (index = 0; index < inputs.length; index += 1) keys.push(String(inputs[index].getResultKey()));
  // All session objects are captured here, never looked up from a later room
  // notification. Companion workers may retain this exact closure safely.
  return { reply: function (text) {
    var intent = new platform.content.Intent(), results = new platform.os.Bundle(), position;
    for (position = 0; position < keys.length; position += 1) results.putCharSequence(keys[position], String(text));
    platform.app.RemoteInput.addResultsToIntent(inputs, intent, results);
    pending.send(context, 0, intent);
    return true;
  } };
}
function roomReplyAction(notification) {
  var actions = notification.actions, selected = null, index, inputIndex, action, inputs, freeform, key;
  if (!actions || actions.length > 32) return null;
  for (index = 0; index < actions.length; index += 1) {
    action = actions[index];
    if (!action || !action.actionIntent) continue;
    inputs = action.getRemoteInputs();
    if (!inputs || inputs.length === 0 || inputs.length > 32) continue;
    freeform = false;
    for (inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
      key = inputs[inputIndex].getResultKey();
      if (key == null || String(key).length === 0) return null;
      if (inputs[inputIndex].getAllowFreeFormInput()) freeform = true;
    }
    if (freeform) {
      if (selected) return null;
      selected = action;
    }
  }
  return selected;
}
function create(role, handler, supplied) {
  if (!Object.prototype.hasOwnProperty.call(ROOM_ROLES, role) || typeof handler !== "function") throw new Error("ROOM_ROLE_INVALID");
  var io = supplied || {};
  function option(key) { return Object.prototype.hasOwnProperty.call(io, key) ? io[key] : null; }
  var now = option("now") || function () { return new Date().getTime(); };
  var read = option("read") || function () { return DataBase.getDataBase(ROOM_BINDING_KEY); };
  var makeReplier = option("makeReplier") || roomNativeReplier;
  var digest = option("digest") || roomNativeDigest, readLong = option("readLong") || roomNativeLongReader();
  var lock = option("lock") || new java.util.concurrent.locks.ReentrantLock(), logOutput = option("log");
  var boot = Number(now()), seen = {}, order = [], active = false, pinned = null, stopped = false;
  function log(code) {
    try {
      if (logOutput) logOutput(code, role);
      else Log.i("[ROOM_ROUTER_1] " + role + " " + code);
    } catch (ignoredLog) {}
  }
  function complete(key) {
    seen[key] = true;
    order.push(key);
    if (order.length > 256) delete seen[order.shift()];
  }
  if (!isFinite(boot) || boot < 0) throw new Error("ROOM_CLOCK_INVALID");
  log("LOAD");
  function route(sbn) {
    var acquired = false, entered = false;
    try {
      if (stopped || !sbn || String(sbn.getPackageName()) !== "com.kakao.talk") return false;
      var notification = sbn.getNotification();
      if (!notification || (Number(notification.flags) & 512) !== 0 || !notification.extras) return false;
      var extras = notification.extras, messages = extras.get("android.messages");
      if (!messages || !messages.length) return false;
      var latest = messages[messages.length - 1], textValue = latest.get("text"), timeValue = latest.get("time");
      var timestamp = Number(timeValue);
      if (textValue == null || !isFinite(timestamp) || Math.floor(timestamp) !== timestamp ||
          timestamp <= boot || timestamp > 9007199254740991) return false;
      var text = String(textValue);
      if (text.length === 0) return false;
      var person = latest.get("sender_person"), senderValue = null;
      if (person && person.getName) senderValue = person.getName();
      if (senderValue == null || String(senderValue).length === 0) senderValue = latest.get("sender");
      if (senderValue == null || String(senderValue).length === 0) return false;
      // getShortcutId identifies the Android conversation. Kakao's extras
      // threadId may be zero/a message subthread and is never a room identity.
      var shortcutValue = notification.getShortcutId();
      if (shortcutValue == null || typeof shortcutValue === "number" || typeof shortcutValue === "boolean") return false;
      var sender = String(senderValue), shortcut = String(shortcutValue);
      var user = String(sbn.getUser().getIdentifier());
      if (!roomShortcut(shortcut) || !roomUser(user)) return false;
      // The one lock protects both dedupe state and the existing mutable
      // transport gateway. A recursive same-thread callback is rejected too.
      lock.lock(); acquired = true;
      if (active || stopped) return false;
      active = true; entered = true;
      var registry = roomRegistry(read()), allowed = ROOM_ROLES[role], slotIndex = -1, index, candidate;
      if (!registry) return false;
      var registryToken = JSON.stringify(registry);
      if (pinned !== null && registryToken !== pinned) return false;
      for (index = 0; index < allowed.length; index += 1) {
        candidate = registry.slots[ROOM_SLOTS[allowed[index]]];
        if (candidate.user === user && candidate.shortcutId === shortcut) slotIndex = allowed[index];
      }
      if (slotIndex < 0) return false;
      var action = roomReplyAction(notification);
      if (!action) return false;
      var chatLog = readLong(extras, "chatLogId"), notificationKey = sbn.getKey();
      if (notificationKey == null || String(notificationKey).length === 0) return false;
      var eventParts = chatLog ? [role, user, shortcut, "chatLogId", chatLog] :
        [role, user, shortcut, String(notificationKey), timestamp, sender, text];
      var eventId = digest(JSON.stringify(eventParts));
      if (typeof eventId !== "string" || !/^[a-f0-9]{64}$/.test(eventId) || seen[eventId]) return false;
      var rawReplier = makeReplier(action);
      if (!rawReplier || typeof rawReplier.reply !== "function") return false;
      var accepted = false, failed = false, returned = false;
      var replier = { reply: function (value) {
        lock.lock();
        try {
          if (stopped) throw new Error("ROOM_ROUTER_STOPPED");
          var result = rawReplier.reply(value);
          if (result === false) failed = true;
          else accepted = true;
          return result;
        } catch (failure) { failed = true; throw failure; }
        finally { lock.unlock(); }
      } };
      pinned = registryToken;
      if (stopped) return false;
      if (/^\/?(봇버전|사이트알림버전|사이트알림상태|연결진단)$/.test(text)) log("ROUTED");
      try {
        handler(ROOM_NAMES[slotIndex], text, sender, true, replier, null, "com.kakao.talk", false,
          "room-v1-" + eventId, shortcut, "");
        returned = true;
      } finally {
        // A failed reply can retry the same event/request ID. Once Android
        // accepted any reply, never duplicate it because of a later exception.
        if (accepted || (returned && !failed)) complete(eventId);
      }
      return true;
    } catch (ignoredNotificationFailure) { log("ERROR"); return false; }
    finally {
      if (entered) active = false;
      if (acquired) lock.unlock();
    }
  }
  // Called by onStartCompile. Waiting for the lock lets an in-flight handler
  // finish, then revokes every retained (including companion) reply closure.
  route.stop = function () {
    lock.lock();
    try { stopped = true; } finally { lock.unlock(); }
  };
  return route;
}
module.exports = { create: create, version: ROOM_ROUTER_VERSION };
