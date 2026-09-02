import React, { useState } from "react";

export interface ToolActivityAccordionProps {
  toolName: string;
  status: "running" | "completed" | "failed";
  args?: Record<string, unknown> | string;
  result?: string;
  durationMs?: number;
  defaultExpanded?: boolean;
}

export function ToolActivityAccordion({
  toolName,
  status,
  args,
  result,
  durationMs,
  defaultExpanded = false,
}: ToolActivityAccordionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const formattedDuration =
    durationMs !== undefined && durationMs !== null
      ? durationMs >= 1000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${Math.round(durationMs)}ms`
      : null;

  const statusDotClass =
    status === "running"
      ? "bg-amber-400 animate-pulse"
      : status === "completed"
        ? "bg-emerald-400"
        : "bg-rose-500";

  return (
    <div
      data-testid="tool-activity-accordion"
      className="rk-tool-accordion my-2 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-sm shadow-xs transition-all"
    >
      <button
        type="button"
        data-testid="tool-activity-header"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between bg-neutral-800/50 px-3 py-2 text-left transition hover:bg-neutral-800/80 focus:outline-hidden focus-visible:ring-1 focus-visible:ring-emerald-500/50"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            data-testid="tool-status-badge"
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass}`}
            aria-label={`Status: ${status}`}
          />
          <span className="truncate font-mono font-medium text-neutral-200">
            {toolName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
          {formattedDuration && (
            <span data-testid="tool-duration" className="tabular-nums">
              {formattedDuration}
            </span>
          )}
          <span data-testid="accordion-toggle-icon" className="text-[10px] select-none">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div
          data-testid="tool-activity-body"
          className="space-y-2.5 border-t border-neutral-800 bg-neutral-950 p-3"
        >
          {args !== undefined && args !== null && (
            <div data-testid="tool-args-section">
              <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase select-none">
                Arguments
              </span>
              <pre className="mt-1 overflow-x-auto rounded bg-neutral-900/90 p-2 font-mono text-xs text-neutral-300">
                {typeof args === "string" ? args : JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && result !== null && (
            <div data-testid="tool-result-section">
              <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase select-none">
                Output
              </span>
              <pre className="mt-1 max-h-60 overflow-x-auto overflow-y-auto rounded bg-neutral-900/90 p-2 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolActivityAccordion;
