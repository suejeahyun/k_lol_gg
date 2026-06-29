-- Complete removal of user community, site notices, and event notice features.
-- This migration intentionally drops the related feature tables and enum types.

DROP TABLE IF EXISTS "CommunityReport" CASCADE;
DROP TABLE IF EXISTS "CommunityLike" CASCADE;
DROP TABLE IF EXISTS "CommunityComment" CASCADE;
DROP TABLE IF EXISTS "CommunityPost" CASCADE;
DROP TABLE IF EXISTS "CommunityHeadline" CASCADE;
DROP TABLE IF EXISTS "CommunityVisit" CASCADE;
DROP TABLE IF EXISTS "MatchMvpVote" CASCADE;
DROP TABLE IF EXISTS "EventNotice" CASCADE;
DROP TABLE IF EXISTS "Notice" CASCADE;

DROP TYPE IF EXISTS "CommunityReportTargetType";
DROP TYPE IF EXISTS "CommunityReportStatus";
DROP TYPE IF EXISTS "CommunitySuggestionStatus";
DROP TYPE IF EXISTS "CommunityPostType";
DROP TYPE IF EXISTS "EventNoticeType";
