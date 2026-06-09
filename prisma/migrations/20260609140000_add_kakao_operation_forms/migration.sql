-- 카카오톡 운영 양식 저장 테이블
CREATE TABLE "KakaoFriendApplication" (
  "id" SERIAL NOT NULL,
  "friendName" TEXT NOT NULL,
  "friendNickname" TEXT NOT NULL,
  "usageType" TEXT NOT NULL,
  "gameName" TEXT,
  "discordNicknameChange" TEXT,
  "rawText" TEXT NOT NULL,
  "roomName" TEXT,
  "sender" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KakaoFriendApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KakaoSuggestionRequest" (
  "id" SERIAL NOT NULL,
  "requesterInfo" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "roomName" TEXT,
  "sender" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KakaoSuggestionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KakaoMeetupRecord" (
  "id" SERIAL NOT NULL,
  "hostInfo" TEXT NOT NULL,
  "eventDateText" TEXT NOT NULL,
  "place" TEXT NOT NULL,
  "participants" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "roomName" TEXT,
  "sender" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KakaoMeetupRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KakaoLeaveRequest" (
  "id" SERIAL NOT NULL,
  "requesterInfo" TEXT NOT NULL,
  "leavePeriod" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "roomName" TEXT,
  "sender" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KakaoLeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KakaoFriendApplication_status_createdAt_idx" ON "KakaoFriendApplication"("status", "createdAt");
CREATE INDEX "KakaoFriendApplication_friendName_idx" ON "KakaoFriendApplication"("friendName");
CREATE INDEX "KakaoFriendApplication_friendNickname_idx" ON "KakaoFriendApplication"("friendNickname");

CREATE INDEX "KakaoSuggestionRequest_status_createdAt_idx" ON "KakaoSuggestionRequest"("status", "createdAt");
CREATE INDEX "KakaoSuggestionRequest_requesterInfo_idx" ON "KakaoSuggestionRequest"("requesterInfo");

CREATE INDEX "KakaoMeetupRecord_status_createdAt_idx" ON "KakaoMeetupRecord"("status", "createdAt");
CREATE INDEX "KakaoMeetupRecord_hostInfo_idx" ON "KakaoMeetupRecord"("hostInfo");

CREATE INDEX "KakaoLeaveRequest_status_createdAt_idx" ON "KakaoLeaveRequest"("status", "createdAt");
CREATE INDEX "KakaoLeaveRequest_requesterInfo_idx" ON "KakaoLeaveRequest"("requesterInfo");
