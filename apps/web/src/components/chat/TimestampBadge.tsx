import React from "react";

export interface TimestampBadgeProps {
  createdAt: string;
  resolvedModel?: string;
  resolvedProvider?: string;
  isFree?: boolean;
  durationMs?: number;
  latencyMs?: number;
  className?: string;
}

export function TimestampBadge({
  createdAt,
  resolvedModel,
  resolvedProvider,
  isFree,
  durationMs,
  latencyMs,
  className = "",
}: TimestampBadgeProps) {
  const dateObj = new Date(createdAt);
  const formattedTime = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : createdAt;

  const durationStr =
    durationMs !== undefined && durationMs !== null
      ? durationMs >= 1000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${Math.round(durationMs)}ms`
      : null;

  return (
    <div
      data-testid="timestamp-badge"
      className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 select-none ${className}`}
    >
      <span data-testid="msg-time">{formattedTime}</span>
      {durationStr && (
        <span
          data-testid="msg-duration"
          className="rounded bg-neutral-800/80 px-1.5 py-0.5 text-neutral-400"
        >
          A réfléchi pendant {durationStr}
        </span>
      )}
      {resolvedModel && (
        <span data-testid="msg-model-meta" className="text-neutral-400">
          Modèle : {resolvedModel} {resolvedProvider ? `· ${resolvedProvider}` : ""}
        </span>
      )}
      {isFree && (
        <span
          data-testid="msg-free-tier-badge"
          className="rounded border border-emerald-800/40 bg-emerald-950/60 px-1.5 py-0.5 text-emerald-400 font-medium"
        >
          Gratuit via OmniRoute
        </span>
      )}
      {latencyMs !== undefined && latencyMs !== null && (
        <span data-testid="msg-latency" className="text-neutral-500 tabular-nums">
          ({latencyMs}ms)
        </span>
      )}
    </div>
  );
}

export default TimestampBadge;
