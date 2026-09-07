import assert from "node:assert/strict";
import test from "node:test";

import { toPublicMatchPlayerDto } from "../src/modules/matches/domain/match";

test("public match player DTO is an exact safe allowlist including inactive profile policy", () => {
  const dto = toPublicMatchPlayerDto({
    playerId: "10000000-0000-4000-8000-000000000000",
    profileAvailable: false,
    nickname: "공개닉",
    tagLine: "KR1",
    championKey: "ahri",
    championName: "아리",
    team: "BLUE",
    position: "MID",
    kills: 8,
    deaths: 2,
    assists: 7,
    mvpScore: 36.5,
    memberName: "절대 공개 금지",
    userAccountId: "20000000-0000-4000-8000-000000000000",
    balanceOverride: 999,
    privateAssetId: "30000000-0000-4000-8000-000000000000",
    ocrCandidate: { raw: "private" },
  } as Parameters<typeof toPublicMatchPlayerDto>[0] & Record<string, unknown>);
  assert.deepEqual(Object.keys(dto).sort(), [
    "assists",
    "championKey",
    "championName",
    "deaths",
    "kills",
    "mvpScore",
    "nickname",
    "playerId",
    "position",
    "profileAvailable",
    "tagLine",
    "team",
  ]);
  assert.equal(JSON.stringify(dto).includes("절대 공개 금지"), false);
});
