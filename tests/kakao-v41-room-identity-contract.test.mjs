import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");

test("room identity is derived only from the callback room string and the private identity secret", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  const identityBody = transport.match(/function identityForChat\(room, sender\) \{([\s\S]*?)\n  \}/u)?.[1] ?? "";
  assert.match(identityBody, /var secret = identitySecret\(\)/u);
  assert.match(identityBody, /"room-id\\n" \+ trimText\(room\)/u);
  assert.doesNotMatch(identityBody.match(/roomId:[^\n]+/u)?.[0] ?? "", /sender/u);
  assert.match(identityBody, /"sender-id\\n" \+ trimText\(sender\)/u);
});

test("legacy callback argument order remains room, message, sender", async () => {
  const router = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js"), "utf8");
  assert.match(router, /function response\(room, msg, sender, isGroupChat, replier, imageDB, packageName\)/u);
  assert.match(router, /KLOL_V2_KAKAO\.contextFromChat\(room, sender/u);
});

test("room normalization deliberately trims edges only to retain existing allowlist IDs", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  assert.match(transport, /function trimText\(value\) \{\s*return String\(value == null \? "" : value\)\.replace\(\/\^\\s\+\|\\s\+\$\/g, ""\);\s*\}/u);
  assert.doesNotMatch(transport, /normalize\(["']NFKC["']\)/u);
  assert.doesNotMatch(transport, /room-id\\n[^\n]*replace\([^\n]*(?:200B|200C|200D|FEFF)/u);
});
