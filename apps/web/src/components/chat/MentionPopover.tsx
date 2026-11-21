import type { Bot } from "@rakazo/contracts";
import React from "react";

export interface MentionPopoverProps {
  query: string;
  bots: Bot[];
  selectedIndex: number;
  onSelectBot: (bot: Bot) => void;
  onClose: () => void;
  className?: string;
}

export function MentionPopover({
  query,
  bots,
  selectedIndex,
  onSelectBot,
  onClose,
  className = "",
}: MentionPopoverProps) {
  const normalizedQuery = (query || "").toLowerCase().trim();
  const filtered = bots.filter((b) => {
    if (!b.name && !b.title) return false;
    const nameMatch = (b.name ?? "").toLowerCase().includes(normalizedQuery);
    const titleMatch = (b.title ?? "").toLowerCase().includes(normalizedQuery);
    return nameMatch || titleMatch;
  });

  return (
    <div
      data-testid="mention-popover"
      role="listbox"
      aria-label="Mentionner un bot"
      className={`absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-1 shadow-xl ${className}`}
    >
      <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase select-none">
        Mentionner un bot
      </div>
      {filtered.length === 0 ? (
        <div
          data-testid="mention-empty"
          className="px-3 py-2 text-xs text-neutral-400"
        >
          Aucun bot correspondant
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          {filtered.map((bot, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={bot.id}
                type="button"
                data-testid={`mention-item-${bot.id}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelectBot(bot)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition focus:outline-hidden ${
                  isSelected
                    ? "bg-neutral-800 font-medium text-neutral-100"
                    : "text-neutral-300 hover:bg-neutral-800/60"
                }`}
              >
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400"
                  style={
                    bot.color
                      ? {
                          backgroundColor: `${bot.color}33`,
                          color: bot.color,
                        }
                      : undefined
                  }
                >
                  {bot.name?.[0]?.toUpperCase() ?? "B"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-neutral-200">{bot.name}</div>
                  {bot.title && (
                    <div className="truncate text-[10px] text-neutral-500">
                      {bot.title}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MentionPopover;
