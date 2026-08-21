import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://rakazo:rakazo@127.0.0.1:5433/rakazo",
  NODE_ENV: "test",
};

describe("loadEnv", () => {
  it("defaults the product path to Pi, Docker, and Graphile Worker", () => {
    const env = loadEnv(base);
    expect(env.agentRuntime).toBe("pi");
    expect(env.sandboxProvider).toBe("docker");
    expect(env.wakeupDriver).toBe("graphile");
  });

  it("keeps explicit emulator settings for pnpm test", () => {
    const env = loadEnv({
      ...base,
      AGENT_RUNTIME: "scripted",
      SANDBOX_PROVIDER: "fake",
      WAKEUP_DRIVER: "memory",
    });
    expect(env.agentRuntime).toBe("scripted");
    expect(env.sandboxProvider).toBe("fake");
    expect(env.wakeupDriver).toBe("memory");
  });

  it("loads provider-specific Daytona configuration", () => {
    const env = loadEnv({
      ...base,
      SANDBOX_PROVIDER: "daytona",
      DAYTONA_API_KEY: "test-daytona-key",
      DAYTONA_API_URL: "https://daytona.test/api",
      DAYTONA_TARGET: "test-target",
    });
    expect(env).toMatchObject({
      sandboxProvider: "daytona",
      daytonaApiKey: "test-daytona-key",
      daytonaApiUrl: "https://daytona.test/api",
      daytonaTarget: "test-target",
    });
  });

  it("loads provider-specific Box configuration", () => {
    const env = loadEnv({
      ...base,
      SANDBOX_PROVIDER: "box",
      BOX_API_KEY: "test-box-key",
      BOX_API_URL: "https://box.test/api/v1",
    });
    expect(env).toMatchObject({
      sandboxProvider: "box",
      boxApiKey: "test-box-key",
      boxApiUrl: "https://box.test/api/v1",
    });
  });

  it("throws when production omits secrets", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: base.DATABASE_URL,
        NODE_ENV: "production",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("throws when production uses placeholder secrets", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: base.DATABASE_URL,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "dev-secret-change-me-please-32chars",
        ENCRYPTION_KEY: "real-encryption-key-value",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("loads real secrets in production", () => {
    const env = loadEnv({
      DATABASE_URL: base.DATABASE_URL,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
      ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
    });
    expect(env.authSecret).toBe("prod-auth-secret-with-enough-length");
    expect(env.encryptionKey).toBe("prod-encryption-key-with-enough-length");
  });

  it("exposes a deployed git revision when GIT_SHA is set", () => {
    expect(loadEnv(base).gitSha).toBeUndefined();
    expect(loadEnv({ ...base, GIT_SHA: "  3c6e209  " }).gitSha).toBe("3c6e209");
    expect(loadEnv({ ...base, RAKAZO_GIT_SHA: "abc1234" }).gitSha).toBe("abc1234");
  });

  it("loads Enterprise and search/scrape environment variables", () => {
    const env = loadEnv({
      ...base,
      SEARXNG_URL: "http://searxng.internal:8080",
      SCRAPERR_URL: "http://scraperr.internal:3000",
      GITHUB_TOKEN: "ghp_secret_token",
      GITHUB_API_URL: "https://github.enterprise.local/api/v3",
      NOTION_API_KEY: "secret_notion_key",
      POSTIZ_API_KEY: "postiz_secret_key",
      POSTIZ_API_URL: "https://postiz.custom.domain",
      WORDPRESS_URL: "https://blog.example.com",
      WORDPRESS_USERNAME: "admin_wp",
      WORDPRESS_APP_PASSWORD: "abcd efgh ijkl mnop",
      NOVAMIRA_API_KEY: "nova_live_key",
      N8N_API_KEY: "n8n_live_key",
      N8N_API_URL: "https://n8n.workflow.io",
      CLOUDFLARE_API_TOKEN: "cf_token_123",
      CLOUDFLARE_ACCOUNT_ID: "cf_acc_456",
    });

    expect(env).toMatchObject({
      searxngUrl: "http://searxng.internal:8080",
      scraperrUrl: "http://scraperr.internal:3000",
      githubToken: "ghp_secret_token",
      githubApiUrl: "https://github.enterprise.local/api/v3",
      notionApiKey: "secret_notion_key",
      postizApiKey: "postiz_secret_key",
      postizApiUrl: "https://postiz.custom.domain",
      wordpressUrl: "https://blog.example.com",
      wordpressUsername: "admin_wp",
      wordpressAppPassword: "abcd efgh ijkl mnop",
      novamiraApiKey: "nova_live_key",
      n8nApiKey: "n8n_live_key",
      n8nApiUrl: "https://n8n.workflow.io",
      cloudflareApiToken: "cf_token_123",
      cloudflareAccountId: "cf_acc_456",
    });
  });
});
