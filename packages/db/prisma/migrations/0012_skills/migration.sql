-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_skills" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skills_workspaceId_slug_key" ON "skills"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "skills_workspaceId_userId_idx" ON "skills"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "skills_workspaceId_updatedAt_idx" ON "skills"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bot_skills_botId_skillId_key" ON "bot_skills"("botId", "skillId");

-- CreateIndex
CREATE INDEX "bot_skills_workspaceId_botId_idx" ON "bot_skills"("workspaceId", "botId");

-- CreateIndex
CREATE INDEX "bot_skills_skillId_idx" ON "bot_skills"("skillId");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_skills" ADD CONSTRAINT "bot_skills_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_skills" ADD CONSTRAINT "bot_skills_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_skills" ADD CONSTRAINT "bot_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
