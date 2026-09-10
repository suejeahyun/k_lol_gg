import assert from "node:assert/strict";
import test from "node:test";

import {
  homeChampionPresentation,
  kstHomeDateKey,
  mergeRecentHomeItems,
  selectDailyHomeChampion,
} from "../src/modules/home/domain/home-snapshot";
import {
  findHomeGuideChampion,
  HOME_GUIDE_CHAMPION_COUNT,
  HOME_GUIDE_CHAMPIONS,
} from "../src/modules/home/domain/home-guide-champions";

test("홈의 서로 다른 공개 피드는 시간 역순과 ID tie-break로 결정적으로 합쳐진다", () => {
  const first = Object.freeze([
    Object.freeze({ id: "later-b", occurredAt: "2026-09-07T10:00:00.000Z", label: "B" }),
    Object.freeze({ id: "old", occurredAt: "2026-09-06T10:00:00.000Z", label: "old" }),
  ]);
  const second = Object.freeze([
    Object.freeze({ id: "later-a", occurredAt: "2026-09-07T10:00:00.000Z", label: "A" }),
    Object.freeze({ id: "newest", occurredAt: "2026-09-08T10:00:00.000Z", label: "new" }),
  ]);

  assert.deepEqual(mergeRecentHomeItems<{ id: string; occurredAt: string; label: string }>([first, second], 3).map((item) => item.id), [
    "newest", "later-a", "later-b",
  ]);
  assert.deepEqual(first.map((item) => item.id), ["later-b", "old"]);
});

test("홈 피드 제한은 음수와 비정수 값을 거부하고 0은 빈 피드를 만든다", () => {
  assert.deepEqual(mergeRecentHomeItems([[{ id: "one", occurredAt: "2026-09-07T00:00:00.000Z" }]], 0), []);
  assert.throws(() => mergeRecentHomeItems([], -1), /HOME_FEED_LIMIT_INVALID/);
  assert.throws(() => mergeRecentHomeItems([], 1.5), /HOME_FEED_LIMIT_INVALID/);
});

const champions = Object.freeze([
  Object.freeze({ key: "ahri", displayName: "아리", imageUrl: null }),
  Object.freeze({ key: "lux", displayName: "럭스", imageUrl: null }),
  Object.freeze({ key: "gwen", displayName: "그웬", imageUrl: null }),
]);

test("오늘의 챔피언은 KST 날짜·활성 목록에 대해 SSR에서도 결정적이고 다음 날 변경된다", () => {
  assert.equal(kstHomeDateKey(new Date("2026-09-07T15:00:00.000Z")), "2026-09-08");
  const first = selectDailyHomeChampion(champions, "2026-09-08");
  const repeated = selectDailyHomeChampion([...champions].reverse(), "2026-09-08");
  const nextDay = selectDailyHomeChampion(champions, "2026-09-09");
  assert.deepEqual(first, repeated);
  assert.notEqual(first.champion?.key, nextDay.champion?.key);
  assert.equal(champions.some((champion) => champion.key === first.champion?.key), true);
  const cycle = new Set(["2026-09-08", "2026-09-09", "2026-09-10"].map(
    (dateKey) => selectDailyHomeChampion(champions, dateKey).champion?.key,
  ));
  assert.deepEqual([...cycle].sort(), champions.map((champion) => champion.key).sort());
});

test("오늘의 챔피언 문구와 챔피언별 개별 재구성 이미지를 연결한다", () => {
  const ahri = homeChampionPresentation(champions[0]);
  assert.match(ahri.message, /아리/);
  assert.equal(ahri.localImageSrc, "/images/home/champions-v2/ahri.webp");
  assert.match(ahri.localImageAlt ?? "", /아리.*비공식 팬아트/);
  const unknown = homeChampionPresentation({ key: "new-champion", displayName: "새 챔피언", imageUrl: null });
  assert.match(unknown.message, /새 챔피언/);
  assert.equal(unknown.localImageSrc, null);
  assert.throws(() => selectDailyHomeChampion(champions, "2026-02-30"), /DATE_KEY_INVALID/);
});

test("홈 안내 허용 목록은 공식 매핑을 통과한 여성 챔피언 68명과 고유 문구를 갖는다", () => {
  assert.equal(HOME_GUIDE_CHAMPIONS.length, HOME_GUIDE_CHAMPION_COUNT);
  assert.equal(new Set(HOME_GUIDE_CHAMPIONS.map((profile) => profile.id)).size, HOME_GUIDE_CHAMPION_COUNT);
  assert.equal(new Set(HOME_GUIDE_CHAMPIONS.map((profile) => profile.message)).size, HOME_GUIDE_CHAMPION_COUNT);
  assert.deepEqual(
    [...new Set(HOME_GUIDE_CHAMPIONS.map((profile) => profile.tone))].sort(),
    ["lilac", "mint", "peach", "sky"],
  );
  for (const profile of HOME_GUIDE_CHAMPIONS) {
    assert.match(profile.message, /[가-힣]/u, profile.id);
    assert.equal(profile.artWebpSrc, `/images/home/champions-v2/${profile.id.toLocaleLowerCase("en-US")}.webp`);
    assert.equal(findHomeGuideChampion(profile.id)?.id, profile.id);
  }
  assert.equal(new Set(HOME_GUIDE_CHAMPIONS.map((profile) => profile.artWebpSrc)).size, HOME_GUIDE_CHAMPION_COUNT);
});

test("특례 네 챔피언은 포함하고 Kindred와 남성·미확인 후보는 기본 거부한다", () => {
  for (const id of ["Anivia", "Belveth", "Naafiri", "RekSai"]) {
    assert.equal(findHomeGuideChampion(id)?.id, id);
  }
  assert.equal(findHomeGuideChampion("Kindred"), null);
  assert.equal(findHomeGuideChampion("Garen"), null);
  assert.equal(findHomeGuideChampion("unreleased-champion"), null);

  const mixed = [
    { key: "Garen", displayName: "가렌", imageUrl: null },
    { key: "Kindred", displayName: "킨드레드", imageUrl: null },
    { key: "Ahri", displayName: "아리", imageUrl: null },
  ] as const;
  assert.equal(selectDailyHomeChampion(mixed, "2026-09-10").champion?.key, "Ahri");
  assert.equal(selectDailyHomeChampion(mixed.slice(0, 2), "2026-09-10").champion, null);
});

test("레거시 키는 표시 이름으로 canonicalize하며 같은 공식 챔피언을 한 번만 선택한다", () => {
  const aliases = [
    { key: "v1-103", displayName: "아리", imageUrl: null },
    { key: "Ahri", displayName: "아리", imageUrl: null },
    { key: "v1-99", displayName: "럭스", imageUrl: null },
  ] as const;
  assert.equal(findHomeGuideChampion("v1-103", "아리")?.id, "Ahri");
  const selected = ["2026-09-10", "2026-09-11"].map(
    (dateKey) => selectDailyHomeChampion(aliases, dateKey).champion?.key,
  );
  assert.deepEqual([...new Set(selected)].sort(), ["Ahri", "v1-99"]);
  assert.deepEqual(
    selectDailyHomeChampion(aliases, "2026-09-10"),
    selectDailyHomeChampion([...aliases].reverse(), "2026-09-10"),
  );
});
