-- AlterTable
ALTER TABLE "prompt_execution_logs" ADD COLUMN "inferenceMode" TEXT;
ALTER TABLE "prompt_execution_logs" ADD COLUMN "requestedCategory" TEXT;
ALTER TABLE "prompt_execution_logs" ADD COLUMN "resolvedProvider" TEXT;
ALTER TABLE "prompt_execution_logs" ADD COLUMN "resolvedModel" TEXT;
ALTER TABLE "prompt_execution_logs" ADD COLUMN "isFree" BOOLEAN DEFAULT false;

-- CreateIndex
CREATE INDEX "prompt_execution_logs_inferenceMode_idx" ON "prompt_execution_logs"("inferenceMode");

-- CreateIndex
CREATE INDEX "prompt_execution_logs_isFree_idx" ON "prompt_execution_logs"("isFree");
