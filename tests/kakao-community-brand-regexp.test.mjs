import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `
  import { SERVICE_BRAND } from './src/lib/service-brand.ts';
  import { KAKAO_INHOUSE_FORM_HEADER, KAKAO_SERVICE_NAME_PATTERN, KAKAO_SERVICE_SHORT_NAME_PATTERN } from './src/modules/recruiting/kakao-v4/service-brand.ts';
  import { parsePartyForm } from './src/modules/recruiting/kakao-v4/party-snapshot-parser.ts';
  import './src/modules/recruiting/kakao-v4/classifier.ts';
  import './src/modules/recruiting/kakao-v4/canonical-command.ts';
  const rows = ['1.', '2.', '예비 1.'];
  const full = parsePartyForm(['[' + SERVICE_BRAND.name + ' 구인상세 #12]', '#12 · 2인 파티 · 0/2', ...rows].join('\\n'));
  const compact = parsePartyForm(['[파티 #12] 2인 파티 · 0/2명', '양식코드: ABCDE-23456', ...rows].join('\\n'));
  const prefixes = parsePartyForm(['2인 파티 구인', '모집번호: #12', '시작 시간:', '[' + SERVICE_BRAND.shortName + ' 구인구직 양식]', '1.', SERVICE_BRAND.shortName + ' 구인구직 양식]', '2.', '예비 1.'].join('\\n'));
  process.stdout.write(JSON.stringify({
    name: SERVICE_BRAND.name, shortName: SERVICE_BRAND.shortName,
    full: { decision: full.decision, number: full.recruitNumber },
    compact: { decision: compact.decision, number: compact.recruitNumber, text: compact.normalizedText },
    prefixSlot: prefixes.slots.find(slot => slot.kind === 'NUMBERED' && slot.slotNo === 1)?.state,
    prefixStart: prefixes.startTime.state,
    exactHeader: KAKAO_INHOUSE_FORM_HEADER.test('[' + SERVICE_BRAND.name + ' 내전 구인 양식]'),
    foreignHeader: KAKAO_INHOUSE_FORM_HEADER.test('[다른 커뮤니티 내전 구인 양식]'),
    exactName: new RegExp('^(?:' + KAKAO_SERVICE_NAME_PATTERN + ')$', 'u').test(SERVICE_BRAND.name),
    exactShortName: new RegExp('^(?:' + KAKAO_SERVICE_SHORT_NAME_PATTERN + ')$', 'u').test(SERVICE_BRAND.shortName),
  }));
`;

for (const name of [
  "GG HUB worker QA (임시 비공개)",
  "커뮤니티 (미완성",
  "커뮤니티 [미완성",
  "커뮤니티 .+?^${}()|[]\\",
  "테스트 $1 $& [클럽]",
]) {
  test(`managed community branding is literal during parser initialization and copied forms: ${name}`, () => {
    const shortName = name.slice(0, 24);
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
      cwd: root, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, NEXT_PUBLIC_SERVICE_ID: "community", NEXT_PUBLIC_COMMUNITY_ID: "qa-brand-regexp",
        NEXT_PUBLIC_COMMUNITY_NAME: name, NEXT_PUBLIC_COMMUNITY_SHORT_NAME: shortName },
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const result = JSON.parse(child.stdout);
    assert.equal(result.name, name); assert.equal(result.shortName, shortName);
    assert.deepEqual(result.full, { decision: "EXACT", number: 12 });
    assert.equal(result.compact.decision, "EXACT"); assert.equal(result.compact.number, 12);
    assert.ok(result.compact.text.startsWith(`[${name} 구인상세 #12]\n`));
    assert.equal(result.prefixSlot, "PRESENT_EMPTY"); assert.equal(result.prefixStart, "PRESENT_EMPTY");
    assert.equal(result.exactHeader, true); assert.equal(result.foreignHeader, false);
    assert.equal(result.exactName, true); assert.equal(result.exactShortName, true);
  });
}
