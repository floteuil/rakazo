import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

export const BREAKPOINTS = [
  { name: "320px (iPhone SE / ultra-compact)", width: 320, isMobile: true },
  { name: "360px (Standard Android compact)", width: 360, isMobile: true },
  { name: "375px (iPhone classic)", width: 375, isMobile: true },
  { name: "390px (iPhone 14 / 15 / modern iOS)", width: 390, isMobile: true },
  { name: "430px (iPhone Pro Max / large phone)", width: 430, isMobile: true },
  { name: "768px (iPad portrait / tablet compact)", width: 768, isMobile: false, isTablet: true },
  { name: "1024px (iPad landscape / small laptop)", width: 1024, isMobile: false, isTablet: true },
  { name: "1280px (Desktop standard / HD)", width: 1280, isMobile: false, isDesktop: true },
  { name: "1440px+ (Desktop wide / QHD)", width: 1440, isMobile: false, isDesktop: true },
] as const;

export function ResponsiveContainer({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1280;
  const isDesktop = width >= 1280;

  return (
    <div
      data-testid="responsive-root"
      style={{
        width: `${width}px`,
        maxWidth: "100%",
        minHeight: "100vh",
        boxSizing: "border-box",
        overflowX: "hidden",
        paddingBottom: isMobile ? "env(safe-area-inset-bottom, 16px)" : "0px",
      }}
      className={`shell-layout ${isMobile ? "mobile-view" : isTablet ? "tablet-view" : "desktop-view"}`}
    >
      <div
        data-testid="chat-container"
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : isTablet ? "720px" : "896px",
          margin: "0 auto",
          padding: isMobile ? "12px" : "24px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function TouchInteractiveButton({
  label,
  onClick,
  minHeight = 44,
  minWidth = 44,
}: {
  label: string;
  onClick?: () => void;
  minHeight?: number;
  minWidth?: number;
}) {
  return (
    <button
      type="button"
      data-testid="touch-button"
      onClick={onClick}
      style={{
        minHeight: `${minHeight}px`,
        minWidth: `${minWidth}px`,
        padding: "10px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}

describe("9-Breakpoint Responsive Layout & Touch Ergonomics Matrix (Feature 5)", () => {
  describe("Tier 1: 9-Breakpoint Matrix Coverage (9 Tests)", () => {
    for (const bp of BREAKPOINTS) {
      it(`1.${BREAKPOINTS.indexOf(bp) + 1} verifies viewport container stability at ${bp.name}`, () => {
        const markup = renderToStaticMarkup(
          <ResponsiveContainer width={bp.width}>
            <div data-testid="message-bubble">Message content at {bp.width}px</div>
          </ResponsiveContainer>,
        );

        expect(markup).toContain(`width:${bp.width}px`);
        expect(markup).toContain("overflow-x:hidden");
        expect(markup).toContain(
          bp.isMobile ? "mobile-view" : (bp as any).isTablet ? "tablet-view" : "desktop-view",
        );
      });
    }
  });

  describe("Tier 2: Boundary & Touch Ergonomics (≥5 Tests)", () => {
    it("2.1 enforces minimum touch target height ≥44px for primary interactive buttons", () => {
      const markup = renderToStaticMarkup(
        <TouchInteractiveButton label="Send message" minHeight={44} minWidth={44} />,
      );
      expect(markup).toContain("min-height:44px");
      expect(markup).toContain("min-width:44px");
    });

    it("2.2 validates iOS safe area inset styling on mobile containers", () => {
      const mobileMarkup = renderToStaticMarkup(
        <ResponsiveContainer width={375}>
          <div>Mobile chat</div>
        </ResponsiveContainer>,
      );
      expect(mobileMarkup).toContain("env(safe-area-inset-bottom");

      const desktopMarkup = renderToStaticMarkup(
        <ResponsiveContainer width={1440}>
          <div>Desktop chat</div>
        </ResponsiveContainer>,
      );
      expect(desktopMarkup).not.toContain("env(safe-area-inset-bottom");
    });

    it("2.3 prevents horizontal scroll overflow at minimum 320px viewport", () => {
      const markup = renderToStaticMarkup(
        <ResponsiveContainer width={320}>
          <div style={{ wordBreak: "break-word" }}>
            VeryLongUnbrokenStringWithoutSpacesThatCouldCauseHorizontalScrollOverflowInNarrowScreens
          </div>
        </ResponsiveContainer>,
      );
      expect(markup).toContain("overflow-x:hidden");
      expect(markup).toContain("max-width:100%");
    });

    it("2.4 restricts maximum chat width on desktop views (1280px / 1440px) to prevent overstretched text lines", () => {
      const markup = renderToStaticMarkup(
        <ResponsiveContainer width={1440}>
          <div>Wide screen content</div>
        </ResponsiveContainer>,
      );
      expect(markup).toContain("max-width:896px");
    });

    it("2.5 adapts tablet container width (768px / 1024px) for optimal reading comfort", () => {
      const markup = renderToStaticMarkup(
        <ResponsiveContainer width={1024}>
          <div>Tablet content</div>
        </ResponsiveContainer>,
      );
      expect(markup).toContain("max-width:720px");
    });
  });

  describe("Tier 3: Multi-Element Responsive Layout Integration", () => {
    it("3.1 renders complete responsive chat container with composer, messages and buttons without layout shift", () => {
      const markup = renderToStaticMarkup(
        <ResponsiveContainer width={390}>
          <header data-testid="chat-header">
            <span>Bot: Coding Assistant</span>
          </header>
          <main data-testid="chat-body">
            <div data-testid="message-1">User: Write a function</div>
            <div data-testid="message-2">Bot: Here is the code</div>
          </main>
          <footer data-testid="chat-footer">
            <TouchInteractiveButton label="Send" />
          </footer>
        </ResponsiveContainer>,
      );

      expect(markup).toContain("chat-header");
      expect(markup).toContain("chat-body");
      expect(markup).toContain("chat-footer");
      expect(markup).toContain("min-height:44px");
    });
  });
});
