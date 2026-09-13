import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("홈과 이미지 상세은 같은 접근 가능한 수동 캐러셀을 사용한다", () => {
  const carousel = source("../src/app/(public)/(media)/media-carousel.tsx");
  const home = source("../src/app/(public)/(home)/page.tsx");
  const detail = source("../src/app/(public)/(media)/images/[imageId]/page.tsx");

  for (const contract of [
    'role="region"',
    'aria-roledescription="carousel"',
    'aria-roledescription="slide"',
    'aria-live="polite"',
    'aria-label="이전 사진"',
    'aria-label="다음 사진"',
    'event.key === "ArrowLeft"',
    'event.key === "ArrowRight"',
    "ResilientMediaImage",
    "key={activeSlide.id}",
  ]) assert.equal(carousel.includes(contract), true, contract);
  assert.match(home, /<MediaCarousel[^>]+variant="compact"/s);
  assert.match(detail, /<MediaCarousel/);
});

test("캐러셀은 빈 상태를 안전하게 닫고 한 장에는 이동 컨트롤을 숨기며 여러 장에는 직접 이동을 제공한다", () => {
  const carousel = source("../src/app/(public)/(media)/media-carousel.tsx");
  const home = source("../src/app/(public)/(home)/page.tsx");

  assert.match(carousel, /if \(!activeSlide\) return null/);
  assert.match(carousel, /slides\.length > 1/);
  assert.match(carousel, /slides\.map\(\(slide, index\)/);
  assert.match(home, /destructionWinnerSlides\.length \? <MediaCarousel/);
  assert.match(home, /게시 완료된 멸망전 우승 사진이 아직 없어요/);
});

test("캐러셀은 모바일 비율·44px 조작 영역·모션 감소 설정을 유지한다", () => {
  const css = source("../src/app/(public)/(media)/media.module.css");

  assert.match(css, /\.carouselViewport\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.match(css, /\.carouselControls > button,.carouselDots button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.carouselViewport\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("홈 우승 사진은 FK 연결을 우선하고 엄격한 레거시 후보만 보강하며 실제 자산 URL을 사용한다", () => {
  const repository = source("../src/modules/home/infrastructure/postgres-home-repository.ts");
  const home = source("../src/app/(public)/(home)/page.tsx");

  assert.match(repository, /eq\(destructionCompetitions\.status, "COMPLETED"\)/);
  assert.match(repository, /innerJoin\(mediaGalleries, eq\(destructionCompetitions\.galleryId, mediaGalleries\.id\)\)/);
  assert.match(repository, /image\.status !== "READY" \|\| image\.purpose !== "GALLERY"/);
  assert.match(repository, /eq\(mediaGalleries\.showOnHome, true\)/);
  assert.match(repository, /ilike\(mediaGalleries\.title, "%멸망전%"\)/);
  assert.match(repository, /ilike\(mediaGalleries\.title, "%우승%"\)/);
  assert.match(repository, /selectHomeDestructionWinnerGalleries/);
  assert.match(home, /src:\s*image\.url/);
  assert.doesNotMatch(home, /\/images\/winners\/destruction\//);
});
