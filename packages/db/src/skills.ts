import type { Prisma, PrismaClient } from "./client.js";

export interface CreateSkillInput {
  workspaceId: string;
  userId: string;
  name: string;
  slug: string;
  description?: string;
  content: string;
  tags?: string[] | Prisma.InputJsonValue;
  metadata?: Record<string, unknown> | Prisma.InputJsonValue;
}

export interface UpdateSkillInput {
  name?: string;
  slug?: string;
  description?: string;
  content?: string;
  tags?: string[] | Prisma.InputJsonValue;
  metadata?: Record<string, unknown> | Prisma.InputJsonValue;
}

export async function listSkills(prisma: PrismaClient, workspaceId: string) {
  return prisma.skill.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSkillById(prisma: PrismaClient, workspaceId: string, skillId: string) {
  return prisma.skill.findFirst({
    where: { id: skillId, workspaceId },
  });
}

export async function getSkillBySlug(prisma: PrismaClient, workspaceId: string, slug: string) {
  return prisma.skill.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
  });
}

export async function createSkill(prisma: PrismaClient, data: CreateSkillInput) {
  return prisma.skill.create({
    data: {
      workspaceId: data.workspaceId,
      userId: data.userId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? "",
      content: data.content,
      tags: (data.tags as Prisma.InputJsonValue) ?? [],
      metadata: (data.metadata as Prisma.InputJsonValue) ?? {},
    },
  });
}

export async function updateSkill(
  prisma: PrismaClient,
  workspaceId: string,
  skillId: string,
  data: UpdateSkillInput,
) {
  return prisma.skill.update({
    where: { id: skillId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.tags !== undefined ? { tags: data.tags as Prisma.InputJsonValue } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function deleteSkill(prisma: PrismaClient, workspaceId: string, skillId: string) {
  return prisma.skill.delete({
    where: { id: skillId },
  });
}

export async function listBotSkills(prisma: PrismaClient, workspaceId: string, botId: string) {
  return prisma.botSkill.findMany({
    where: { workspaceId, botId },
    include: { skill: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function assignSkillsToBot(
  prisma: PrismaClient,
  workspaceId: string,
  botId: string,
  skillIds: string[],
) {
  return prisma.$transaction(async (tx) => {
    await tx.botSkill.deleteMany({
      where: { workspaceId, botId },
    });
    if (skillIds.length > 0) {
      await tx.botSkill.createMany({
        data: skillIds.map((skillId) => ({
          workspaceId,
          botId,
          skillId,
          enabled: true,
        })),
        skipDuplicates: true,
      });
    }
    return tx.botSkill.findMany({
      where: { workspaceId, botId },
      include: { skill: true },
      orderBy: { createdAt: "asc" },
    });
  });
}

export async function toggleBotSkill(
  prisma: PrismaClient,
  workspaceId: string,
  botId: string,
  skillId: string,
  enabled: boolean,
) {
  return prisma.botSkill.update({
    where: { botId_skillId: { botId, skillId } },
    data: { enabled },
  });
}

export function createSkillRepos(prisma: PrismaClient) {
  return {
    listSkills: (workspaceId: string) => listSkills(prisma, workspaceId),
    getSkillById: (workspaceId: string, skillId: string) => getSkillById(prisma, workspaceId, skillId),
    getSkillBySlug: (workspaceId: string, slug: string) => getSkillBySlug(prisma, workspaceId, slug),
    createSkill: (data: CreateSkillInput) => createSkill(prisma, data),
    updateSkill: (workspaceId: string, skillId: string, data: UpdateSkillInput) =>
      updateSkill(prisma, workspaceId, skillId, data),
    deleteSkill: (workspaceId: string, skillId: string) => deleteSkill(prisma, workspaceId, skillId),
    listBotSkills: (workspaceId: string, botId: string) => listBotSkills(prisma, workspaceId, botId),
    assignSkillsToBot: (workspaceId: string, botId: string, skillIds: string[]) =>
      assignSkillsToBot(prisma, workspaceId, botId, skillIds),
    toggleBotSkill: (workspaceId: string, botId: string, skillId: string, enabled: boolean) =>
      toggleBotSkill(prisma, workspaceId, botId, skillId, enabled),
  };
}

export type SkillRepos = ReturnType<typeof createSkillRepos>;
