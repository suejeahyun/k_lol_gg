-- K-LOL.GG gallery images: replace Google Drive thumbnail URLs with local public asset URLs.
-- This keeps GalleryImage.imageUrl as text[] and uses Next public paths.

BEGIN;

UPDATE "GalleryImage"
SET
  "imageUrl" = ARRAY[
    '/images/winners/destruction/6/1.webp',
    '/images/winners/destruction/6/2.webp',
    '/images/winners/destruction/6/3.webp',
    '/images/winners/destruction/6/4.webp',
    '/images/winners/destruction/6/5.webp'
  ]::text[],
  "showOnHome" = true,
  "updatedAt" = NOW()
WHERE id = 5;

UPDATE "GalleryImage"
SET
  "imageUrl" = ARRAY[
    '/images/winners/destruction/5/1.webp',
    '/images/winners/destruction/5/2.webp',
    '/images/winners/destruction/5/3.webp',
    '/images/winners/destruction/5/4.webp',
    '/images/winners/destruction/5/5.webp'
  ]::text[],
  "showOnHome" = true,
  "updatedAt" = NOW()
WHERE id = 4;

UPDATE "GalleryImage"
SET
  "imageUrl" = ARRAY['/images/winners/destruction/4/1.webp']::text[],
  "showOnHome" = true,
  "updatedAt" = NOW()
WHERE id = 3;

UPDATE "GalleryImage"
SET
  "imageUrl" = ARRAY['/images/winners/destruction/3/1.webp']::text[],
  "showOnHome" = true,
  "updatedAt" = NOW()
WHERE id = 2;

UPDATE "GalleryImage"
SET
  "imageUrl" = ARRAY['/images/winners/destruction/2/1.webp']::text[],
  "showOnHome" = true,
  "updatedAt" = NOW()
WHERE id = 1;

COMMIT;

SELECT
  id,
  title,
  "showOnHome",
  "imageUrl",
  "updatedAt"
FROM "GalleryImage"
ORDER BY id DESC;
