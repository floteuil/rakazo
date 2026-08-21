import { ORPCError } from "@orpc/server";
import {
  type Actor,
  type AssignSkillsToBotInput,
  type CreateSkillInput,
  type DeleteSkillInput,
  type GetBotSkillsInput,
  type GetSkillInput,
  type ListSkillsInput,
  parseSkillMarkdown,
  type Skill,
  type SkillSummary,
  slugify,
  type UpdateSkillInput,
  type UploadSkillMarkdownInput,
} from "@rakazo/contracts";
import { IsolationError, Prisma, type PrismaClient } from "@rakazo/db";
import { withSerializableRetry } from "./serializable-retry.js";

export interface SkillsDeps {
  prisma: PrismaClient;
}

function mapSkill(row: {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  tags: Prisma.JsonValue | string[];
  metadata: Prisma.JsonValue | Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): Skill {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    content: row.content,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSkillSummary(row: {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  slug: string;
  description: string;
  tags: Prisma.JsonValue | string[];
  metadata: Prisma.JsonValue | Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): SkillSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveUniqueSlug(
  prisma: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  const existingSkills = await prisma.skill.findMany({
    where: {
      workspaceId,
      slug: { startsWith: baseSlug },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });

  const slugSet = new Set(existingSkills.map((s) => s.slug));
  if (!slugSet.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (slugSet.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}

export async function listSkills(
  deps: SkillsDeps,
  actor: Actor,
  query?: ListSkillsInput,
): Promise<SkillSummary[]> {
  const where: Prisma.SkillWhereInput = {
    workspaceId: actor.workspaceId,
  };

  if (query?.search) {
    const s = query.search.trim();
    if (s) {
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { description: { contains: s, mode: "insensitive" } },
        { slug: { contains: s, mode: "insensitive" } },
      ];
    }
  }

  const rows = await deps.prisma.skill.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      name: true,
      slug: true,
      description: true,
      tags: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  let filtered = rows;
  if (query?.tag) {
    const targetTag = query.tag.trim();
    filtered = filtered.filter((row) => {
      const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
      return tags.includes(targetTag);
    });
  }

  const offset = query?.offset ?? 0;
  const limit = query?.limit ?? 50;
  return filtered.slice(offset, offset + limit).map(mapSkillSummary);
}

export async function getSkill(
  deps: SkillsDeps,
  actor: Actor,
  input: GetSkillInput,
): Promise<Skill> {
  if (input.skillId) {
    const row = await deps.prisma.skill.findUnique({
      where: { id: input.skillId },
    });
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Skill not found" });
    }
    if (row.workspaceId !== actor.workspaceId) {
      throw new IsolationError("Resource does not belong to the active workspace");
    }
    return mapSkill(row);
  }

  if (input.slug) {
    const row = await deps.prisma.skill.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId: actor.workspaceId,
          slug: input.slug,
        },
      },
    });
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Skill not found" });
    }
    return mapSkill(row);
  }

  throw new ORPCError("BAD_REQUEST", { message: "Either skillId or slug must be provided" });
}

