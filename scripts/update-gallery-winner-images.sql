-- 멸망전 우승 이미지 경로를 Google Drive 방식에서 public 로컬 경로 방식으로 교체합니다.
-- 실행 위치: Neon SQL Editor 또는 pgAdmin Query Tool
-- 전제: public/images/winners/destruction/{회차}/{번호}.webp 파일이 프로젝트에 포함되어 있어야 합니다.

UPDATE "GalleryImage"
SET "imageUrl" = ARRAY['/images/winners/destruction/2/1.webp']::text[]
WHERE title ILIKE '%2회%' AND title ILIKE '%멸망전%';

UPDATE "GalleryImage"
SET "imageUrl" = ARRAY['/images/winners/destruction/3/1.webp']::text[]
WHERE title ILIKE '%3회%' AND title ILIKE '%멸망전%';

UPDATE "GalleryImage"
SET "imageUrl" = ARRAY['/images/winners/destruction/4/1.webp']::text[]
WHERE title ILIKE '%4회%' AND title ILIKE '%멸망전%';

UPDATE "GalleryImage"
SET "imageUrl" = ARRAY[
  '/images/winners/destruction/5/1.webp',
  '/images/winners/destruction/5/2.webp',
  '/images/winners/destruction/5/3.webp',
  '/images/winners/destruction/5/4.webp',
  '/images/winners/destruction/5/5.webp'
]::text[]
WHERE title ILIKE '%5회%' AND title ILIKE '%멸망전%';

UPDATE "GalleryImage"
SET "imageUrl" = ARRAY[
  '/images/winners/destruction/6/1.webp',
  '/images/winners/destruction/6/2.webp',
  '/images/winners/destruction/6/3.webp',
  '/images/winners/destruction/6/4.webp',
  '/images/winners/destruction/6/5.webp'
]::text[]
WHERE title ILIKE '%6회%' AND title ILIKE '%멸망전%';
