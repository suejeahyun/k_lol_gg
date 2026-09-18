import assert from "node:assert/strict";
import test from "node:test";

import {
  stepMediaCarouselIndex,
  stepMediaCarouselWheelIndex,
} from "../src/app/(public)/(media)/media-carousel-state";

test("빈 캐러셀과 한 장 캐러셀은 첫 위치를 유지한다", () => {
  assert.equal(stepMediaCarouselIndex(0, 1, 0), 0);
  assert.equal(stepMediaCarouselIndex(0, -1, 0), 0);
  assert.equal(stepMediaCarouselIndex(0, 1, 1), 0);
  assert.equal(stepMediaCarouselIndex(5, -1, 1), 0);
});

test("여러 장 캐러셀은 이전·다음 이동과 양 끝 순환을 결정적으로 계산한다", () => {
  assert.equal(stepMediaCarouselIndex(0, 1, 5), 1);
  assert.equal(stepMediaCarouselIndex(4, 1, 5), 0);
  assert.equal(stepMediaCarouselIndex(0, -1, 5), 4);
  assert.equal(stepMediaCarouselIndex(-1, 1, 5), 0);
});

test("캐러셀 장수는 음수나 비정수일 수 없다", () => {
  assert.throws(() => stepMediaCarouselIndex(0, 1, -1), /SLIDE_COUNT_INVALID/);
  assert.throws(() => stepMediaCarouselIndex(0, 1, 1.5), /SLIDE_COUNT_INVALID/);
});

test("휠 이동은 양 끝에서 페이지 세로 스크롤로 빠져나갈 수 있도록 순환하지 않는다", () => {
  assert.equal(stepMediaCarouselWheelIndex(0, -1, 5), 0);
  assert.equal(stepMediaCarouselWheelIndex(0, 1, 5), 1);
  assert.equal(stepMediaCarouselWheelIndex(3, 1, 5), 4);
  assert.equal(stepMediaCarouselWheelIndex(4, 1, 5), 4);
});
