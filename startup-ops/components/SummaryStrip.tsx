"use client";

import { isDueToday, isOverdue } from "@/lib/dates";
import { UNASSIGNED } from "@/lib/team";
import { Task } from "@/lib/types";

/**
 * 예전엔 지표 6개를 같은 크기로 늘어놓았는데, 그러면 "총 할일"과 "기한 지남"이
 * 같은 무게로 읽혀 어디부터 봐야 할지가 사라진다.
 *
 * 지금은 두 층이다.
 *  위 — 사람이 지금 손대야 하는 것 (지남 / 오늘 / 담당자 없음)
 *  아래 — 배경 숫자. 행동을 부르지 않으므로 한 줄로 눌러놓는다.
 */
export default function SummaryStrip({
  tasks,
  today,
}: {
  tasks: Task[];
  today: string;
}) {
  const overdue = tasks.filter(
    (t) => t.status !== "완료" && isOverdue(t.dueDate, today),
  ).length;
  const dueToday = tasks.filter(
    (t) => t.status !== "완료" && isDueToday(t.dueDate, today),
  ).length;
  const unassigned = tasks.filter(
    (t) => t.status !== "완료" && t.assignee === UNASSIGNED,
  ).length;

  const done = tasks.filter((t) => t.status === "완료").length;
  const high = tasks.filter(
    (t) => t.status !== "완료" && t.priority === "높음",
  ).length;

  const 손댈것 = overdue + dueToday + unassigned;

  return (
    <div className="rounded-lg border border-line bg-surface shadow-card">
      <div className="grid grid-cols-3 gap-px bg-line-soft">
        <Cell
          label="기한 지남"
          value={overdue}
          hint="이미 늦었습니다"
          tone="critical"
        />
        <Cell
          label="오늘 마감"
          value={dueToday}
          hint="오늘 안에 끝내야 합니다"
          tone="warn"
        />
        <Cell
          label="담당자 없음"
          value={unassigned}
          hint="아무도 잡지 않았습니다"
          tone="warn"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2 text-[11.5px] text-ink-3">
        <Muted label="전체" value={tasks.length} />
        <Muted label="높은 우선순위" value={high} />
        <Muted label="완료" value={done} />
        <span className="ml-auto text-[11px] text-ink-4">
          {손댈것 === 0
            ? tasks.length === 0
              ? "아직 모인 할일이 없습니다"
              : "지금 급한 건 없습니다"
            : `지금 손댈 것 ${손댈것}건`}
        </span>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "critical" | "warn";
}) {
  // 0이면 색을 빼서 눈에 안 걸리게 한다. 0인 경고는 경고가 아니다.
  const valueTone =
    value === 0
      ? "text-ink-4"
      : tone === "critical"
        ? "text-critical"
        : "text-warn";

  return (
    <div className="bg-surface px-3 py-3 sm:px-4">
      <p className="text-[11px] font-medium text-ink-3">{label}</p>
      <p
        className={`num mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] sm:text-[30px] ${valueTone}`}
      >
        {value}
      </p>
      <p className="mt-1 hidden text-[10.5px] leading-tight text-ink-4 sm:block">
        {value === 0 ? "없음" : hint}
      </p>
    </div>
  );
}

function Muted({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-ink-4">{label}</span>
      <span className="num font-medium text-ink-2">{value}</span>
    </span>
  );
}
