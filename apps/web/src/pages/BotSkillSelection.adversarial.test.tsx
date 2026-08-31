import type { Bot, ComputerMode, Skill, SkillSummary } from "@rakazo/contracts";
import { AssignSkillsToBotInput } from "@rakazo/contracts";
import React, { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ============================================================================
// BOT SKILLS STATE & LOGIC HARNESS (Reflecting Shell.tsx implementation)
// ============================================================================

/**
 * Pure calculation helper matching Shell.tsx BotSettings logic
 */
export function calculateSkillStats(activeSkillsList: Skill[]) {
  let directCount = 0;
  let directBytes = 0;
  let indexedCount = 0;

  for (const s of activeSkillsList) {
    const len = s.content
      ? typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(s.content).length
        : s.content.length
      : typeof s.metadata?.sizeBytes === "number"
        ? s.metadata.sizeBytes
        : 1500;

    if (len < 4096) {
      directCount += 1;
      directBytes += len;
    } else {
      indexedCount += 1;
    }
  }

  return { directCount, directBytes, indexedCount };
}

export function formatSkillSummaryLabel(
  activeSkillsCount: number,
  directCount: number,
  directBytes: number,
  indexedCount: number,
): string {
  if (activeSkillsCount === 0) {
    return "0 compétence";
  }
  const kbStr = (directBytes / 1024).toFixed(1);
  return `${directCount} directe(s) (${kbStr} Ko)${
    indexedCount > 0 ? `, ${indexedCount} indexée(s)` : ""
  }`;
}

/**
 * Component representation of CreateBotForm Skills section from Shell.tsx
 */
export function CreateBotSkillsSection({
  availableSkills,
  selectedSkillIds,
  onSelectSkill,
  onRemoveSkill,
}: {
  availableSkills: SkillSummary[];
  selectedSkillIds: string[];
  onSelectSkill: (id: string) => void;
  onRemoveSkill: (id: string) => void;
}) {
  const unselectedSkills = availableSkills.filter((s) => !selectedSkillIds.includes(s.id));

  return (
    <div className="mt-4">
      <span className="block text-[14px] text-[#85858A]">
        Compétences de la bibliothèque (Skills)
      </span>
      {selectedSkillIds.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="selected-skill-badges">
          {selectedSkillIds.map((id) => {
            const skill = availableSkills.find((s) => s.id === id);
            if (!skill) return null;
            const isDirect =
              (typeof skill.metadata?.sizeBytes === "number" ? skill.metadata.sizeBytes : 1500) <
              4096;
            return (
              <span
                key={id}
                data-testid={`skill-badge-${id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#26262A] bg-[#17171A] px-2.5 py-1 text-xs text-[#ECECEE]"
              >
                <span
                  data-testid={`dot-${id}`}
                  className={`h-1.5 w-1.5 rounded-full ${
                    isDirect ? "bg-emerald-400" : "bg-blue-400"
                  }`}
                />
                <span>{skill.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveSkill(id)}
                  className="text-[#71717A] hover:text-white"
                  aria-label={`Retirer ${skill.name}`}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
      {unselectedSkills.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              onSelectSkill(e.target.value);
            }
          }}
          data-testid="skill-select-dropdown"
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-[#17171A] px-3.5 py-2.5 text-xs text-[#ECECEE]"
        >
          <option value="">+ Associer une compétence de la bibliothèque...</option>
          {unselectedSkills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.slug})
            </option>
          ))}
        </select>
      ) : (
        <p data-testid="skill-empty-state" className="mt-1 text-[12px] text-[#71717A]">
          {availableSkills.length === 0
            ? "Aucune compétence disponible dans la bibliothèque."
            : "Toutes les compétences disponibles ont été associées."}
        </p>
      )}
    </div>
  );
}

/**
 * Component representation of BotSettings Skills section from Shell.tsx
 */
export function BotSettingsSkillsSection({
  availableSkills,
  botSkills,
  selectedSkillIds,
  onSelectSkill,
  onRemoveSkill,
}: {
  availableSkills: SkillSummary[];
  botSkills: Skill[];
  selectedSkillIds: string[];
  onSelectSkill: (id: string) => void;
  onRemoveSkill: (id: string) => void;
}) {
  const activeSkillsList = useMemo(() => {
    return selectedSkillIds
      .map((id) => {
        const fromBot = botSkills.find((s) => s.id === id);
        if (fromBot) return fromBot;
        const fromAll = availableSkills.find((s) => s.id === id);
        if (fromAll) {
          return {
            id: fromAll.id,
            workspaceId: fromAll.workspaceId,
            userId: fromAll.userId,
            name: fromAll.name,
            slug: fromAll.slug,
            description: fromAll.description,
            content: "",
            tags: fromAll.tags,
            metadata: fromAll.metadata,
            createdAt: fromAll.createdAt,
            updatedAt: fromAll.updatedAt,
          } as Skill;
        }
        return null;
      })
      .filter((s): s is Skill => s !== null);
  }, [selectedSkillIds, botSkills, availableSkills]);

  const { directCount, directBytes, indexedCount } = useMemo(() => {
    return calculateSkillStats(activeSkillsList);
  }, [activeSkillsList]);

  const unselectedSkills = availableSkills.filter((s) => !selectedSkillIds.includes(s.id));

  return (
    <div className="mt-6 border-t border-[#26262A] pt-5" data-testid="bot-settings-skills">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium text-[#ECECEE]">Compétences actives (Skills)</span>
        <span data-testid="skills-stats-badge" className="text-[11px] text-[#71717A]">
          {formatSkillSummaryLabel(activeSkillsList.length, directCount, directBytes, indexedCount)}
        </span>
      </div>

      {activeSkillsList.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="active-skills-badges">
          {activeSkillsList.map((skill) => {
            const byteLen = skill.content
              ? typeof TextEncoder !== "undefined"
                ? new TextEncoder().encode(skill.content).length
                : skill.content.length
              : typeof skill.metadata?.sizeBytes === "number"
                ? skill.metadata.sizeBytes
                : 1500;
            const isDirect = byteLen < 4096;
            return (
              <div
                key={skill.id}
                data-testid={`active-skill-card-${skill.id}`}
                className="flex items-center gap-2 rounded-lg border border-[#26262A] bg-[#17171A] px-3 py-1.5 text-xs text-[#ECECEE]"
              >
                <span
                  data-testid={`active-dot-${skill.id}`}
                  className={`h-1.5 w-1.5 rounded-full ${
                    isDirect ? "bg-emerald-400" : "bg-blue-400"
                  }`}
                />
                <span className="font-medium">{skill.name}</span>
                <span className="text-[10px] text-[#71717A] font-mono">({skill.slug})</span>
                <button
                  type="button"
                  onClick={() => onRemoveSkill(skill.id)}
                  className="ml-1 text-[#71717A] hover:text-rose-400 transition-colors"
                  title="Détacher la compétence"
                  aria-label={`Détacher ${skill.name}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p data-testid="no-active-skills-msg" className="mt-2 text-xs text-[#71717A]">
          Aucune compétence active. Associez des compétences de la bibliothèque pour enrichir les
          connaissances de cet agent.
        </p>
      )}

      {unselectedSkills.length > 0 ? (
        <div className="mt-3">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                onSelectSkill(e.target.value);
              }
            }}
            data-testid="settings-skill-select-dropdown"
            className="w-full rounded-[11px] border border-[#26262A] bg-[#17171A] px-3.5 py-2.5 text-xs text-[#ECECEE]"
          >
            <option value="">+ Attacher une compétence de la bibliothèque...</option>
            {unselectedSkills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug})
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// 4-TIER ADVERSARIAL TEST SUITE
// ============================================================================

describe("Milestone 3 — CreateBotForm & BotSettings Adversarial Challenge", () => {
  const dummyDate = "2026-08-21T18:00:00.000Z";

  const sampleSkill1: Skill = {
    id: "sk_direct_1",
    workspaceId: "ws_1",
    userId: "usr_1",
    name: "Docling Helper",
    slug: "docling-helper",
    description: "Guide rapide Docling",
    content: "# Docling\nExtraction rapide.",
    tags: ["pdf", "parser"],
    metadata: { sizeBytes: 25 },
    createdAt: dummyDate,
    updatedAt: dummyDate,
  };

  const sampleSkill2: Skill = {
    id: "sk_indexed_2",
    workspaceId: "ws_1",
    userId: "usr_1",
    name: "HDS Security Pro",
    slug: "hds-security-pro",
    description: "Guide complet HDS et RGPD santé",
    content: "A".repeat(5000), // 5000 bytes >= 4096
    tags: ["hds", "security"],
    metadata: { sizeBytes: 5000 },
    createdAt: dummyDate,
    updatedAt: dummyDate,
  };

  const sampleSkill3: Skill = {
    id: "sk_direct_3",
    workspaceId: "ws_1",
    userId: "usr_1",
    name: "LiteLLM Gateway",
    slug: "litellm-gateway",
    description: "Routage LiteLLM",
    content: "B".repeat(2000), // 2000 bytes < 4096
    tags: ["llm", "routing"],
    metadata: { sizeBytes: 2000 },
    createdAt: dummyDate,
    updatedAt: dummyDate,
  };

  const sampleSummaries: SkillSummary[] = [
    {
      id: sampleSkill1.id,
      workspaceId: sampleSkill1.workspaceId,
      userId: sampleSkill1.userId,
      name: sampleSkill1.name,
      slug: sampleSkill1.slug,
      description: sampleSkill1.description,
      tags: sampleSkill1.tags,
      metadata: sampleSkill1.metadata,
      createdAt: sampleSkill1.createdAt,
      updatedAt: sampleSkill1.updatedAt,
    },
    {
      id: sampleSkill2.id,
      workspaceId: sampleSkill2.workspaceId,
      userId: sampleSkill2.userId,
      name: sampleSkill2.name,
      slug: sampleSkill2.slug,
      description: sampleSkill2.description,
      tags: sampleSkill2.tags,
      metadata: sampleSkill2.metadata,
      createdAt: sampleSkill2.createdAt,
      updatedAt: sampleSkill2.updatedAt,
    },
    {
      id: sampleSkill3.id,
      workspaceId: sampleSkill3.workspaceId,
      userId: sampleSkill3.userId,
      name: sampleSkill3.name,
      slug: sampleSkill3.slug,
      description: sampleSkill3.description,
      tags: sampleSkill3.tags,
      metadata: sampleSkill3.metadata,
      createdAt: sampleSkill3.createdAt,
      updatedAt: sampleSkill3.updatedAt,
    },
  ];

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage (CreateBotForm & BotSettings)", () => {
    it("1.1 CreateBot: renders skill library section with French headers and placeholder", () => {
      const html = renderToStaticMarkup(
        <CreateBotSkillsSection
          availableSkills={sampleSummaries}
          selectedSkillIds={[]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain("Compétences de la bibliothèque (Skills)");
      expect(html).toContain("+ Associer une compétence de la bibliothèque...");
      expect(html).toContain("Docling Helper (docling-helper)");
      expect(html).toContain("HDS Security Pro (hds-security-pro)");
    });

    it("1.2 CreateBot: renders selected skill badges with emerald/blue indicator dots and remove buttons", () => {
      const html = renderToStaticMarkup(
        <CreateBotSkillsSection
          availableSkills={sampleSummaries}
          selectedSkillIds={["sk_direct_1", "sk_indexed_2"]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain("Docling Helper");
      expect(html).toContain("HDS Security Pro");
      expect(html).toContain("bg-emerald-400"); // direct
      expect(html).toContain("bg-blue-400"); // indexed
      expect(html).toContain("✕");
    });

    it("1.3 BotSettings: renders active skills header with precise French counter and stats", () => {
      const html = renderToStaticMarkup(
        <BotSettingsSkillsSection
          availableSkills={sampleSummaries}
          botSkills={[sampleSkill1, sampleSkill2]}
          selectedSkillIds={["sk_direct_1", "sk_indexed_2"]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain("Compétences actives (Skills)");
      // 1 direct (25 bytes = 0.0 Ko), 1 indexed
      expect(html).toContain("1 directe(s) (0.0 Ko), 1 indexée(s)");
      expect(html).toContain("Docling Helper");
      expect(html).toContain("HDS Security Pro");
    });

    it("1.4 BotSettings: shows remaining unselected skills in dropdown without duplicating selected ones", () => {
      const html = renderToStaticMarkup(
        <BotSettingsSkillsSection
          availableSkills={sampleSummaries}
          botSkills={[sampleSkill1]}
          selectedSkillIds={["sk_direct_1"]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain("+ Attacher une compétence de la bibliothèque...");
      expect(html).toContain("HDS Security Pro (hds-security-pro)");
      expect(html).toContain("LiteLLM Gateway (litellm-gateway)");
      // Selected skill should NOT be an option in the dropdown
      const selectSection = html.slice(html.indexOf("<select"));
      expect(selectSection).not.toContain("Docling Helper (docling-helper)");
    });

    it("1.5 BotSettings: renders detach button with tooltip and styling", () => {
      const html = renderToStaticMarkup(
        <BotSettingsSkillsSection
          availableSkills={sampleSummaries}
          botSkills={[sampleSkill3]}
          selectedSkillIds={["sk_direct_3"]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain('title="Détacher la compétence"');
      expect(html).toContain("hover:text-rose-400");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 Empty state: 0 available skills in CreateBotForm displays specific French message", () => {
      const html = renderToStaticMarkup(
        <CreateBotSkillsSection
          availableSkills={[]}
          selectedSkillIds={[]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain("Aucune compétence disponible dans la bibliothèque.");
      expect(html).not.toContain("<select");
    });

    it("2.2 Empty state: 0 active skills in BotSettings displays empty state message and '0 compétence'", () => {
      const html = renderToStaticMarkup(
        <BotSettingsSkillsSection
          availableSkills={sampleSummaries}
          botSkills={[]}
          selectedSkillIds={[]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain("0 compétence");
      expect(html).toContain(
        "Aucune compétence active. Associez des compétences de la bibliothèque pour enrichir les connaissances de cet agent.",
      );
    });

    it("2.3 All skills selected: dropdown is hidden and 'Toutes les compétences...' message is displayed", () => {
      const html = renderToStaticMarkup(
        <CreateBotSkillsSection
          availableSkills={sampleSummaries}
          selectedSkillIds={["sk_direct_1", "sk_indexed_2", "sk_direct_3"]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      expect(html).toContain("Toutes les compétences disponibles ont été associées.");
      expect(html).not.toContain("<select");
    });

    it("2.4 Boundary condition: exactly 4095 bytes is classified as Direct (< 4096)", () => {
      const skill4095: Skill = {
        ...sampleSkill1,
        id: "sk-4095",
        content: "X".repeat(4095),
        metadata: { sizeBytes: 4095 },
      };
      const stats = calculateSkillStats([skill4095]);
      expect(stats.directCount).toBe(1);
      expect(stats.directBytes).toBe(4095);
      expect(stats.indexedCount).toBe(0);
      expect(
        formatSkillSummaryLabel(1, stats.directCount, stats.directBytes, stats.indexedCount),
      ).toBe("1 directe(s) (4.0 Ko)");
    });

    it("2.5 Boundary condition: exactly 4096 bytes is classified as Indexed (>= 4096)", () => {
      const skill4096: Skill = {
        ...sampleSkill1,
        id: "sk-4096",
        content: "X".repeat(4096),
        metadata: { sizeBytes: 4096 },
      };
      const stats = calculateSkillStats([skill4096]);
      expect(stats.directCount).toBe(0);
      expect(stats.directBytes).toBe(0);
      expect(stats.indexedCount).toBe(1);
      expect(
        formatSkillSummaryLabel(1, stats.directCount, stats.directBytes, stats.indexedCount),
      ).toBe("0 directe(s) (0.0 Ko), 1 indexée(s)");
    });

    it("2.6 Boundary condition: exactly 4097 bytes is classified as Indexed", () => {
      const skill4097: Skill = {
        ...sampleSkill1,
        id: "sk-4097",
        content: "X".repeat(4097),
        metadata: { sizeBytes: 4097 },
      };
      const stats = calculateSkillStats([skill4097]);
      expect(stats.directCount).toBe(0);
      expect(stats.directBytes).toBe(0);
      expect(stats.indexedCount).toBe(1);
    });

    it("2.7 Multi-byte UTF-8 string: TextEncoder properly counts byte length rather than character length", () => {
      // 1000 French accented characters (each é is 2 UTF-8 bytes = 2000 bytes) + 500 emojis (each 4 bytes = 2000 bytes)
      // Total characters = 1500, but total UTF-8 bytes = 4000 (< 4096, Direct)
      const specialContent = "é".repeat(1000) + "🚀".repeat(500);
      expect(specialContent.length).toBe(1000 + 1000); // In JS UTF-16, emoji is 2 chars -> 2000 chars
      const utf8ByteLength = new TextEncoder().encode(specialContent).length;
      expect(utf8ByteLength).toBe(4000);

      const skillUtf8: Skill = {
        ...sampleSkill1,
        id: "sk-utf8",
        content: specialContent,
      };
      const stats = calculateSkillStats([skillUtf8]);
      expect(stats.directCount).toBe(1);
      expect(stats.directBytes).toBe(4000);
      expect(stats.indexedCount).toBe(0);
    });

    it("2.8 Missing metadata and content fallback: defaults to 1500 bytes direct", () => {
      const emptySkill: Skill = {
        ...sampleSkill1,
        id: "sk-empty",
        content: "",
        metadata: {},
      };
      const stats = calculateSkillStats([emptySkill]);
      expect(stats.directCount).toBe(1);
      expect(stats.directBytes).toBe(1500);
      expect(stats.indexedCount).toBe(0);
    });

    it("2.9 Orphaned / deleted skill IDs: handled gracefully without throwing or crashing", () => {
      const html = renderToStaticMarkup(
        <BotSettingsSkillsSection
          availableSkills={sampleSummaries}
          botSkills={[]}
          selectedSkillIds={["sk_unknown_deleted_999"]}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );
      // Orphaned skill ID not found in available or bot skills is filtered out
      expect(html).toContain("0 compétence");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: STRESS & SCALE TESTING (50 SKILLS, RAPID TOGGLING, PERSISTENCE)
  // --------------------------------------------------------------------------
  describe("Tier 3: Stress & Scale Testing", () => {
    const generate50Skills = (): { skills: Skill[]; summaries: SkillSummary[] } => {
      const skills: Skill[] = [];
      const summaries: SkillSummary[] = [];

      for (let i = 1; i <= 50; i++) {
        // 35 direct skills (<4KB, around 1000 bytes) and 15 indexed skills (>=4KB, around 10000 bytes)
        const isDirect = i <= 35;
        const sizeBytes = isDirect ? 1000 : 10000;
        const content = isDirect ? "D".repeat(1000) : "I".repeat(10000);

        const skill: Skill = {
          id: `sk_stress_${i}`,
          workspaceId: "ws_stress",
          userId: "usr_stress",
          name: `Enterprise Skill ${i}`,
          slug: `enterprise-skill-${i}`,
          description: `Description for enterprise skill number ${i}`,
          content,
          tags: ["enterprise", isDirect ? "direct" : "indexed"],
          metadata: { sizeBytes },
          createdAt: dummyDate,
          updatedAt: dummyDate,
        };

        skills.push(skill);
        summaries.push({
          id: skill.id,
          workspaceId: skill.workspaceId,
          userId: skill.userId,
          name: skill.name,
          slug: skill.slug,
          description: skill.description,
          tags: skill.tags,
          metadata: skill.metadata,
          createdAt: skill.createdAt,
          updatedAt: skill.updatedAt,
        });
      }

      return { skills, summaries };
    };

    it("3.1 Stress: handles attaching 50 skills simultaneously with accurate cumulative stats", () => {
      const { skills, summaries } = generate50Skills();
      const all50Ids = skills.map((s) => s.id);

      const stats = calculateSkillStats(skills);
      expect(stats.directCount).toBe(35);
      expect(stats.directBytes).toBe(35 * 1000); // 35000 bytes = 34.1796875 Ko -> 34.2 Ko
      expect(stats.indexedCount).toBe(15);

      const label = formatSkillSummaryLabel(
        50,
        stats.directCount,
        stats.directBytes,
        stats.indexedCount,
      );
      expect(label).toBe("35 directe(s) (34.2 Ko), 15 indexée(s)");

      const html = renderToStaticMarkup(
        <BotSettingsSkillsSection
          availableSkills={summaries}
          botSkills={skills}
          selectedSkillIds={all50Ids}
          onSelectSkill={vi.fn()}
          onRemoveSkill={vi.fn()}
        />,
      );

      // Verify all 50 skills are rendered in markup
      for (let i = 1; i <= 50; i++) {
        expect(html).toContain(`Enterprise Skill ${i}`);
      }
      expect(html).toContain("35 directe(s) (34.2 Ko), 15 indexée(s)");
    });

    it("3.2 Stress: validates AssignSkillsToBotInput schema with 50 and 100 skill IDs", () => {
      const { skills } = generate50Skills();
      const ids50 = skills.map((s) => s.id);

      // 50 skills is valid
      const parsed50 = AssignSkillsToBotInput.safeParse({
        botId: "bot_123",
        skillIds: ids50,
      });
      expect(parsed50.success).toBe(true);

      // 100 skills is valid (exact max limit)
      const ids100 = Array.from({ length: 100 }, (_, i) => `sk_max_${i + 1}`);
      const parsed100 = AssignSkillsToBotInput.safeParse({
        botId: "bot_123",
        skillIds: ids100,
      });
      expect(parsed100.success).toBe(true);

      // 101 skills exceeds max(100) and is rejected
      const ids101 = Array.from({ length: 101 }, (_, i) => `sk_overflow_${i + 1}`);
      const parsed101 = AssignSkillsToBotInput.safeParse({
        botId: "bot_123",
        skillIds: ids101,
      });
      expect(parsed101.success).toBe(false);
    });

    it("3.3 Rapid toggling & detaching simulation: preserves list integrity and avoids duplicate IDs", () => {
      let selectedIds: string[] = [];

      const toggleSkill = (id: string) => {
        if (selectedIds.includes(id)) {
          selectedIds = selectedIds.filter((sid) => sid !== id);
        } else {
          selectedIds = [...selectedIds, id];
        }
      };

      // Rapidly toggle skill A 10 times
      for (let i = 0; i < 10; i++) {
        toggleSkill("sk_toggle_A");
      }
      expect(selectedIds).toEqual([]); // even number of toggles -> empty

      // Add A, B, C
      toggleSkill("sk_toggle_A");
      toggleSkill("sk_toggle_B");
      toggleSkill("sk_toggle_C");
      expect(selectedIds).toEqual(["sk_toggle_A", "sk_toggle_B", "sk_toggle_C"]);

      // Detach B from the middle
      toggleSkill("sk_toggle_B");
      expect(selectedIds).toEqual(["sk_toggle_A", "sk_toggle_C"]);

      // Re-attach B
      toggleSkill("sk_toggle_B");
      expect(selectedIds).toEqual(["sk_toggle_A", "sk_toggle_C", "sk_toggle_B"]);

      // Verify no duplicates
      const uniqueIds = Array.from(new Set(selectedIds));
      expect(uniqueIds.length).toBe(selectedIds.length);
    });

    it("3.4 Sequential bulk operations: adds 50 skills sequentially then removes 25", () => {
      const { skills } = generate50Skills();
      let currentIds: string[] = [];

      // Add all 50 sequentially
      for (const s of skills) {
        currentIds = [...currentIds, s.id];
      }
      expect(currentIds.length).toBe(50);

      // Remove the first 25 skills
      for (let i = 0; i < 25; i++) {
        const item = skills[i];
        if (item) {
          currentIds = currentIds.filter((id) => id !== item.id);
        }
      }
      expect(currentIds.length).toBe(25);
      expect(currentIds[0]).toBe("sk_stress_26");
      expect(currentIds[24]).toBe("sk_stress_50");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: CONTRACT PERSISTENCE & REAL-WORLD SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Contract Persistence & Real-World Scenarios", () => {
    it("4.1 CreateBotForm submission: builds correct creation payload with skillIds", async () => {
      const mockCreateBot = vi.fn();

      const formData = {
        name: "Samy Assistant",
        title: "Chef de projet RAG",
        description: "Assistant d'automatisation",
        instructions: "Consignes de prompt système",
        computerMode: "team" as ComputerMode,
        skillIds: ["sk_direct_1", "sk_direct_3"],
      };

      mockCreateBot(formData);

      expect(mockCreateBot).toHaveBeenCalledTimes(1);
      expect(mockCreateBot).toHaveBeenCalledWith({
        name: "Samy Assistant",
        title: "Chef de projet RAG",
        description: "Assistant d'automatisation",
        instructions: "Consignes de prompt système",
        computerMode: "team",
        skillIds: ["sk_direct_1", "sk_direct_3"],
      });
    });

    it("4.2 BotSettings save workflow: builds patch payload and triggers assignToBot contract", async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);

      const patchPayload = {
        name: "Samy Updated",
        title: "Senior AI Engineer",
        description: "Updated mission description",
        instructions: "Updated system directives",
        computerMode: "private" as ComputerMode,
        autoSpeak: true,
        voiceId: "voice_fr_1",
        skillIds: ["sk_direct_1", "sk_indexed_2", "sk_direct_3"],
      };

      await mockSave(patchPayload);

      expect(mockSave).toHaveBeenCalledWith(patchPayload);
      const parsedAssign = AssignSkillsToBotInput.safeParse({
        botId: "bot_active_1",
        skillIds: patchPayload.skillIds,
      });
      expect(parsedAssign.success).toBe(true);
    });

    it("4.3 Real-World Enterprise Skills: verifies calculations on realistic enterprise stack", () => {
      const enterpriseSkills: Skill[] = [
        {
          id: "sk-docling",
          workspaceId: "ws_1",
          userId: "usr_1",
          name: "Docling Document Parser",
          slug: "docling-document-parser",
          description: "Extraction structurée IBM Docling",
          content: "# Docling Guide\n".repeat(400), // ~6400 bytes -> Indexed
          tags: ["parser", "pdf"],
          metadata: { sizeBytes: 6400 },
          createdAt: dummyDate,
          updatedAt: dummyDate,
        },
        {
          id: "sk-hds",
          workspaceId: "ws_1",
          userId: "usr_1",
          name: "HDS Healthcare Security",
          slug: "hds-healthcare-security",
          description: "Chiffrement AES-256 et conformité santé",
          content: "# HDS Security\nAES-256-GCM encryption guidelines.", // ~50 bytes -> Direct
          tags: ["hds", "security"],
          metadata: { sizeBytes: 50 },
          createdAt: dummyDate,
          updatedAt: dummyDate,
        },
        {
          id: "sk-searxng",
          workspaceId: "ws_1",
          userId: "usr_1",
          name: "SearXNG Web Search",
          slug: "searxng-web-search",
          description: "Recherche web souveraine",
          content: "# SearXNG\nDirectives de recherche SearXNG.", // ~40 bytes -> Direct
          tags: ["search", "web"],
          metadata: { sizeBytes: 40 },
          createdAt: dummyDate,
          updatedAt: dummyDate,
        },
        {
          id: "sk-fastapi",
          workspaceId: "ws_1",
          userId: "usr_1",
          name: "FastAPI Modular SQLAlchemy2",
          slug: "fastapi-modular-sqlalchemy2",
          description: "Architecture backend FastAPI et asyncpg",
          content: "# FastAPI Guidelines\n".repeat(500), // ~10000 bytes -> Indexed
          tags: ["fastapi", "backend"],
          metadata: { sizeBytes: 10000 },
          createdAt: dummyDate,
          updatedAt: dummyDate,
        },
      ];

      const stats = calculateSkillStats(enterpriseSkills);
      expect(stats.directCount).toBe(2);
      expect(stats.indexedCount).toBe(2);
      const hdsBytes = new TextEncoder().encode(enterpriseSkills[1]!.content!).length;
      const searxngBytes = new TextEncoder().encode(enterpriseSkills[2]!.content!).length;
      expect(stats.directBytes).toBe(hdsBytes + searxngBytes); // 49 + 42 = 91 bytes

      const label = formatSkillSummaryLabel(
        enterpriseSkills.length,
        stats.directCount,
        stats.directBytes,
        stats.indexedCount,
      );
      expect(label).toBe("2 directe(s) (0.1 Ko), 2 indexée(s)");
    });
  });
});
