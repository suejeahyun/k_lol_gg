import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("[R01] V4 durable receipt and nonce schema is present in the ordered migration ledger", () => {
  const journal = JSON.parse(source("drizzle/meta/_journal.json"));
  const tags = journal.entries.map((entry) => entry.tag);
  const required = [
    "0009_s09_recruiting",
    "0031_brainy_taskmaster",
    "0032_bent_ultimates",
    "0033_tan_sprite",
    "0034_kakao_room_capability_profiles",
  ];
  assert.deepEqual(required.map((tag) => tags.includes(tag)), required.map(() => true));
  assert.deepEqual([...required].sort((left, right) => tags.indexOf(left) - tags.indexOf(right)), required);

  const recruiting = source("drizzle/0009_s09_recruiting.sql");
  for (const fragment of [
    'CREATE TABLE "recruiting"."command_receipts"',
    '"key_hash" bytea NOT NULL',
    '"request_hash" bytea NOT NULL',
    '"body_digest_hex" varchar(64) NOT NULL',
    '"response_status" integer',
    '"response_json" jsonb',
    '"response_revision" bigint',
    'CREATE UNIQUE INDEX "recruiting_receipts_principal_scope_key_uidx"',
    'CREATE TABLE "recruiting"."nonce_bindings"',
    '"nonce_hash" bytea NOT NULL',
    '"binding_hash" bytea NOT NULL',
    'CREATE UNIQUE INDEX "recruiting_nonce_principal_hash_uidx"',
  ]) assert.match(recruiting, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("[R02] installation, canonical room, key and capability migrations match the runtime schema", () => {
  const installation = source("drizzle/0031_brainy_taskmaster.sql");
  const key = source("drizzle/0032_bent_ultimates.sql");
  const canonicalRoom = source("drizzle/0033_tan_sprite.sql");
  const profile = source("drizzle/0034_kakao_room_capability_profiles.sql");
  assert.match(installation, /CREATE TABLE "recruiting"\."kakao_bot_installations"/u);
  assert.match(installation, /CREATE UNIQUE INDEX "kakao_bot_installations_public_uidx"/u);
  assert.match(installation, /CREATE UNIQUE INDEX "kakao_room_members_room_sender_uidx"/u);
  assert.match(key, /ADD COLUMN "key_id" varchar\(128\) DEFAULT 'legacy' NOT NULL/u);
  assert.match(key, /ADD COLUMN "last_bot_version" varchar\(128\)/u);
  assert.match(canonicalRoom, /ADD COLUMN "canonical_room_id" uuid/u);
  assert.match(canonicalRoom, /KAKAO_INSTALLATION_MULTIPLE_ROOMS/u);
  assert.match(profile, /ENUM\('RECRUIT', 'FEATURES'\)/u);
  assert.match(profile, /"kakao_room_pairings" ADD COLUMN "capability_profile"/u);
  assert.match(profile, /"kakao_rooms" ADD COLUMN "capability_profile"/u);
});

test("[R03] V3 and V4 server intake coexist while V4 binds profile-specific installation identity", () => {
  const v4Route = source("src/app/api/integrations/kakao/v4/commands/route.ts");
  const v3Route = source("src/app/api/integrations/kakao/recruits/route.ts");
  const service = source("src/modules/recruiting/kakao-v4/application.ts");
  const shared = source("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js");
  const recruit = source("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_RECRUIT.js");
  const features = source("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_FEATURES.js");
  assert.match(v4Route, /KAKAO_V4_COMMAND_CONTRACT/u);
  assert.match(v3Route, /RECRUIT_KAKAO_ROOM_COMMAND/u);
  assert.match(shared, /installation-id\\nKLOL_V4\\n" \+ profile\(profileId\)/u);
  assert.match(recruit, /KLOL_V4_PROFILE_ID = "RECRUIT"/u);
  assert.match(features, /KLOL_V4_PROFILE_ID = "FEATURES"/u);
  assert.match(service, /requiredCapabilityProfile: envelope\.profileId/u);
});

test("[BLOCKER R04] V4 phone clients have no supported first-pairing command yet", () => {
  const shared = source("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js");
  const recruit = source("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_RECRUIT.js");
  const features = source("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_FEATURES.js");
  const service = source("src/modules/recruiting/kakao-v4/application.ts");
  assert.doesNotMatch(shared, /pair-room|pairRoom|V2방연동/u);
  assert.doesNotMatch(recruit, /pair-room|pairRoom|V2방연동/u);
  assert.doesNotMatch(features, /pair-room|pairRoom|V2방연동/u);
  assert.match(
    service,
    /async execute\([\s\S]+?await this\.authorizer\.authorizeProfile\([\s\S]+?classifyKakaoV4Command/u,
  );
});

test("[R05] documented Vercel variable names cover the V4 runtime without reading values", () => {
  const example = source(".env.example");
  for (const name of [
    "DATABASE_URL",
    "DATABASE_POOL_MAX",
    "V2_PUBLIC_ORIGIN",
    "NEXT_PUBLIC_SITE_URL",
    "KAKAO_WEBHOOK_SECRET_CURRENT",
    "KAKAO_WEBHOOK_KEY_ID_CURRENT",
    "KAKAO_WEBHOOK_SECRET_PREVIOUS",
    "KAKAO_WEBHOOK_KEY_ID_PREVIOUS",
  ]) assert.match(example, new RegExp(`^${name}=`, "mu"));
});
