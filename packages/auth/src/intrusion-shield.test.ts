import { describe, expect, it } from "vitest";
import {
  AuthIntrusionShield,
  evaluateCsrfRequestSafety,
  extractSpoofProofClientIp,
  HARDENED_CSP_HEADER,
  isHttpsProductionOrigin,
  isSensitiveAuthMutation,
  maskIpForAudit,
} from "./intrusion-shield.js";

describe("Rakazo Invisible Server Intrusion Shield (Zero-Friction Mobile & Desktop)", () => {
  it("defeats X-Forwarded-For spoofing behind Traefik and Vite Docker proxy", () => {
    // Attacker injects fake 1.2.3.4, Traefik appends real peer 198.51.100.42, Vite xfwd appends Docker 172.20.0.5
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 8.8.8.8, 198.51.100.42, 172.20.0.5",
    });
    expect(extractSpoofProofClientIp(headers)).toBe("198.51.100.42");
    expect(maskIpForAudit("198.51.100.42")).toBe("198.51.100.xxx");

    // Local development loopback fallback
    const localHeaders = new Headers({ "x-forwarded-for": "127.0.0.1" });
    expect(extractSpoofProofClientIp(localHeaders)).toBe("127.0.0.1");
  });

  it("bans brute-force attacker IPs progressively (15m -> 1h -> 6h) while NEVER locking out the owner's phone or Mac", () => {
    const shield = new AuthIntrusionShield();
    const t0 = 1_700_000_000_000;
    const attackerIp = "198.51.100.99";
    const ownerIphone5gIp = "203.0.113.15";
    const ownerMacWifiIp = "192.0.2.44";

    // Attacker hammers login 6 times
    for (let i = 1; i <= 5; i++) {
      const res = shield.recordAuthOutcome(attackerIp, false, t0 + i * 1000);
      expect(res.newlyBanned).toBe(false);
    }
    const sixth = shield.recordAuthOutcome(attackerIp, false, t0 + 6000);
    expect(sixth.newlyBanned).toBe(true);
    expect(sixth.strikeCount).toBe(1);
    expect(sixth.retryAfterSec).toBe(900); // 15 min

    // Attacker is now blocked
    expect(shield.evaluatePreAuth(attackerIp, t0 + 7000).allowed).toBe(false);

    // Owner's iPhone (5G) and Mac (Wi-Fi) remain 100% unaffected and log in with zero friction
    expect(shield.evaluatePreAuth(ownerIphone5gIp, t0 + 7000).allowed).toBe(true);
    expect(shield.evaluatePreAuth(ownerMacWifiIp, t0 + 7000).allowed).toBe(true);

    // If owner mistypes password 3 times on iPhone and succeeds on 4th try, counter resets immediately
    shield.recordAuthOutcome(ownerIphone5gIp, false, t0 + 8000);
    shield.recordAuthOutcome(ownerIphone5gIp, false, t0 + 9000);
    shield.recordAuthOutcome(ownerIphone5gIp, false, t0 + 10_000);
    const success = shield.recordAuthOutcome(ownerIphone5gIp, true, t0 + 11_000);
    expect(success.recentFailures).toBe(0);

    // Repeat offender escalates to 1 hour (3600s) after first 15m ban expires
    const after16Min = t0 + 16 * 60 * 1000;
    expect(shield.evaluatePreAuth(attackerIp, after16Min).allowed).toBe(true);
    for (let i = 1; i <= 6; i++) {
      shield.recordAuthOutcome(attackerIp, false, after16Min + i * 1000);
    }
    const secondStrike = shield.evaluatePreAuth(attackerIp, after16Min + 7000);
    expect(secondStrike.allowed).toBe(false);
    expect(secondStrike.strikeCount).toBe(2);
    expect(secondStrike.retryAfterSec).toBeGreaterThan(3500);
  });

  it("never rate-limits passive session checks (GET /get-session) or sign-out", () => {
    expect(isSensitiveAuthMutation("GET", "/get-session")).toBe(false);
    expect(isSensitiveAuthMutation("POST", "/sign-out")).toBe(false);
    expect(isSensitiveAuthMutation("POST", "/sign-in/email")).toBe(true);
    expect(isSensitiveAuthMutation("POST", "/sign-up/email")).toBe(true);
    expect(isSensitiveAuthMutation("POST", "/forget-password")).toBe(true);
  });

  it("enforces CSRF Origin & Sec-Fetch-Site protection while preserving mobile, desktop, and Bearer clients", () => {
    const trusted = (o: string) => o === "https://rakazo.example.com" || o.startsWith("rakazo://");

    // Legitimate browser POST on iPhone/Mac
    const okBrowser = new Request("https://rakazo.example.com/rpc/bots.list", {
      method: "POST",
      headers: { origin: "https://rakazo.example.com", cookie: "better-auth.session_token=abc" },
    });
    expect(evaluateCsrfRequestSafety(okBrowser, trusted, true).allowed).toBe(true);

    // Legitimate native app with rakazo:// or Bearer token
    const okNative = new Request("https://rakazo.example.com/rpc/bots.list", {
      method: "POST",
      headers: { authorization: "Bearer token_123" },
    });
    expect(evaluateCsrfRequestSafety(okNative, trusted, true).allowed).toBe(true);

    // Malicious cross-origin CSRF POST from evil domain
    const evilOrigin = new Request("https://rakazo.example.com/rpc/bots.create", {
      method: "POST",
      headers: { origin: "https://evil-attacker.example", cookie: "better-auth.session_token=abc" },
    });
    expect(evaluateCsrfRequestSafety(evilOrigin, trusted, true)).toEqual({
      allowed: false,
      reason: "untrusted_origin",
      origin: "https://evil-attacker.example",
    });

    // Cross-site form POST with stripped Origin in HTTPS production
    const crossSiteForm = new Request("https://rakazo.example.com/api/auth/sign-out", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", cookie: "better-auth.session_token=abc" },
    });
    expect(evaluateCsrfRequestSafety(crossSiteForm, trusted, true)).toEqual({
      allowed: false,
      reason: "cross_site_cookie_mutation",
      origin: "cross-site",
    });
  });

  it("isolates HTTPS production origins from localhost while keeping calibrated non-breaking CSP", () => {
    expect(isHttpsProductionOrigin("https://rakazo.example.com", "production")).toBe(true);
    expect(isHttpsProductionOrigin("http://127.0.0.1:5173", "production")).toBe(false);
    expect(isHttpsProductionOrigin("https://rakazo.example.com", "development")).toBe(false);

    // CSP blocks clickjacking & form hijacking while allowing SSE, Voice blob:, WebSockets, and Sandboxed Artifacts
    expect(HARDENED_CSP_HEADER).toContain("frame-ancestors 'self'");
    expect(HARDENED_CSP_HEADER).toContain("form-action 'self'");
    expect(HARDENED_CSP_HEADER).toContain("object-src 'none'");
    expect(HARDENED_CSP_HEADER).toContain("connect-src 'self' https: wss: ws:");
    expect(HARDENED_CSP_HEADER).toContain("media-src 'self' data: blob: https:");
    expect(HARDENED_CSP_HEADER).toContain("frame-src 'self' blob: data:");
  });
});
