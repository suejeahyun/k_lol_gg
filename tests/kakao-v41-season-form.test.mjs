import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const routerPath = resolve(import.meta.dirname, "..", "integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_ROUTER.js");

async function loadRouter() {
  const source = await readFile(routerPath, "utf8");
  const context = vm.createContext({ console });
  new vm.Script(source, { filename: routerPath }).runInContext(context);
  return context;
}

test("V41 season output uses the site application fields and round-trips as bot input", async () => {
  const router = await loadRouter();
  router.__seasonResultJson = JSON.stringify({
    ok: true,
    body: {
      applyDate: "2026-09-08",
      recruitNo: 3,
      appliedCount: 0,
      reserveCount: 0,
      confirmedCount: 1,
      pendingCount: 0,
      entries: [{
        slotNo: 1,
        status: "CONFIRMED",
        source: "SITE",
        suppliedName: "노출되면 안 되는 회원명",
        suppliedRiotId: null,
        mainPosition: "MID",
        subPositions: ["SUP", "ADC"],
        player: { playerId: "player-1", displayName: "별빛", riotId: "별빛#KR1" },
      }],
    },
  });
  const formatted = vm.runInContext("v41FormatSeason(JSON.parse(__seasonResultJson))", router);

  assert.match(formatted, /^\[K-LOL\.GG 내전 참가 신청\]/u);
  assert.match(formatted, /신청일: 2026-09-08/u);
  assert.match(formatted, /회차: #3/u);
  assert.match(formatted, /플레이어: 별빛 \| Riot ID: 별빛#KR1 \| 주라인: MID \| 부라인: SUP, ADC \| 상태: 확정 \| 출처: SITE/u);
  assert.doesNotMatch(formatted, /노출되면 안 되는 회원명/u);
  assert.equal(router.v41RecruitNumber(formatted), 3);
  assert.equal(router.v41DateFromSnapshot(formatted), "2026-09-08");
  assert.deepEqual(JSON.parse(JSON.stringify(router.v41SeasonParticipants(formatted))), [{
    slotNo: 1,
    name: "별빛",
    riotId: "별빛#KR1",
    mainPosition: "MID",
    subPositions: ["SUP", "ADC"],
    reserve: false,
  }]);
});

test("V41 season input accepts the labeled site form and rejects invalid sub positions", async () => {
  const router = await loadRouter();
  const parsed = router.v41SeasonParticipants([
    "[K-LOL.GG 내전 참가 신청]",
    "신청일: 2026-09-08",
    "회차: #2",
    "1. 플레이어: 달빛 | Riot ID: 없음 | 주라인: JGL | 부라인: TOP, SUP | 상태: 예비 | 출처: KAKAO",
  ].join("\n"));
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [{
    slotNo: 1,
    name: "달빛",
    riotId: null,
    mainPosition: "JGL",
    subPositions: ["TOP", "SUP"],
    reserve: true,
  }]);
  assert.throws(() => router.v41SeasonParticipants(
    "[K-LOL.GG 내전 참가 신청]\n1. 플레이어: 달빛 | Riot ID: 없음 | 주라인: MID | 부라인: MID | 상태: 신청",
  ), /부라인/u);
});
