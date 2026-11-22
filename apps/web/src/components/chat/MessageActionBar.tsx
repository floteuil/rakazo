import React, { useEffect, useRef, useState } from "react";

export interface MessageActionBarProps {
  text: string;
  messageId: string;
  onReact?: (messageId: string, reaction: "up" | "down" | null) => void;
  initialReaction?: "up" | "down" | null;
  className?: string;
}

export function MessageActionBar({
  text,
  messageId,
  onReact,
  initialReaction = null,
  className = "",
}: MessageActionBarProps) {
  const [reaction, setReaction] = useState<"up" | "down" | null>(initialReaction);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setReaction(initialReaction);
  }, [initialReaction]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleThumb = (type: "up" | "down") => {
    const next = reaction === type ? null : type;
    setReaction(next);
    onReact?.(messageId, next);
  };

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Fallback if clipboard API is restricted
    }
    setCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div
      data-testid="message-action-bar"
      className={`flex w-fit items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/90 p-1 opacity-90 shadow-xs transition hover:opacity-100 ${className}`}
    >
      <button
        type="button"
        data-testid="copy-button"
        onClick={handleCopy}
        className="cursor-pointer rounded p-1 text-xs text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200 focus:outline-hidden focus-visible:ring-1 focus-visible:ring-emerald-500/50"
        title="Copier le message"
        aria-label={copied ? "Copié !" : "Copier le message"}
      >
        {copied ? "✓" : "📋"}
      </button>
      <div className="mx-0.5 h-3 w-[1px] bg-neutral-800" />
      <button
        type="button"
        data-testid="thumb-up-button"
        onClick={() => handleThumb("up")}
        className={`cursor-pointer rounded p-1 text-xs transition focus:outline-hidden focus-visible:ring-1 focus-visible:ring-emerald-500/50 ${
          reaction === "up"
            ? "bg-emerald-900/50 font-bold text-emerald-300"
            : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        }`}
        title="Pouce levé"
        aria-label="Pouce levé"
        aria-pressed={reaction === "up"}
      >
        👍
      </button>
      <button
        type="button"
        data-testid="thumb-down-button"
        onClick={() => handleThumb("down")}
        className={`cursor-pointer rounded p-1 text-xs transition focus:outline-hidden focus-visible:ring-1 focus-visible:ring-rose-500/50 ${
          reaction === "down"
            ? "bg-rose-900/50 font-bold text-rose-300"
            : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        }`}
        title="Pouce baissé"
        aria-label="Pouce baissé"
        aria-pressed={reaction === "down"}
      >
        👎
      </button>
    </div>
  );
}

export default MessageActionBar;
