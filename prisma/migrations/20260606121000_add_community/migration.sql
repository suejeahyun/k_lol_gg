-- K-LOL.GG community board, comments, likes, reports, and user MVP votes
CREATE TYPE "CommunityPostType" AS ENUM ('HIGHLIGHT', 'SUGGESTION', 'MATCH_REVIEW', 'FREE', 'NOTICE_COMMENT');
CREATE TYPE "CommunitySuggestionStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'PLANNED', 'COMPLETED', 'HOLD');
CREATE TYPE "CommunityReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');
CREATE TYPE "CommunityReportTargetType" AS ENUM ('POST', 'COMMENT');

CREATE TABLE "CommunityPost" (
  "id" SERIAL NOT NULL,
  "type" "CommunityPostType" NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "videoUrl" TEXT,
  "thumbnailUrl" TEXT,
  "suggestionStatus" "CommunitySuggestionStatus" NOT NULL DEFAULT 'RECEIVED',
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "hiddenAt" TIMESTAMP(3),
  "hiddenReason" TEXT,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "authorId" INTEGER NOT NULL,
  "matchSeriesId" INTEGER,
  CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityComment" (
  "id" SERIAL NOT NULL,
  "content" TEXT NOT NULL,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "hiddenAt" TIMESTAMP(3),
  "hiddenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "postId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityLike" (
  "id" SERIAL NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  CONSTRAINT "CommunityLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityReport" (
  "id" SERIAL NOT NULL,
  "targetType" "CommunityReportTargetType" NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" TEXT,
  "status" "CommunityReportStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "reporterId" INTEGER NOT NULL,
  "postId" INTEGER,
  "commentId" INTEGER,
  CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchMvpVote" (
  "id" SERIAL NOT NULL,
  "gameId" INTEGER NOT NULL,
  "voterId" INTEGER NOT NULL,
  "playerId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchMvpVote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityPost_type_isHidden_isPinned_createdAt_idx" ON "CommunityPost"("type", "isHidden", "isPinned", "createdAt");
CREATE INDEX "CommunityPost_authorId_createdAt_idx" ON "CommunityPost"("authorId", "createdAt");
CREATE INDEX "CommunityPost_matchSeriesId_createdAt_idx" ON "CommunityPost"("matchSeriesId", "createdAt");
CREATE INDEX "CommunityPost_suggestionStatus_createdAt_idx" ON "CommunityPost"("suggestionStatus", "createdAt");
CREATE INDEX "CommunityComment_postId_isHidden_createdAt_idx" ON "CommunityComment"("postId", "isHidden", "createdAt");
CREATE INDEX "CommunityComment_authorId_createdAt_idx" ON "CommunityComment"("authorId", "createdAt");
CREATE UNIQUE INDEX "CommunityLike_postId_userId_key" ON "CommunityLike"("postId", "userId");
CREATE INDEX "CommunityLike_userId_createdAt_idx" ON "CommunityLike"("userId", "createdAt");
CREATE INDEX "CommunityReport_status_createdAt_idx" ON "CommunityReport"("status", "createdAt");
CREATE INDEX "CommunityReport_targetType_postId_idx" ON "CommunityReport"("targetType", "postId");
CREATE INDEX "CommunityReport_targetType_commentId_idx" ON "CommunityReport"("targetType", "commentId");
CREATE INDEX "CommunityReport_reporterId_createdAt_idx" ON "CommunityReport"("reporterId", "createdAt");
CREATE UNIQUE INDEX "MatchMvpVote_gameId_voterId_key" ON "MatchMvpVote"("gameId", "voterId");
CREATE INDEX "MatchMvpVote_gameId_playerId_idx" ON "MatchMvpVote"("gameId", "playerId");
CREATE INDEX "MatchMvpVote_voterId_createdAt_idx" ON "MatchMvpVote"("voterId", "createdAt");

ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_matchSeriesId_fkey" FOREIGN KEY ("matchSeriesId") REFERENCES "MatchSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLike" ADD CONSTRAINT "CommunityLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityLike" ADD CONSTRAINT "CommunityLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchMvpVote" ADD CONSTRAINT "MatchMvpVote_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MatchGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchMvpVote" ADD CONSTRAINT "MatchMvpVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchMvpVote" ADD CONSTRAINT "MatchMvpVote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
