import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("public match and player detail use the same allowlisted champion portrait with a safe fallback", () => {
  const portrait = source("src/components/champions/champion-portrait.tsx");
  const resolver = source("src/modules/champions/domain/champion-image.ts");
  const match = source("src/app/(public)/(matches)/matches/[matchId]/page.tsx");
  const player = source("src/app/(public)/(registry)/players/[playerId]/page.tsx");

  assert.match(resolver, /ddragon\.leagueoflegends\.com/);
  assert.match(resolver, /url\.search !== ""/);
  assert.match(resolver, /url\.hash !== ""/);
  assert.match(portrait, /championImageCandidates\(imageUrl, championKey, displayName, variant\)/);
  assert.match(portrait, /setFailedUrls/);
  assert.match(portrait, /챔피언 이미지 없음/);
  assert.match(match, /imageUrl=\{player\.championImageUrl\}/);
  assert.match(player, /imageUrl=\{champion\.championImageUrl\}/);
  assert.match(player, /imageUrl=\{match\.championImageUrl\}/);
});

test("my account connects bounded participation and current discipline status to details and evidence", () => {
  const account = source("src/app/(public)/account/page.tsx");
  const disciplinePage = source("src/app/(public)/account/discipline/page.tsx");
  const evidence = source("src/components/discipline/owner-discipline-tasks.tsx");
  const repository = source("src/modules/accounts/infrastructure/postgres-account-repository.ts");

  assert.match(account, /findSelfParticipations/);
  assert.match(account, /getOwnerOverview/);
  assert.match(account, /\/account\/discipline/);
  assert.match(account, /\/competitions\/events\//);
  assert.match(account, /\/competitions\/destruction\//);
  assert.match(account, /\/matches\//);
  assert.match(repository, /\.limit\(12\)/);
  assert.match(repository, /eq\(matchSeries\.status, "PUBLISHED"\)/);
  assert.match(disciplinePage, /record-\$\{record\.id\}/);
  assert.match(disciplinePage, /task-\$\{record\.taskId\}/);
  assert.match(evidence, /\/api\/me\/discipline\/tasks\/\$\{task\.id\}\/evidence/);
  assert.match(evidence, /X-Content-Sha256/);
  assert.match(evidence, /If-Match/);
  assert.match(evidence, /Idempotency-Key/);
});

test("event and destruction details retain actions while exposing readable lifecycle and result hierarchy", () => {
  const event = source("src/app/(public)/(competitions)/competitions/events/[eventId]/page.tsx");
  const destruction = source("src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx");

  assert.match(event, /EventApplicationActions/);
  assert.match(event, /statusJourney/);
  assert.match(event, /EVENT CHAMPION/);
  assert.match(event, /fixtureScore/);
  assert.match(destruction, /DestructionOwnerActions/);
  assert.match(destruction, /statusJourney/);
  assert.match(destruction, /DESTRUCTION CHAMPION/);
  assert.match(destruction, /DestructionFixture/);
  assert.match(destruction, /ResilientMediaImage/);
});
