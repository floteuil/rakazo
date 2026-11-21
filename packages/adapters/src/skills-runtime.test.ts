import type { ConnectorTool } from "@rakazo/adapter-kit";
import { createStreamingRedactor } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";

// ============================================================================
// HYBRID PROMPT INJECTION & READ_SKILL RUNTIME HARNESS
// ============================================================================

export interface SkillItem {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

export const DIRECT_INJECTION_MAX_BYTES = 4096; // 4 KB
export const CUMULATIVE_DIRECT_MAX_BYTES = 32768; // 32 KB (~8,000 tokens)

export function formatSkillsPrompt(activeSkills: SkillItem[]): string | undefined {
  const enabledSkills = activeSkills.filter((s) => s.enabled !== false);
  if (enabledSkills.length === 0) return undefined;

  let cumulativeDirectBytes = 0;
  const formattedSections: string[] = [];

  for (const skill of enabledSkills.slice(0, 20)) {
    const contentLength = Buffer.byteLength(skill.content, "utf8");
    const isDirect =
      contentLength < DIRECT_INJECTION_MAX_BYTES &&
      cumulativeDirectBytes + contentLength <= CUMULATIVE_DIRECT_MAX_BYTES;

    if (isDirect) {
      cumulativeDirectBytes += contentLength;
      const tagsStr = Array.isArray(skill.tags) ? skill.tags.join(", ") : "";
      formattedSections.push(
        `### Compétence active : ${skill.name} (${skill.slug})\n${skill.description ? `${skill.description}\n` : ""}Tags: ${tagsStr}\n\n\`\`\`markdown\n${skill.content}\n\`\`\``,
      );
    } else {
      const tagsStr = Array.isArray(skill.tags) ? skill.tags.join(", ") : "";
      formattedSections.push(
        `### Compétence indexée : ${skill.name} (${skill.slug})\n- Description: ${skill.description || "Aucune description"}\n- Tags: ${tagsStr}\n- Taille: ${(contentLength / 1024).toFixed(1)} Ko\n- Directive: Ce skill volumineux est indexé. Pour charger ses instructions complètes, appelez l'outil \`read_skill(name: "${skill.slug}")\` lorsque pertinent.`,
      );
    }
  }

  if (formattedSections.length === 0) return undefined;
  return `## Compétences & Connaissances Spécialisées de l'Agent\n\n${formattedSections.join("\n\n")}`;
}

export function prepareReadSkillArgs(raw: Record<string, unknown>): { name: string } {
  const target = String(raw.name ?? raw.skill ?? raw.target ?? "").trim();
  return { name: target };
}

export async function executeReadSkillTool(
  workspaceId: string,
  args: { name: string },
  skillStore: SkillItem[],
): Promise<{
  name?: string;
  slug?: string;
  description?: string;
  tags?: string[];
  content?: string;
  error?: string;
}> {
  const target = (args.name || "").trim().toLowerCase();
  if (!target) {
    return { error: "Paramètre 'name' manquant pour read_skill." };
  }

  const skill = skillStore.find(
    (s) =>
      s.workspaceId === workspaceId &&
      (s.slug.toLowerCase() === target ||
        s.name.toLowerCase() === target ||
        s.id.toLowerCase() === target),
  );

  if (!skill) {
    return { error: `Skill '${target}' not found in workspace.` };
  }

  return {
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    tags: skill.tags,
    content: skill.content,
  };
}

// ============================================================================
// 4-TIER RUNTIME TEST SUITE
// ============================================================================

describe("Pi-Runtime Hybrid Injection & read_skill Tool (4-Tier Suite)", () => {
  const workspaceId = "ws-prod-paris";

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    describe("Hybrid Prompt Formatting", () => {
      it("1.1 formats small skills (<4KB) as direct markdown injection", () => {
        const smallSkill: SkillItem = {
          id: "sk-small",
          workspaceId,
          name: "TypeScript Pro",
          slug: "typescript-pro",
          description: "Strict typing rules",
          content: "# TypeScript Rules\n- Enable strict mode\n- Avoid any",
          tags: ["typescript", "frontend"],
          enabled: true,
        };

        const prompt = formatSkillsPrompt([smallSkill]);
        expect(prompt).toBeDefined();
        expect(prompt).toContain("## Compétences & Connaissances Spécialisées de l'Agent");
        expect(prompt).toContain("### Compétence active : TypeScript Pro (typescript-pro)");
        expect(prompt).toContain("```markdown\n# TypeScript Rules");
      });

      it("1.2 formats large skills (>=4KB) as condensed index with read_skill directive", () => {
        const largeSkill: SkillItem = {
          id: "sk-large",
          workspaceId,
          name: "Docling Document Parser",
          slug: "docling-document-parser",
          description: "IBM Docling manual and complex table extraction",
          content: "A".repeat(5000), // 5KB
          tags: ["parser", "pdf", "rag"],
          enabled: true,
        };

        const prompt = formatSkillsPrompt([largeSkill]);
        expect(prompt).toBeDefined();
        expect(prompt).toContain(
          "### Compétence indexée : Docling Document Parser (docling-document-parser)",
        );
        expect(prompt).toContain('read_skill(name: "docling-document-parser")');
        expect(prompt).not.toContain("```markdown\nAAAA"); // Large content omitted from prompt
      });

      it("1.3 omits prompt header entirely when bot has zero active skills", () => {
        expect(formatSkillsPrompt([])).toBeUndefined();
      });

      it("1.4 excludes skills when enabled is false", () => {
        const disabledSkill: SkillItem = {
          id: "sk-disabled",
          workspaceId,
          name: "Inactive Skill",
          slug: "inactive-skill",
          description: "Disabled",
          content: "content",
          tags: [],
          enabled: false,
        };

        expect(formatSkillsPrompt([disabledSkill])).toBeUndefined();
      });

      it("1.5 handles multiple direct skills preserving chronological order and metadata", () => {
        const skills: SkillItem[] = [
          {
            id: "s1",
            workspaceId,
            name: "Skill Alpha",
            slug: "skill-alpha",
            description: "First",
            content: "Content 1",
            tags: ["alpha"],
            enabled: true,
          },
          {
            id: "s2",
            workspaceId,
            name: "Skill Beta",
            slug: "skill-beta",
            description: "Second",
            content: "Content 2",
            tags: ["beta"],
            enabled: true,
          },
        ];

        const prompt = formatSkillsPrompt(skills);
        expect(prompt).toContain("### Compétence active : Skill Alpha");
        expect(prompt).toContain("### Compétence active : Skill Beta");
        expect(prompt?.indexOf("Skill Alpha")).toBeLessThan(prompt?.indexOf("Skill Beta")!);
      });
    });

    describe("read_skill Builtin Tool", () => {
      it("1.6 prepares arguments from either 'name' or 'skill' parameter keys", () => {
        expect(prepareReadSkillArgs({ name: "docker-expert" })).toEqual({ name: "docker-expert" });
        expect(prepareReadSkillArgs({ skill: "docker-expert" })).toEqual({ name: "docker-expert" });
        expect(prepareReadSkillArgs({ target: "docker-expert" })).toEqual({
          name: "docker-expert",
        });
      });

      it("1.7 executes read_skill and returns full content and metadata by slug", async () => {
        const store: SkillItem[] = [
          {
            id: "s-docling",
            workspaceId,
            name: "Docling Document Parser",
            slug: "docling-document-parser",
            description: "PDF parsing",
            content: "# Complete Docling Manual\nDetailed step by step parsing guide.",
            tags: ["pdf", "docling"],
          },
        ];

        const result = await executeReadSkillTool(
          workspaceId,
          { name: "docling-document-parser" },
          store,
        );

        expect(result.error).toBeUndefined();
        expect(result.name).toBe("Docling Document Parser");
        expect(result.slug).toBe("docling-document-parser");
        expect(result.content).toContain("# Complete Docling Manual");
        expect(result.tags).toEqual(["pdf", "docling"]);
      });

      it("1.8 matches skill by case-insensitive name or ID", async () => {
        const store: SkillItem[] = [
          {
            id: "cuid-skill-999",
            workspaceId,
            name: "Kubernetes Operator",
            slug: "kubernetes-operator",
            description: "K8s",
            content: "K8s guide",
            tags: ["k8s"],
          },
        ];

        // Search by case-insensitive name
        const byName = await executeReadSkillTool(
          workspaceId,
          { name: "kubernetes operator" },
          store,
        );
        expect(byName.slug).toBe("kubernetes-operator");

        // Search by exact ID
        const byId = await executeReadSkillTool(workspaceId, { name: "cuid-skill-999" }, store);
        expect(byId.slug).toBe("kubernetes-operator");
      });

      it("1.9 registers read_skill in builtinAgentTools with name inputSchema and matches executor export", async () => {
        const readSkillTool = builtinAgentTools.find((t) => t.name === "read_skill");
        expect(readSkillTool).toBeDefined();
        expect(readSkillTool?.description).toContain("Read the full markdown documentation");
        expect(readSkillTool?.inputSchema).toMatchObject({
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        });

        const { formatSkillsPrompt: executorFormatSkillsPrompt } = await import("./executor.js");
        const sampleSkill = {
          name: "Sample Skill",
          slug: "sample-skill",
          content: "Sample content",
        };
        const prompt = executorFormatSkillsPrompt([sampleSkill]);
        expect(prompt).toContain("### Compétence active : Sample Skill (sample-skill)");
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 handles non-existent skill in read_skill gracefully with structured error", async () => {
      const store: SkillItem[] = [];
      const result = await executeReadSkillTool(workspaceId, { name: "non-existent-skill" }, store);

      expect(result.error).toBe("Skill 'non-existent-skill' not found in workspace.");
      expect(result.content).toBeUndefined();
    });

    it("2.2 clamps cumulative direct injection budget at 32KB and downgrades excess skills to index", () => {
      // 10 skills, each 3.5 KB (3584 bytes).
      // First 9 skills = 32,256 bytes <= 32,768 (Direct mode).
      // 10th skill exceeds cumulative 32KB budget -> Downgraded to Indexed mode.
      const skills: SkillItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `s-${i}`,
        workspaceId,
        name: `Skill Number ${i + 1}`,
        slug: `skill-number-${i + 1}`,
        description: `Description ${i + 1}`,
        content: "x".repeat(3584), // 3.5 KB
        tags: [`tag-${i + 1}`],
        enabled: true,
      }));

      const prompt = formatSkillsPrompt(skills);
      expect(prompt).toBeDefined();

      // Count direct vs indexed occurrences
      const directMatches = (prompt?.match(/### Compétence active/g) || []).length;
      const indexedMatches = (prompt?.match(/### Compétence indexée/g) || []).length;

      expect(directMatches).toBe(9);
      expect(indexedMatches).toBe(1);
      expect(prompt).toContain("### Compétence indexée : Skill Number 10");
    });

    it("2.3 preserves secret redaction on skill outputs containing API tokens", () => {
      const redactor = createStreamingRedactor([
        "sk-ant-api03-topsecretkey12345",
        "ghp_supertoken9876",
      ]);

      const chunk1 = "# Deployment Helper\nRun command with token: sk-ant-api03-top";
      const chunk2 = "secretkey12345\nGitHub token: ghp_supertoken9876\n";

      const redacted = redactor.push(chunk1) + redactor.push(chunk2) + redactor.finish();
      expect(redacted).not.toContain("sk-ant-api03-topsecretkey12345");
      expect(redacted).not.toContain("ghp_supertoken9876");
      expect(redacted).toContain("[redacted]");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 handles mixed direct (<4KB) and indexed (>=4KB) skills in single agent context", async () => {
      const skills: SkillItem[] = [
        {
          id: "sk-direct",
          workspaceId,
          name: "TypeScript Coding Standards",
          slug: "typescript-coding-standards",
          description: "Core coding guidelines",
          content: "Always use strict typing.", // ~25 bytes -> Direct
          tags: ["ts", "dev"],
          enabled: true,
        },
        {
          id: "sk-indexed",
          workspaceId,
          name: "IBM Docling Comprehensive Manual",
          slug: "docling-comprehensive-manual",
          description: "Massive documentation and architecture guide",
          content: "# Docling Architecture\n" + "Detailed parser instructions.\n".repeat(200), // ~6KB -> Indexed
          tags: ["docling", "pdf", "rag"],
          enabled: true,
        },
      ];

      // Step 1: Format Prompt
      const prompt = formatSkillsPrompt(skills);
      expect(prompt).toContain("### Compétence active : TypeScript Coding Standards");
      expect(prompt).toContain("Always use strict typing.");
      expect(prompt).toContain("### Compétence indexée : IBM Docling Comprehensive Manual");
      expect(prompt).toContain('read_skill(name: "docling-comprehensive-manual")');

      // Step 2: Simulate agent invoking read_skill for the indexed skill
      const toolResult = await executeReadSkillTool(
        workspaceId,
        { name: "docling-comprehensive-manual" },
        skills,
      );
      expect(toolResult.error).toBeUndefined();
      expect(toolResult.content).toContain("# Docling Architecture");
      expect(toolResult.tags).toEqual(["docling", "pdf", "rag"]);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 executes enterprise pipeline for Healthcare HDS Security with French prompt compliance", async () => {
      const hdsSkill: SkillItem = {
        id: "sk-hds-2026",
        workspaceId,
        name: "HDS Healthcare Security",
        slug: "hds-healthcare-security",
        description: "Normes HDS / RGPD Santé France et chiffrement AES-256",
        content: `
# Sécurité des Données de Santé
1. Tout flux transitant sur le réseau interne doit être chiffré.
2. Les jetons applicatifs et tokens secrets ne doivent jamais être loggués en clair.
3. Conserver un journal d'audit immuable.
`,
        tags: ["securite", "hds", "sante", "chiffrement"],
        enabled: true,
      };

      const prompt = formatSkillsPrompt([hdsSkill]);
      expect(prompt).toContain("## Compétences & Connaissances Spécialisées de l'Agent");
      expect(prompt).toContain(
        "### Compétence active : HDS Healthcare Security (hds-healthcare-security)",
      );
      expect(prompt).toContain("Normes HDS / RGPD Santé France");
      expect(prompt).toContain("Sécurité des Données de Santé");

      const toolResult = await executeReadSkillTool(
        workspaceId,
        { name: "hds-healthcare-security" },
        [hdsSkill],
      );
      expect(toolResult.name).toBe("HDS Healthcare Security");
      expect(toolResult.content).toContain(
        "Tout flux transitant sur le réseau interne doit être chiffré.",
      );
    });
  });
});
