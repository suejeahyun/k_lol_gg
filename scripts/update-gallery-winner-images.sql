-- K-LOL.GG 우승 이미지 Google Drive 전환 SQL
-- 실행 전 GalleryImage 백업 권장:
--   SELECT id, title, "imageUrl" FROM "GalleryImage" ORDER BY id;
-- 실행 후 로컬 경로 잔여 확인:
--   SELECT id, title, "imageUrl" FROM "GalleryImage" WHERE EXISTS (SELECT 1 FROM unnest("imageUrl") AS url WHERE url LIKE '/images/winners%');

BEGIN;

UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/5/IMG_3875.webp', 'https://drive.google.com/thumbnail?id=1pzlrGa6En_VMboxDxOeSsN_vawqluiy4&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/5/IMG_3876.webp', 'https://drive.google.com/thumbnail?id=1yLt84FrJFQE4IEeN2ZZAuyEEVB0V7ozp&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/5/IMG_3877.webp', 'https://drive.google.com/thumbnail?id=1EAGxVUPV_L58gSmlE-h4K-23O4saNLzU&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/5/IMG_3878.webp', 'https://drive.google.com/thumbnail?id=1YWoFoDjy2jaR32PSykJoDf1_3gxTW5J2&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/5/IMG_3879.webp', 'https://drive.google.com/thumbnail?id=1rSGi_jMF_tY3-u7jxf38aAof4KTCXaPr&sz=w1600');

UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/6/IMG_4453.webp', 'https://drive.google.com/thumbnail?id=1NAGumHJzF8lI14pHiYAQa9OruKXeDV3O&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/6/IMG_4458.webp', 'https://drive.google.com/thumbnail?id=1IAUpY32zlTuYBqVFgZFAyTnko4fMKTBx&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/6/IMG_4459.webp', 'https://drive.google.com/thumbnail?id=12_FeHTrJ_eFd5EoDL4-rF8F3GUICzTXT&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/6/IMG_4460.webp', 'https://drive.google.com/thumbnail?id=1MYAc2UJRbuNtWRyXG8juVkEoVx02UfoL&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/6/IMG_4461.webp', 'https://drive.google.com/thumbnail?id=1vGrvsi0sB0rMgQqDMkMrJ5denIHVBEVb&sz=w1600');

UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/2/1.webp', 'https://drive.google.com/thumbnail?id=1GiaHB0T92c9G3rdc23pRR9tMczy-6oIi&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/3/1.webp', 'https://drive.google.com/thumbnail?id=1iKM9ezB-4b80GmrNXbsENZxeet_nxlJg&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/4/1.webp', 'https://drive.google.com/thumbnail?id=1JCKiLcv2BaC1xLY_yqSsjO_qQXmEugVL&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/5/1.webp', 'https://drive.google.com/thumbnail?id=1lb5EavNW-x2wsKs6_9uEUdapon4pXjk2&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/5/2.webp', 'https://drive.google.com/thumbnail?id=1S2EskvGJAakbh0-FuIX4_safQUtfL4mY&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/5/3.webp', 'https://drive.google.com/thumbnail?id=187dCRnu-P86Hjq6ddVWRiZpeSkSnSOMq&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/5/4.webp', 'https://drive.google.com/thumbnail?id=1xjKxr9CnLB0tZ_Kr99enBHI-buv03ZIH&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/5/5.webp', 'https://drive.google.com/thumbnail?id=1mvK_klxiykstofdU_y3Plp4qBAGmkvFW&sz=w1600');

UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/6/1.webp', 'https://drive.google.com/thumbnail?id=1KKmaimPVZBxWXB3BIFlWwCO5vObVZCf1&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/6/2.webp', 'https://drive.google.com/thumbnail?id=1rBYZnpW_pH8icfDHNCp-cYx048gr2k24&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/6/3.webp', 'https://drive.google.com/thumbnail?id=1xFWKyra4VDShdsQhHx4Iqw5ZeCV-oJV5&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/6/4.webp', 'https://drive.google.com/thumbnail?id=1lQ_dEPb7YR0ga7gCc3NWZGAHT_wu6suD&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction/6/5.webp', 'https://drive.google.com/thumbnail?id=1BFg2oHXk9CU9st4Ooe7j_CRgTSPgoz3e&sz=w1600');

UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction-2.webp', 'https://drive.google.com/thumbnail?id=19Yb1bGTX3M1_MDY7lmj15cor3B_2P0sG&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction-3.webp', 'https://drive.google.com/thumbnail?id=1cidUNZDrXlkKTE0g1wB8OCFWsMvFzeHz&sz=w1600');
UPDATE "GalleryImage" SET "imageUrl" = array_replace("imageUrl", '/images/winners/destruction-4.webp', 'https://drive.google.com/thumbnail?id=1TwH4A5R7042eqmJ3yIPbA0-AVUxlTHow&sz=w1600');

COMMIT;
