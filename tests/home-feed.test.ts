import assert from "node:assert/strict";
import test from "node:test";

import { mergeRecentHomeItems } from "../src/modules/home/domain/home-snapshot";

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
