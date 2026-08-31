import { describe, expect, it } from "vitest";
import {
  CUMULATIVE_DIRECT_MAX_BYTES,
  DIRECT_INJECTION_MAX_BYTES,
  formatSkillsPrompt,
  type SkillItemLike,
} from "./executor.js";

describe("Milestone 4 Adversarial Challenge: Hybrid Prompt Injection & Budget Limits", () => {
  const workspaceId = "ws-adversarial-test";

  // ==========================================================================
  // 1. EXACT BOUNDARY TESTS: 4095 bytes (direct) vs 4096 bytes (indexed)
  // ==========================================================================
  describe("1. Single Skill Boundary Limits (< 4KB vs >= 4KB)", () => {
    it("1.1 DIRECT: Exactly 4095 bytes of ASCII content is injected directly as markdown", () => {
      const content4095 = "A".repeat(4095);
      expect(Buffer.byteLength(content4095, "utf8")).toBe(4095);

      const skill: SkillItemLike = {
        name: "Boundary 4095",
        slug: "boundary-4095",
        description: "Skill with exact 4095 bytes",
        content: content4095,
        tags: ["boundary", "direct"],
        enabled: true,
      };

      const result = formatSkillsPrompt([skill]);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence active : Boundary 4095 (boundary-4095)");
      expect(result).toContain("```markdown\n" + content4095 + "\n```");
      expect(result).not.toContain("### Compétence indexée");
      expect(result).not.toContain("read_skill(name:");
    });

    it("1.2 INDEXED: Exactly 4096 bytes of ASCII content is downgraded to indexed mode", () => {
      const content4096 = "A".repeat(4096);
      expect(Buffer.byteLength(content4096, "utf8")).toBe(4096);

      const skill: SkillItemLike = {
        name: "Boundary 4096",
        slug: "boundary-4096",
        description: "Skill with exact 4096 bytes",
        content: content4096,
        tags: ["boundary", "indexed"],
        enabled: true,
      };

      const result = formatSkillsPrompt([skill]);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence indexée : Boundary 4096 (boundary-4096)");
      expect(result).toContain('read_skill(name: "boundary-4096")');
      expect(result).toContain("- Taille: 4.0 Ko");
      expect(result).not.toContain("```markdown\n" + content4096);
      expect(result).not.toContain("### Compétence active");
    });

    it("1.3 INDEXED: Exactly 4097 bytes of ASCII content is downgraded to indexed mode", () => {
      const content4097 = "A".repeat(4097);
      expect(Buffer.byteLength(content4097, "utf8")).toBe(4097);

      const skill: SkillItemLike = {
        name: "Boundary 4097",
        slug: "boundary-4097",
        description: "Skill with exact 4097 bytes",
        content: content4097,
        tags: ["boundary", "indexed"],
        enabled: true,
      };

      const result = formatSkillsPrompt([skill]);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence indexée : Boundary 4097 (boundary-4097)");
      expect(result).toContain('read_skill(name: "boundary-4097")');
      expect(result).not.toContain("### Compétence active");
    });

    it("1.4 DIRECT: 0 bytes empty content and 1 byte content are directly injected", () => {
      const emptySkill: SkillItemLike = {
        name: "Empty Skill",
        slug: "empty-skill",
        content: "",
        enabled: true,
      };

      const oneByteSkill: SkillItemLike = {
        name: "One Byte Skill",
        slug: "one-byte-skill",
        content: "X",
        enabled: true,
      };

      const result = formatSkillsPrompt([emptySkill, oneByteSkill]);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence active : Empty Skill (empty-skill)");
      expect(result).toContain("### Compétence active : One Byte Skill (one-byte-skill)");
    });
  });

  // ==========================================================================
  // 2. MULTIBYTE UTF-8 & EMOJI STRESS TESTS
  // ==========================================================================
  describe("2. Multibyte UTF-8 & Emoji Byte Counting Accuracy", () => {
    it("2.1 INDEXED: 1024 4-byte emojis (4096 bytes, string.length=2048) correctly indexed by byte length", () => {
      // 🚀 is 4 UTF-8 bytes: \xF0\x9F\x9A\x80 (2 UTF-16 code units)
      const emojis4096 = "🚀".repeat(1024);
      expect(emojis4096.length).toBe(2048); // string length is 2048 chars
      expect(Buffer.byteLength(emojis4096, "utf8")).toBe(4096); // byte length is exactly 4096 bytes

      const skill: SkillItemLike = {
        name: "Rocket Skill",
        slug: "rocket-skill",
        description: "Skill with 1024 rockets",
        content: emojis4096,
        enabled: true,
      };

      const result = formatSkillsPrompt([skill]);
      expect(result).toBeDefined();
      // Must NOT be treated as direct just because string.length < 4096!
      expect(result).toContain("### Compétence indexée : Rocket Skill (rocket-skill)");
      expect(result).toContain('read_skill(name: "rocket-skill")');
      expect(result).not.toContain("```markdown");
    });

    it("2.2 DIRECT: 1023 4-byte emojis + 3 ASCII chars (4095 bytes) correctly directly injected", () => {
      const emojis4095 = "🚀".repeat(1023) + "ABC"; // 1023 * 4 + 3 = 4095 bytes
      expect(Buffer.byteLength(emojis4095, "utf8")).toBe(4095);

      const skill: SkillItemLike = {
        name: "Near Max Rocket",
        slug: "near-max-rocket",
        description: "Skill with 4095 bytes of emojis and ASCII",
        content: emojis4095,
        enabled: true,
      };

      const result = formatSkillsPrompt([skill]);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence active : Near Max Rocket (near-max-rocket)");
      expect(result).toContain("```markdown\n" + emojis4095 + "\n```");
    });

    it("2.3 INDEXED: 2048 2-byte French accented characters (4096 bytes) correctly indexed", () => {
      // 'é' is 2 UTF-8 bytes: \xC3\xA9
      const accents4096 = "é".repeat(2048);
      expect(accents4096.length).toBe(2048);
      expect(Buffer.byteLength(accents4096, "utf8")).toBe(4096);

      const skill: SkillItemLike = {
        name: "French Accents Skill",
        slug: "french-accents-skill",
        description: "Skill with 2048 accented chars",
        content: accents4096,
        enabled: true,
      };

      const result = formatSkillsPrompt([skill]);
      expect(result).toBeDefined();
      expect(result).toContain(
        "### Compétence indexée : French Accents Skill (french-accents-skill)",
      );
      expect(result).toContain('read_skill(name: "french-accents-skill")');
    });

    it("2.4 DIRECT: French accented content under 4096 bytes (4094 bytes) correctly directly injected", () => {
      const accents4094 = "é".repeat(2047); // 4094 bytes
      expect(Buffer.byteLength(accents4094, "utf8")).toBe(4094);

      const skill: SkillItemLike = {
        name: "French Direct Skill",
        slug: "french-direct-skill",
        content: accents4094,
        enabled: true,
      };

      const result = formatSkillsPrompt([skill]);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence active : French Direct Skill (french-direct-skill)");
    });
  });

  // ==========================================================================
  // 3. CUMULATIVE 32KB DIRECT BUDGET CLAMPING (32,768 BYTES)
  // ==========================================================================
  describe("3. Cumulative 32KB Direct Injection Budget Clamping", () => {
    it("3.1 clamps cumulative budget at exactly 32768 bytes across multiple skills", () => {
      // 8 skills of 4095 bytes each = 32,760 bytes.
      // 9th skill of 8 bytes = 32,760 + 8 = 32,768 bytes (exact budget hit -> DIRECT).
      // 10th skill of 1 byte = 32,768 + 1 = 32,769 bytes (budget exceeded -> INDEXED).
      const skills: SkillItemLike[] = [];

      for (let i = 1; i <= 8; i++) {
        skills.push({
          name: `Skill ${i}`,
          slug: `skill-${i}`,
          content: "A".repeat(4095),
          enabled: true,
        });
      }

      skills.push({
        name: "Skill 9 (Exact Budget)",
        slug: "skill-9",
        content: "B".repeat(8),
        enabled: true,
      });

      skills.push({
        name: "Skill 10 (Overflow)",
        slug: "skill-10",
        content: "C".repeat(1),
        enabled: true,
      });

      const result = formatSkillsPrompt(skills);
      expect(result).toBeDefined();

      const directMatches = (result?.match(/### Compétence active/g) || []).length;
      const indexedMatches = (result?.match(/### Compétence indexée/g) || []).length;

      expect(directMatches).toBe(9); // Skills 1 through 9
      expect(indexedMatches).toBe(1); // Skill 10
      expect(result).toContain("### Compétence active : Skill 9 (Exact Budget) (skill-9)");
      expect(result).toContain("### Compétence indexée : Skill 10 (Overflow) (skill-10)");
      expect(result).toContain('read_skill(name: "skill-10")');
    });

    it("3.2 10 direct skills summing to 35KB: first 9 direct, 10th auto-downgraded to indexed", () => {
      // 10 skills of 3500 bytes (each < 4096 bytes).
      // 1: 3500 (cumul 3500) -> Direct
      // 2: 3500 (cumul 7000) -> Direct
      // ...
      // 9: 3500 (cumul 31500) -> Direct
      // 10: 3500 (cumul 31500 + 3500 = 35000 > 32768) -> Indexed
      const skills: SkillItemLike[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Pack Skill ${i + 1}`,
        slug: `pack-skill-${i + 1}`,
        description: `Pack skill ${i + 1} description`,
        content: "x".repeat(3500),
        tags: [`tag-${i + 1}`],
        enabled: true,
      }));

      const result = formatSkillsPrompt(skills);
      expect(result).toBeDefined();

      const directMatches = (result?.match(/### Compétence active/g) || []).length;
      const indexedMatches = (result?.match(/### Compétence indexée/g) || []).length;

      expect(directMatches).toBe(9);
      expect(indexedMatches).toBe(1);

      expect(result).toContain("### Compétence active : Pack Skill 9 (pack-skill-9)");
      expect(result).toContain("### Compétence indexée : Pack Skill 10 (pack-skill-10)");
      expect(result).toContain('read_skill(name: "pack-skill-10")');
    });

    it("3.3 non-injected skill does not consume budget: subsequent smaller skill fits within remaining budget", () => {
      // Skill 1: 31,000 bytes (Direct) -> cumul = 31,000
      // Skill 2: 3,000 bytes -> 31,000 + 3,000 = 34,000 > 32,768 -> Indexed!
      // Skill 3: 1,000 bytes -> 31,000 + 1,000 = 32,000 <= 32,768 -> Direct!
      // Skill 4: 1,000 bytes -> 32,000 + 1,000 = 33,000 > 32,768 -> Indexed!
      const skills: SkillItemLike[] = [
        {
          name: "Large Direct",
          slug: "large-direct",
          content: "A".repeat(3900), // < 4096
          enabled: true,
        },
      ];

      // Build up to ~31,200 bytes with 8 skills of 3900 bytes
      const bulkSkills: SkillItemLike[] = Array.from({ length: 8 }, (_, i) => ({
        name: `Bulk ${i + 1}`,
        slug: `bulk-${i + 1}`,
        content: "A".repeat(3900), // 8 * 3900 = 31,200 bytes
        enabled: true,
      }));

      // 9th skill: 3000 bytes -> 31,200 + 3000 = 34,200 > 32,768 -> Downgraded to Indexed
      const overflowSkill: SkillItemLike = {
        name: "Overflow Skill",
        slug: "overflow-skill",
        content: "B".repeat(3000),
        enabled: true,
      };

      // 10th skill: 1000 bytes -> 31,200 + 1000 = 32,200 <= 32,768 -> Fits as Direct!
      const fitsSkill: SkillItemLike = {
        name: "Fits Skill",
        slug: "fits-skill",
        content: "C".repeat(1000),
        enabled: true,
      };

      // 11th skill: 1000 bytes -> 32,200 + 1000 = 33,200 > 32,768 -> Indexed
      const overflow2Skill: SkillItemLike = {
        name: "Overflow 2 Skill",
        slug: "overflow-2-skill",
        content: "D".repeat(1000),
        enabled: true,
      };

      const testSkills = [...bulkSkills, overflowSkill, fitsSkill, overflow2Skill];
      const result = formatSkillsPrompt(testSkills);
      expect(result).toBeDefined();

      const directMatches = (result?.match(/### Compétence active/g) || []).length;
      const indexedMatches = (result?.match(/### Compétence indexée/g) || []).length;

      expect(directMatches).toBe(9); // 8 bulk + 1 fits
      expect(indexedMatches).toBe(2); // overflow + overflow2

      expect(result).toContain("### Compétence active : Fits Skill (fits-skill)");
      expect(result).toContain("### Compétence indexée : Overflow Skill (overflow-skill)");
      expect(result).toContain("### Compétence indexée : Overflow 2 Skill (overflow-2-skill)");
    });
  });

  // ==========================================================================
  // 4. EMPTY, NULL, UNDEFINED & EDGE-CASE INPUTS
  // ==========================================================================
  describe("4. Edge-Cases, Degenerate Inputs & Metadata Formatting", () => {
    it("4.1 returns undefined when activeSkills is empty", () => {
      expect(formatSkillsPrompt([])).toBeUndefined();
    });

    it("4.2 returns undefined when all skills are disabled (enabled: false)", () => {
      const disabledSkills: SkillItemLike[] = [
        { name: "S1", slug: "s1", content: "c1", enabled: false },
        { name: "S2", slug: "s2", content: "c2", enabled: false },
      ];
      expect(formatSkillsPrompt(disabledSkills)).toBeUndefined();
    });

    it("4.3 treats enabled: undefined and enabled: true as active", () => {
      const skills: SkillItemLike[] = [
        { name: "Default Enabled", slug: "default-enabled", content: "c1" }, // enabled is undefined
        { name: "Explicit Enabled", slug: "explicit-enabled", content: "c2", enabled: true },
        { name: "Explicit Disabled", slug: "explicit-disabled", content: "c3", enabled: false },
      ];

      const result = formatSkillsPrompt(skills);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence active : Default Enabled (default-enabled)");
      expect(result).toContain("### Compétence active : Explicit Enabled (explicit-enabled)");
      expect(result).not.toContain("Explicit Disabled");
    });

    it("4.4 handles tags in multiple formats: string array, comma string, null, undefined, numbers", () => {
      const skills: SkillItemLike[] = [
        {
          name: "Array Tags",
          slug: "array-tags",
          content: "c",
          tags: ["alpha", "beta", "gamma"],
          enabled: true,
        },
        {
          name: "String Tags",
          slug: "string-tags",
          content: "c",
          tags: "single-tag, another-tag",
          enabled: true,
        },
        {
          name: "Null Tags",
          slug: "null-tags",
          content: "c",
          tags: null,
          enabled: true,
        },
        {
          name: "Mixed Array Tags",
          slug: "mixed-tags",
          content: "c",
          tags: [123, true, "sanitized", ""],
          enabled: true,
        },
      ];

      const result = formatSkillsPrompt(skills);
      expect(result).toBeDefined();
      expect(result).toContain("Tags: alpha, beta, gamma");
      expect(result).toContain("Tags: single-tag, another-tag");
      expect(result).toContain("Tags: \n");
      expect(result).toContain("Tags: 123, true, sanitized");
    });

    it("4.5 handles null/undefined/missing description gracefully in direct and indexed modes", () => {
      const directNoDesc: SkillItemLike = {
        name: "Direct No Desc",
        slug: "direct-no-desc",
        description: null,
        content: "short content",
        enabled: true,
      };

      const indexedNoDesc: SkillItemLike = {
        name: "Indexed No Desc",
        slug: "indexed-no-desc",
        description: undefined,
        content: "A".repeat(5000),
        enabled: true,
      };

      const result = formatSkillsPrompt([directNoDesc, indexedNoDesc]);
      expect(result).toBeDefined();
      expect(result).toContain("### Compétence active : Direct No Desc (direct-no-desc)\nTags:");
      expect(result).toContain(
        "### Compétence indexée : Indexed No Desc (indexed-no-desc)\n- Description: Aucune description",
      );
    });

    it("4.6 truncates list to maximum 20 skills to protect LLM context length", () => {
      const thirtySkills: SkillItemLike[] = Array.from({ length: 30 }, (_, i) => ({
        name: `Skill ${i + 1}`,
        slug: `skill-${i + 1}`,
        content: `Content for skill ${i + 1}`,
        enabled: true,
      }));

      const result = formatSkillsPrompt(thirtySkills);
      expect(result).toBeDefined();

      const activeMatches = (result?.match(/### Compétence active : Skill/g) || []).length;
      expect(activeMatches).toBe(20);
      expect(result).toContain("### Compétence active : Skill 1 (skill-1)");
      expect(result).toContain("### Compétence active : Skill 20 (skill-20)");
      expect(result).not.toContain("Skill 21 (skill-21)");
      expect(result).not.toContain("Skill 30 (skill-30)");
    });

    it("4.7 correctly exports constants DIRECT_INJECTION_MAX_BYTES and CUMULATIVE_DIRECT_MAX_BYTES", () => {
      expect(DIRECT_INJECTION_MAX_BYTES).toBe(4096);
      expect(CUMULATIVE_DIRECT_MAX_BYTES).toBe(32768);
    });
  });
});
