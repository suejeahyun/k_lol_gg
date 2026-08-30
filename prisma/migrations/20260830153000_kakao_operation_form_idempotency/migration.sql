-- New Kakao operation-form requests receive a deterministic daily source hash.
-- Existing records remain NULL so this migration is backward compatible.
ALTER TABLE "KakaoFriendApplication" ADD COLUMN "sourceHash" TEXT;
ALTER TABLE "KakaoSuggestionRequest" ADD COLUMN "sourceHash" TEXT;
ALTER TABLE "KakaoMeetupRecord" ADD COLUMN "sourceHash" TEXT;
ALTER TABLE "KakaoLeaveRequest" ADD COLUMN "sourceHash" TEXT;

CREATE UNIQUE INDEX "KakaoFriendApplication_sourceHash_key"
  ON "KakaoFriendApplication"("sourceHash");
CREATE UNIQUE INDEX "KakaoSuggestionRequest_sourceHash_key"
  ON "KakaoSuggestionRequest"("sourceHash");
CREATE UNIQUE INDEX "KakaoMeetupRecord_sourceHash_key"
  ON "KakaoMeetupRecord"("sourceHash");
CREATE UNIQUE INDEX "KakaoLeaveRequest_sourceHash_key"
  ON "KakaoLeaveRequest"("sourceHash");
