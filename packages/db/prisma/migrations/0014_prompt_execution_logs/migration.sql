-- CreateTable
CREATE TABLE "prompt_execution_logs" (
    "id" TEXT NOT NULL,
    "botId" TEXT,
    "executionId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "levelUsed" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheHitRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "costEstimatedUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompt_execution_logs_botId_idx" ON "prompt_execution_logs"("botId");

-- CreateIndex
CREATE INDEX "prompt_execution_logs_createdAt_idx" ON "prompt_execution_logs"("createdAt");

-- CreateIndex
CREATE INDEX "prompt_execution_logs_model_idx" ON "prompt_execution_logs"("model");

-- AddForeignKey
ALTER TABLE "prompt_execution_logs" ADD CONSTRAINT "prompt_execution_logs_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
