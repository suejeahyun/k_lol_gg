import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `
  import assert from 'node:assert/strict';
  import { SERVICE_BRAND } from './src/lib/service-brand.ts';
  import { KakaoV4CommandService } from './src/modules/recruiting/kakao-v4/application.ts';
  import { KakaoV4CommandDispatcher } from './src/modules/recruiting/kakao-v4/dispatcher.ts';
  import { canonicalizeKakaoV4Command } from './src/modules/recruiting/kakao-v4/canonical-command.ts';
  import { classifyKakaoV4Command } from './src/modules/recruiting/kakao-v4/classifier.ts';
  import { parsePartyForm } from './src/modules/recruiting/kakao-v4/party-snapshot-parser.ts';
  import { v1StrictPartyTemplate } from './src/modules/recruiting/kakao-v4/v1-strict-party-replies.ts';
  import { hasForeignKakaoServiceHeader } from './src/modules/recruiting/kakao-v4/service-brand.ts';
  const now = new Date('2026-10-27T12:00:00Z'), newline = String.fromCharCode(10);
  let sequence = 0;
  const envelope = (profileId, text) => ({ profileId, installationId: 'install-' + '1'.repeat(32),
    senderId: 'sender-user-' + '2'.repeat(32), eventId: 'event-brand-' + ++sequence,
    timestamp: now.getTime() / 1000, nonce: '3'.repeat(32), text });
  const parse = (profileId, text) => {
    const input = envelope(profileId, text);
    const classification = classifyKakaoV4Command(input);
    return { classification, command: canonicalizeKakaoV4Command(classification, input, now) };
  };
  const template = v1StrictPartyTemplate({ recruitNumber: 12, recruitDate: '2026-10-27',
    partyType: 'PARTY_NUMBER', title: '5인 파티 구인', maximumMembers: 5 });
  assert.ok(template.startsWith('[' + SERVICE_BRAND.name + ' 구인상세 #12]'));
  const filled = template.replace(newline + '1.', newline + '1. 합성 참가자');
  const detail = parsePartyForm(filled);
  assert.equal(detail.decision, 'EXACT');
  assert.equal(detail.rawText, filled);
  assert.equal(detail.slots[0].value, '합성 참가자');
  const party = parse('RECRUIT', filled);
  assert.equal(party.classification.kind, 'SNAPSHOT');
  assert.equal(party.command.domain, 'PARTY');
  assert.equal(party.command.action, 'SYNC');
  assert.equal(party.command.payload.members[0].name, '합성 참가자');
  const inhouse = ['[' + SERVICE_BRAND.name + ' 내전 구인 양식]', '📢 내전하실분 #1', '》협곡',
    '》2026-10-27 21:00 시작', '👥 0/10명', '》게임정보 : 합성 내전', '》주최자 : 합성 주최자',
    ...Array.from({ length: 10 }, (_, i) => (i + 1) + '.'), '예비 1.'].join(newline);
  const season = parse('FEATURES', inhouse);
  assert.equal(season.classification.command, 'INHOUSE_SNAPSHOT');
  assert.equal(season.command.domain, 'SEASON');
  assert.equal(season.command.action, 'SYNC');
  assert.equal(season.command.roundMetadata.organizerText, '합성 주최자');
  const foreignName = SERVICE_BRAND.id === 'nexus' ? 'K-LOL.GG' : 'NEXUS.GG';
  for (const [profile, text] of [['RECRUIT', filled], ['FEATURES', inhouse]]) {
    const foreign = text.replaceAll(SERVICE_BRAND.name, foreignName);
    assert.equal(hasForeignKakaoServiceHeader(foreign), true);
    assert.equal(parse(profile, foreign).classification.kind, 'UNKNOWN');
    assert.equal(parse(profile, foreign).command, null);
  }
  assert.equal(parsePartyForm(filled.replaceAll(SERVICE_BRAND.name, foreignName)).decision, 'REJECT');
  const authorizer = { async authorizeProfile(input) { return { roomId: '00000000-0000-4000-8000-000000000001',
    roomStatus: 'ACTIVE', capabilityProfile: input.requiredCapabilityProfile, installationId: '00000000-0000-4000-8000-000000000002' }; } };
  const dispatcher = new KakaoV4CommandDispatcher({ recruiting: {}, assistant: {
    async recordV4StaticReply(input) { return { body: { legacyReply: input.legacyReply }, replayed: false }; }
  } });
  const service = new KakaoV4CommandService(authorizer, dispatcher, () => now);
  const help = await service.execute(envelope('RECRUIT', '구인도우미'), 'current');
  const registration = await service.execute(envelope('FEATURES', '등록'), 'current');
  for (const result of [help, registration]) {
    assert.ok(result.reply.includes(SERVICE_BRAND.name));
    assert.ok(result.reply.includes(process.env.NEXT_PUBLIC_SITE_URL));
    assert.equal(result.reply.includes(foreignName), false);
    if (SERVICE_BRAND.id === 'nexus') assert.equal(result.reply.includes('k-lol-gg.vercel.app'), false);
  }
  process.stdout.write(JSON.stringify({ name: SERVICE_BRAND.name, party: party.command.action, inhouse: season.command.action }));
`;

for (const [service, origin] of [["klol", "https://k-lol-gg.vercel.app"], ["nexus", "https://nexus-gg.vercel.app"]]) {
  test(`${service}: generated Kakao forms round-trip only within their service and replies use that site's links`, () => {
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
      cwd: root,
      env: { ...process.env, NEXT_PUBLIC_SERVICE_ID: service, NEXT_PUBLIC_SITE_URL: origin },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    assert.equal(JSON.parse(child.stdout).name, service === "nexus" ? "NEXUS.GG" : "K-LOL.GG");
  });
}
