"use client";

/**
 * 배지처럼 보이는 드롭다운. 카드 안에서 밀도를 해치지 않으면서
 * "여기는 사람이 바꿀 수 있는 값"이라는 걸 드러내는 역할.
 */
export default function BadgeSelect({
  value,
  options,
  onChange,
  className = "",
  title,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  className?: string;
  title?: string;
}) {
  return (
    <span className={`relative inline-flex items-center rounded border ${className}`}>
      <select
        value={value}
        title={title}
        onChange={(e) => onChange(e.target.value)}
        // 카드 클릭(선택/하이라이트)과 드롭다운 조작이 겹치지 않게 막는다.
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="cursor-pointer appearance-none bg-transparent py-0.5 pl-1.5 pr-4 text-[11px] font-medium leading-none text-inherit outline-none focus:ring-1 focus:ring-slate-400"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="text-slate-900">
            {opt}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 10 6"
        className="pointer-events-none absolute right-1 h-1.5 w-2 opacity-50"
      >
        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}
