import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("챔피언 이미지 projection은 0025 적용 전에도 공개 통계·목록 조회를 유지한다", () => {
  const projection = source("../src/modules/champions/infrastructure/champion-image-projection.ts");
  const statistics = source("../src/modules/statistics/infrastructure/postgres-statistics-query-repository.ts");
  const champions = source("../src/modules/champions/infrastructure/postgres-champion-query-repository.ts");
  assert.match(projection, /to_jsonb\("champions"\) ->> 'image_url'/);
  assert.equal((statistics.match(/championImageUrlProjection\(\)/g) ?? []).length, 2);
  assert.match(champions, /imageUrl: championImageUrlProjection\(\)/);
  assert.doesNotMatch(statistics, /championImageUrl: championCatalog\.imageUrl/);
});

test("플레이어 공개 프로필은 실제 경기 KDA와 신청 포지션 배치·팀 밸런스 점수를 함께 설명한다", () => {
  const contract = source("../src/modules/statistics/application/ports/statistics-query-repository.ts");
  const repository = source("../src/modules/statistics/infrastructure/postgres-statistics-query-repository.ts");
  const page = source("../src/app/(public)/(registry)/players/[playerId]/page.tsx");

  assert.match(contract, /averageKda: number \| null/);
  assert.match(contract, /nonPreferred: number/);
  assert.match(contract, /unclassified: number/);
  assert.match(repository, /greatest\(\$\{matchParticipants\.deaths\}, 1\)/);
  assert.match(repository, /jsonb_array_elements\(coalesce\(\$\{teamBalanceDraftParticipants\.eligiblePositionsJson\}/);
  assert.match(repository, /jsonb_array_elements\(coalesce\(\$\{teamBalanceDraftCandidates\.assignmentsJson\}/);
  assert.match(repository, /count\(\*\) filter \(where \$\{assignedPreference\} = 'AUTO'\)/);
  assert.match(repository, /eq\(matchSeries\.status, "PUBLISHED"\)/);
  assert.match(page, /평균 KDA/);
  assert.match(page, /주 \{statisticsResult\.data\.performance\.assignmentGames\.main\}/);
  assert.match(page, /ALL \{statisticsResult\.data\.performance\.assignmentGames\.all\}/);
  assert.match(page, /비선호 \{statisticsResult\.data\.performance\.assignmentGames\.nonPreferred\}/);
  assert.match(page, /실제 배치 당시 유효 점수 평균/);
});

test("공개 Riot 읽기는 API·RSO 비밀 구성과 분리되고 UI가 미연동·대기·오류를 구분한다", () => {
  const runtime = source("../src/modules/riot/infrastructure/runtime-riot.ts");
  const route = source("../src/app/api/riot/player/[playerId]/summary/route.ts");
  const page = source("../src/app/(public)/(registry)/players/[playerId]/page.tsx");
  const publicLoader = runtime.slice(runtime.indexOf("export async function loadRuntimePublicRiotProfile"));
  assert.match(publicLoader, /V2_PUBLIC_DATA_SOURCE/);
  assert.match(publicLoader, /PostgresPublicRiotQueryRepository/);
  assert.doesNotMatch(publicLoader, /readRiotProductionConfiguration|getRuntimeRiot/);
  assert.match(route, /isPublicRiotPlayerId/);
  assert.match(route, /loadRuntimePublicRiotProfile/);
  assert.doesNotMatch(route, /getRuntimeRiot/);
  assert.match(page, /Riot 계정을 연결하지 않았어요/);
  assert.match(page, /공개 전적을 아직 동기화하지 않았어요/);
  assert.match(page, /Riot 전적을 불러오지 못했습니다/);
});
