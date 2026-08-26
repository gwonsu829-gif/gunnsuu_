"use client";

import { AssigneeSuggestion } from "@/lib/suggest";

/**
 * 담당자를 자동으로 넣지 않고 제안만 한다.
 * 위임 여부는 사람이 정하는 일이고, 근거를 보여줘야 그 판단이 가능하다.
 */
export default function AssigneeSuggestionRow({
  suggestion,
  onAccept,
  compact = false,
}: {
  suggestion: AssigneeSuggestion;
  onAccept: (assignee: string) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        title={`${suggestion.reason}\n근거: ${suggestion.examples.join(" / ")}`}
        onClick={(e) => {
          e.stopPropagation();
          onAccept(suggestion.assignee);
        }}
        className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700 hover:border-violet-400"
      >
        <span className="opacity-70">추천</span>
        <span className="font-medium">{suggestion.assignee}</span>
      </button>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 rounded border border-violet-200 bg-violet-50 px-2 py-1.5"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold text-violet-800">
          담당자 추천 · {suggestion.assignee}
        </span>
        <button
          type="button"
          onClick={() => onAccept(suggestion.assignee)}
          className="rounded border border-violet-300 bg-surface px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:border-violet-500"
        >
          지정
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-violet-700">
        {suggestion.reason}
      </p>
      {suggestion.examples.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {suggestion.examples.map((ex) => (
            <li key={ex} className="text-[10.5px] leading-snug text-violet-600">
              · {ex}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