export async function createSkill(
  deps: SkillsDeps,
  actor: Actor,
  input: CreateSkillInput,
): Promise<Skill> {
  if (!input.content || input.content.length > 2_000_000) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Content must be between 1 and 2,000,000 characters",
    });
  }

  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);

  const row = await withSerializableRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        const uniqueSlug = await resolveUniqueSlug(tx, actor.workspaceId, baseSlug);
        return tx.skill.create({
          data: {
            workspaceId: actor.workspaceId,
            userId: actor.userId,
            name: input.name.trim(),
            slug: uniqueSlug,
            description: input.description?.trim() ?? "",
            content: input.content,
            tags: (input.tags ?? []) as Prisma.InputJsonValue,
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return mapSkill(row);
}

export async function updateSkill(
  deps: SkillsDeps,
  actor: Actor,
  input: UpdateSkillInput,
): Promise<Skill> {
  const existing = await deps.prisma.skill.findUnique({
    where: { id: input.skillId },
  });
  if (!existing) {
    throw new ORPCError("NOT_FOUND", { message: "Skill not found" });
  }
  if (existing.workspaceId !== actor.workspaceId) {
    throw new IsolationError("Resource does not belong to the active workspace");
  }

  if (input.content !== undefined && (input.content.length === 0 || input.content.length > 2_000_000)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Content must be between 1 and 2,000,000 characters",
    });
  }

  const row = await withSerializableRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        let finalSlug = existing.slug;
        if (input.slug || input.name) {
          const base = input.slug ? slugify(input.slug) : slugify(input.name || existing.name);
          finalSlug = await resolveUniqueSlug(tx, actor.workspaceId, base, existing.id);
        }

        return tx.skill.update({
          where: { id: existing.id },
          data: {
            name: input.name !== undefined ? input.name.trim() : undefined,
            slug: finalSlug,
            description: input.description !== undefined ? input.description.trim() : undefined,
            content: input.content !== undefined ? input.content : undefined,
            tags: input.tags !== undefined ? (input.tags as Prisma.InputJsonValue) : undefined,
            metadata:
              input.metadata !== undefined
                ? (input.metadata as Prisma.InputJsonValue)
                : undefined,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return mapSkill(row);
}

export async function deleteSkill(
  deps: SkillsDeps,
  actor: Actor,
  input: DeleteSkillInput,
): Promise<{ ok: true }> {
  const existing = await deps.prisma.skill.findUnique({
    where: { id: input.skillId },
  });
  if (!existing) {
    throw new ORPCError("NOT_FOUND", { message: "Skill not found" });
  }
  if (existing.workspaceId !== actor.workspaceId) {
    throw new IsolationError("Resource does not belong to the active workspace");
  }

  await withSerializableRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        await tx.botSkill.deleteMany({
          where: { skillId: existing.id },
        });
        await tx.skill.delete({
          where: { id: existing.id },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return { ok: true as const };
}

export async function uploadSkillMarkdown(
  deps: SkillsDeps,
  actor: Actor,
  input: UploadSkillMarkdownInput,
): Promise<Skill> {
  if (!input.content || input.content.length > 2_000_000) {
    throw new ORPCError("BAD_REQUEST", {
      message: "File content must be between 1 and 2,000,000 characters",
    });
  }

  const parsed = parseSkillMarkdown(input.content, input.filename);

  if (input.overwrite) {
    const existing = await deps.prisma.skill.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId: actor.workspaceId,
          slug: parsed.slug,
        },
      },
    });

    if (existing) {
      return updateSkill(deps, actor, {
        skillId: existing.id,
        name: parsed.name,
        description: parsed.description,
        content: parsed.content,
        tags: parsed.tags,
        metadata: parsed.metadata,
      });
    }
  }

  return createSkill(deps, actor, {
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description,
    content: parsed.content,
    tags: parsed.tags,
    metadata: parsed.metadata,
  });
}

export async function assignSkillsToBot(
  deps: SkillsDeps,
  actor: Actor,
  input: AssignSkillsToBotInput,
): Promise<{ ok: true; count: number }> {
  // Validate bot belongs to actor workspace
  const bot = await deps.prisma.bot.findFirst({
    where: { id: input.botId, workspaceId: actor.workspaceId },
  });
  if (!bot) {
    throw new IsolationError("Bot does not belong to active workspace");
  }

  // Validate all skills belong to actor workspace
  if (input.skillIds.length > 0) {
    const matchingSkills = await deps.prisma.skill.findMany({
      where: {
        id: { in: input.skillIds },
        workspaceId: actor.workspaceId,
      },
      select: { id: true },
    });
    if (matchingSkills.length !== input.skillIds.length) {
      throw new IsolationError("Skill does not belong to active workspace");
    }
  }

  await withSerializableRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        await tx.botSkill.deleteMany({
          where: { botId: input.botId, workspaceId: actor.workspaceId },
        });

        if (input.skillIds.length > 0) {
          await tx.botSkill.createMany({
            data: input.skillIds.map((skillId) => ({
              workspaceId: actor.workspaceId,
              botId: input.botId,
              skillId,
              enabled: true,
            })),
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return { ok: true as const, count: input.skillIds.length };
}

export async function getBotSkills(
  deps: SkillsDeps,
  actor: Actor,
  input: GetBotSkillsInput,
): Promise<Skill[]> {
  const bot = await deps.prisma.bot.findFirst({
    where: { id: input.botId, workspaceId: actor.workspaceId },
  });
  if (!bot) {
    throw new IsolationError("Bot does not belong to active workspace");
  }

  const rows = await deps.prisma.botSkill.findMany({
    where: {
      botId: input.botId,
      workspaceId: actor.workspaceId,
      enabled: true,
    },
    include: {
      skill: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return rows
    .filter((row) => row.skill && row.skill.workspaceId === actor.workspaceId)
    .map((row) => mapSkill(row.skill));
}

export function createSkillsService(deps: SkillsDeps) {
  return {
    list: (actor: Actor, query?: ListSkillsInput) => listSkills(deps, actor, query),
    get: (actor: Actor, input: GetSkillInput) => getSkill(deps, actor, input),
    create: (actor: Actor, input: CreateSkillInput) => createSkill(deps, actor, input),
    update: (actor: Actor, input: UpdateSkillInput) => updateSkill(deps, actor, input),
    delete: (actor: Actor, input: DeleteSkillInput) => deleteSkill(deps, actor, input),
    uploadMarkdown: (actor: Actor, input: UploadSkillMarkdownInput) =>
      uploadSkillMarkdown(deps, actor, input),
    assignToBot: (actor: Actor, input: AssignSkillsToBotInput) =>
      assignSkillsToBot(deps, actor, input),
    getBotSkills: (actor: Actor, input: GetBotSkillsInput) =>
      getBotSkills(deps, actor, input),
  };
}
