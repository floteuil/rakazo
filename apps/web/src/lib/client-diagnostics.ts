import { rpc } from "./rpc";

const MAX_REPORTS_PER_MINUTE = 5;
let installed = false;
let windowStartMs = 0;
let sentInWindow = 0;

function shouldThrottleOrIgnore(message: string): boolean {
  if (!message) return true;
  if (/ResizeObserver loop|AbortError|NetworkError when attempting to fetch/i.test(message)) {
    return true;
  }
  const now = Date.now();
  if (now - windowStartMs > 60_000) {
    windowStartMs = now;
    sentInWindow = 0;
  }
  if (sentInWindow >= MAX_REPORTS_PER_MINUTE) {
    return true;
  }
  sentInWindow += 1;
  return false;
}

/**
 * Installs lightweight global browser crash traps (mobile Safari/Chrome & desktop)
 * so uncaught UI exceptions and unhandled promise rejections are captured in the
 * server-side Rakazo Flight Recorder for instant AI diagnosis.
 */
export function installClientDiagnosticsTrap(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const message = event.error instanceof Error ? event.error.message : String(event.message || "");
    if (shouldThrottleOrIgnore(message)) return;

    void rpc.diagnostics
      .reportClientError({
        code: "CLIENT_WINDOW_ERROR",
        title: `Exception UI : ${message.slice(0, 120)}`,
        message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        route: window.location?.pathname,
        userAgent: navigator.userAgent?.slice(0, 200),
      })
      .catch(() => undefined);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || "");
    if (shouldThrottleOrIgnore(message)) return;

    void rpc.diagnostics
      .reportClientError({
        code: "CLIENT_UNHANDLED_REJECTION",
        title: `Promesse non gérée : ${message.slice(0, 120)}`,
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        route: window.location?.pathname,
        userAgent: navigator.userAgent?.slice(0, 200),
      })
      .catch(() => undefined);
  });
}
