CREATE TYPE "OperationAiRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'FAILED');

CREATE TABLE "OperationAiRequest" (
  "id" SERIAL NOT NULL,
  "taskType" TEXT NOT NULL DEFAULT 'PARTICIPATION_PARSE',
  "status" "OperationAiRequestStatus" NOT NULL DEFAULT 'PENDING',
  "prompt" TEXT NOT NULL,
  "rawText" TEXT,
  "parsedJson" JSONB,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationAiRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationAiRequest_taskType_idx" ON "OperationAiRequest"("taskType");
CREATE INDEX "OperationAiRequest_status_idx" ON "OperationAiRequest"("status");
CREATE INDEX "OperationAiRequest_createdAt_idx" ON "OperationAiRequest"("createdAt");
