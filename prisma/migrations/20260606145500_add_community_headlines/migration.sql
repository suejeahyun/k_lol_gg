CREATE TABLE IF NOT EXISTS "CommunityHeadline" (
  "id" SERIAL PRIMARY KEY,
  "type" "CommunityPostType" NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommunityHeadline_type_label_key" ON "CommunityHeadline"("type", "label");
CREATE INDEX IF NOT EXISTS "CommunityHeadline_type_isActive_sortOrder_idx" ON "CommunityHeadline"("type", "isActive", "sortOrder");

INSERT INTO "CommunityHeadline" ("type", "label", "sortOrder", "isActive") VALUES
('HIGHLIGHT', '슈퍼플레이', 10, true),
('HIGHLIGHT', '한타', 20, true),
('HIGHLIGHT', '솔로킬', 30, true),
('HIGHLIGHT', '바론·용', 40, true),
('HIGHLIGHT', '역전', 50, true),
('HIGHLIGHT', '웃긴장면', 60, true),
('HIGHLIGHT', '실수', 70, true),
('HIGHLIGHT', '제보', 80, true),
('SUGGESTION', '오류', 10, true),
('SUGGESTION', '개선요청', 20, true),
('SUGGESTION', '기능추가', 30, true),
('SUGGESTION', '디자인', 40, true),
('SUGGESTION', '모바일', 50, true),
('SUGGESTION', '카카오봇', 60, true),
('SUGGESTION', '구인구직', 70, true),
('SUGGESTION', '완료요청', 80, true),
('MATCH_REVIEW', '경기후기', 10, true),
('MATCH_REVIEW', '밴픽', 20, true),
('MATCH_REVIEW', 'MVP', 30, true),
('MATCH_REVIEW', '한타', 40, true),
('MATCH_REVIEW', '라인전', 50, true),
('MATCH_REVIEW', '운영', 60, true),
('MATCH_REVIEW', '피드백', 70, true),
('MATCH_REVIEW', '리뷰', 80, true),
('FREE', '잡담', 10, true),
('FREE', '질문', 20, true),
('FREE', '정보', 30, true),
('FREE', '후기', 40, true),
('FREE', '모집', 50, true),
('FREE', '자랑', 60, true),
('FREE', '유머', 70, true),
('FREE', '기타', 80, true)
ON CONFLICT ("type", "label") DO UPDATE
SET "sortOrder" = EXCLUDED."sortOrder",
    "isActive" = EXCLUDED."isActive";
