import assert from "node:assert/strict";
import test from "node:test";

import {
  homeChampionPresentation,
  kstHomeDateKey,
  mergeRecentHomeItems,
  selectDailyHomeChampion,
} from "../src/modules/home/domain/home-snapshot";

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

test("오늘의 챔피언 문구는 이름을 자연스럽게 포함하고 승인된 로컬 팬아트만 연결한다", () => {
  const ahri = homeChampionPresentation(champions[0]);
  assert.match(ahri.message, /아리/);
  assert.equal(ahri.localImageSrc, "/images/brand/v2-hero-ahri-1600.webp");
  const unknown = homeChampionPresentation({ key: "new-champion", displayName: "새 챔피언", imageUrl: null });
  assert.match(unknown.message, /새 챔피언/);
  assert.equal(unknown.localImageSrc, null);
  assert.throws(() => selectDailyHomeChampion(champions, "2026-02-30"), /DATE_KEY_INVALID/);
});
