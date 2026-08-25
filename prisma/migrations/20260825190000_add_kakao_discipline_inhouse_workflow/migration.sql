-- K-LOL.GG 카카오 경고·내전 결과 접수 워크플로 추가
-- 기존 원본 장부는 유지하고 접수/검토/이미지 메타데이터를 추가한다.

CREATE TABLE "KakaoFormTemplate" (
    "id" SERIAL NOT NULL,
    "formType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "commandAliases" JSONB NOT NULL,
    "instructions" TEXT NOT NULL,
    "fieldsJson" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KakaoFormTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivateAsset" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'VERCEL_BLOB',
    "storageKey" TEXT NOT NULL,
    "blobUrl" TEXT,
    "originalFileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivateAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisciplineSubmission" (
    "id" SERIAL NOT NULL,
    "publicCode" TEXT NOT NULL,
    "templateId" INTEGER,
    "templateVersion" INTEGER NOT NULL,
    "templateSnapshot" JSONB NOT NULL,
    "rawText" TEXT NOT NULL,
    "parsedData" JSONB NOT NULL,
    "roomName" TEXT,
    "sender" TEXT,
    "sourceMessageHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "targetUserAccountId" INTEGER,
    "targetPlayerId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "rejectionReason" TEXT,
    "disciplineRecordId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DisciplineSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisciplineResolutionTask" (
    "id" SERIAL NOT NULL,
    "disciplineRecordId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "requiredGameCount" INTEGER NOT NULL,
    "claimedGameCount" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUIRED',
    "publicCode" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DisciplineResolutionTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisciplineEvidence" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "privateAssetId" INTEGER NOT NULL,
    "claimedGameCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisciplineEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisciplineCautionConversion" (
    "id" SERIAL NOT NULL,
    "cautionRecordId" INTEGER NOT NULL,
    "warningRecordId" INTEGER NOT NULL,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisciplineCautionConversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisciplineBanReview" (
    "id" SERIAL NOT NULL,
    "targetIdentityKey" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetNickname" TEXT,
    "targetTag" TEXT,
    "warningRecordIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "decisionNote" TEXT,
    "banRecordId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DisciplineBanReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InhouseResultSubmission" (
    "id" SERIAL NOT NULL,
    "publicCode" TEXT NOT NULL,
    "templateId" INTEGER,
    "templateVersion" INTEGER NOT NULL,
    "templateSnapshot" JSONB NOT NULL,
    "rawText" TEXT NOT NULL,
    "parsedData" JSONB NOT NULL,
    "seasonId" INTEGER,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "organizer" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "expectedGameCount" INTEGER NOT NULL,
    "teamBalanceDraftId" INTEGER,
    "roomName" TEXT,
    "sender" TEXT,
    "sourceMessageHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "rejectionReason" TEXT,
    "matchSeriesId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InhouseResultSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InhouseResultImage" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "privateAssetId" INTEGER NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ocrResultJson" JSONB,
    "ocrError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InhouseResultImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KakaoImageReceiveSession" (
    "id" SERIAL NOT NULL,
    "publicCode" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "roomKey" TEXT NOT NULL,
    "senderKey" TEXT NOT NULL,
    "expectedImageCount" INTEGER,
    "receivedImageCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KakaoImageReceiveSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KakaoInboundImage" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "privateAssetId" INTEGER NOT NULL,
    "imageNumber" INTEGER NOT NULL,
    "sourceEventKey" TEXT,
    "sha256" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KakaoInboundImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KakaoFormTemplate_formType_version_key" ON "KakaoFormTemplate"("formType", "version");
CREATE INDEX "KakaoFormTemplate_formType_status_version_idx" ON "KakaoFormTemplate"("formType", "status", "version");
CREATE UNIQUE INDEX "PrivateAsset_storageKey_key" ON "PrivateAsset"("storageKey");
CREATE UNIQUE INDEX "PrivateAsset_blobUrl_key" ON "PrivateAsset"("blobUrl");
CREATE INDEX "PrivateAsset_purpose_createdAt_idx" ON "PrivateAsset"("purpose", "createdAt");
CREATE INDEX "PrivateAsset_sha256_idx" ON "PrivateAsset"("sha256");
CREATE INDEX "PrivateAsset_expiresAt_deletedAt_idx" ON "PrivateAsset"("expiresAt", "deletedAt");
CREATE UNIQUE INDEX "DisciplineSubmission_publicCode_key" ON "DisciplineSubmission"("publicCode");
CREATE UNIQUE INDEX "DisciplineSubmission_sourceMessageHash_key" ON "DisciplineSubmission"("sourceMessageHash");
CREATE UNIQUE INDEX "DisciplineSubmission_disciplineRecordId_key" ON "DisciplineSubmission"("disciplineRecordId");
CREATE INDEX "DisciplineSubmission_status_createdAt_idx" ON "DisciplineSubmission"("status", "createdAt");
CREATE INDEX "DisciplineSubmission_targetUserAccountId_status_idx" ON "DisciplineSubmission"("targetUserAccountId", "status");
CREATE INDEX "DisciplineSubmission_targetPlayerId_status_idx" ON "DisciplineSubmission"("targetPlayerId", "status");
CREATE UNIQUE INDEX "DisciplineResolutionTask_disciplineRecordId_key" ON "DisciplineResolutionTask"("disciplineRecordId");
CREATE UNIQUE INDEX "DisciplineResolutionTask_publicCode_key" ON "DisciplineResolutionTask"("publicCode");
CREATE INDEX "DisciplineResolutionTask_status_dueAt_idx" ON "DisciplineResolutionTask"("status", "dueAt");
CREATE UNIQUE INDEX "DisciplineEvidence_taskId_privateAssetId_key" ON "DisciplineEvidence"("taskId", "privateAssetId");
CREATE INDEX "DisciplineEvidence_taskId_submittedAt_idx" ON "DisciplineEvidence"("taskId", "submittedAt");
CREATE UNIQUE INDEX "DisciplineCautionConversion_cautionRecordId_key" ON "DisciplineCautionConversion"("cautionRecordId");
CREATE INDEX "DisciplineCautionConversion_warningRecordId_idx" ON "DisciplineCautionConversion"("warningRecordId");
CREATE UNIQUE INDEX "DisciplineBanReview_banRecordId_key" ON "DisciplineBanReview"("banRecordId");
CREATE INDEX "DisciplineBanReview_targetIdentityKey_status_idx" ON "DisciplineBanReview"("targetIdentityKey", "status");
CREATE INDEX "DisciplineBanReview_status_createdAt_idx" ON "DisciplineBanReview"("status", "createdAt");
CREATE UNIQUE INDEX "InhouseResultSubmission_publicCode_key" ON "InhouseResultSubmission"("publicCode");
CREATE UNIQUE INDEX "InhouseResultSubmission_sourceMessageHash_key" ON "InhouseResultSubmission"("sourceMessageHash");
CREATE UNIQUE INDEX "InhouseResultSubmission_matchSeriesId_key" ON "InhouseResultSubmission"("matchSeriesId");
CREATE INDEX "InhouseResultSubmission_status_createdAt_idx" ON "InhouseResultSubmission"("status", "createdAt");
CREATE INDEX "InhouseResultSubmission_matchDate_status_idx" ON "InhouseResultSubmission"("matchDate", "status");
CREATE UNIQUE INDEX "InhouseResultImage_submissionId_gameNumber_key" ON "InhouseResultImage"("submissionId", "gameNumber");
CREATE UNIQUE INDEX "InhouseResultImage_submissionId_privateAssetId_key" ON "InhouseResultImage"("submissionId", "privateAssetId");
CREATE UNIQUE INDEX "KakaoImageReceiveSession_publicCode_key" ON "KakaoImageReceiveSession"("publicCode");
CREATE INDEX "KakaoImageReceiveSession_roomKey_senderKey_status_idx" ON "KakaoImageReceiveSession"("roomKey", "senderKey", "status");
CREATE INDEX "KakaoImageReceiveSession_targetType_targetId_idx" ON "KakaoImageReceiveSession"("targetType", "targetId");
CREATE INDEX "KakaoImageReceiveSession_status_expiresAt_idx" ON "KakaoImageReceiveSession"("status", "expiresAt");
CREATE UNIQUE INDEX "KakaoInboundImage_sourceEventKey_key" ON "KakaoInboundImage"("sourceEventKey");
CREATE UNIQUE INDEX "KakaoInboundImage_sessionId_imageNumber_key" ON "KakaoInboundImage"("sessionId", "imageNumber");
CREATE UNIQUE INDEX "KakaoInboundImage_sessionId_sha256_key" ON "KakaoInboundImage"("sessionId", "sha256");

ALTER TABLE "DisciplineSubmission" ADD CONSTRAINT "DisciplineSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KakaoFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DisciplineSubmission" ADD CONSTRAINT "DisciplineSubmission_disciplineRecordId_fkey" FOREIGN KEY ("disciplineRecordId") REFERENCES "UserDisciplineRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DisciplineResolutionTask" ADD CONSTRAINT "DisciplineResolutionTask_disciplineRecordId_fkey" FOREIGN KEY ("disciplineRecordId") REFERENCES "UserDisciplineRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisciplineEvidence" ADD CONSTRAINT "DisciplineEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DisciplineResolutionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisciplineEvidence" ADD CONSTRAINT "DisciplineEvidence_privateAssetId_fkey" FOREIGN KEY ("privateAssetId") REFERENCES "PrivateAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DisciplineCautionConversion" ADD CONSTRAINT "DisciplineCautionConversion_cautionRecordId_fkey" FOREIGN KEY ("cautionRecordId") REFERENCES "UserDisciplineRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DisciplineCautionConversion" ADD CONSTRAINT "DisciplineCautionConversion_warningRecordId_fkey" FOREIGN KEY ("warningRecordId") REFERENCES "UserDisciplineRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DisciplineBanReview" ADD CONSTRAINT "DisciplineBanReview_banRecordId_fkey" FOREIGN KEY ("banRecordId") REFERENCES "UserDisciplineRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InhouseResultSubmission" ADD CONSTRAINT "InhouseResultSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KakaoFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InhouseResultSubmission" ADD CONSTRAINT "InhouseResultSubmission_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InhouseResultSubmission" ADD CONSTRAINT "InhouseResultSubmission_teamBalanceDraftId_fkey" FOREIGN KEY ("teamBalanceDraftId") REFERENCES "TeamBalanceDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InhouseResultSubmission" ADD CONSTRAINT "InhouseResultSubmission_matchSeriesId_fkey" FOREIGN KEY ("matchSeriesId") REFERENCES "MatchSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InhouseResultImage" ADD CONSTRAINT "InhouseResultImage_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "InhouseResultSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InhouseResultImage" ADD CONSTRAINT "InhouseResultImage_privateAssetId_fkey" FOREIGN KEY ("privateAssetId") REFERENCES "PrivateAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KakaoInboundImage" ADD CONSTRAINT "KakaoInboundImage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "KakaoImageReceiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KakaoInboundImage" ADD CONSTRAINT "KakaoInboundImage_privateAssetId_fkey" FOREIGN KEY ("privateAssetId") REFERENCES "PrivateAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
