import React from "react";

export interface ChoiceOption {
  id: string;
  letter: string;
  label: string;
}

export interface ChoiceBlock {
  kind: "choice";
  question: string;
  subtitle?: string;
  options: ChoiceOption[];
}

export interface ChoiceChipsCardProps {
  block: ChoiceBlock;
  onSelectOption: (option: ChoiceOption) => void;
  disabled?: boolean;
  className?: string;
}

export function ChoiceChipsCard({
  block,
  onSelectOption,
  disabled = false,
  className = "",
}: ChoiceChipsCardProps) {
  return (
    <div
      data-testid="choice-chips-card"
      className={`rk-choice-card my-3 max-w-lg rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-xs transition-all ${className}`}
    >
      <h4 className="text-sm font-semibold text-neutral-100">
        {block.question}
      </h4>
      {block.subtitle && (
        <p className="mt-0.5 mb-3 text-xs text-neutral-400">
          {block.subtitle}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {block.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            data-testid={`choice-option-${opt.letter}`}
            disabled={disabled}
            onClick={() => onSelectOption(opt)}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-hidden focus-visible:ring-1 focus-visible:ring-emerald-500/50"
            aria-label={`Option ${opt.letter}: ${opt.label}`}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded bg-neutral-700 text-[10px] font-bold text-neutral-300">
              {opt.letter}
            </span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ChoiceChipsCard;
