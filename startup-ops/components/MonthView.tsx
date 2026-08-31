"use client";

import { useMemo, useState } from "react";

import { clockKST } from "@/lib/activity";
import { addDays, daysUntil, weekdayKo } from "@/lib/dates";
import { ROLE_STYLE } from "@/lib/roles";
import { UNASSIGNED } from "@/lib/team";
import { Role, Slot, Task } from "@/lib/types";

const 요일머리 = ["월", "화", "수", "목", "금", "토", "일"];
/** 한 칸에 이 개수까지만 적고 나머지는 "+N건 더"로 접는다. */
const 칸당_최대 = 3;

interface Props {
  tasks: Task[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenWeek: () => void;
}

function 달의첫날(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function 달이동(월초: string, 만큼: number): string {
  const [y, m] = 월초.split("-").map(Number);
  const 합 = y * 12 + (m - 1) + 만큼;
  return `${String(Math.floor(합 / 12)).padStart(4, "0")}-${String((합 % 12) + 1).padStart(2, "0")}-01`;
}

/** 월요일 시작으로 6주(42칸)를 채운다. 칸 수가 달마다 바뀌면 높이가 출렁인다. */
function 달력칸(월초: string): string[] {
  const [y, m] = 월초.split("-").map(Number);
  const 첫요일 = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const 앞으로 = 첫요일 === 0 ? -6 : 1 - 첫요일;
  const 시작 = addDays(월초, 앞으로);
  return Array.from({ length: 42 }, (_, i) => addDays(시작, i));
}

export default function MonthView({
  tasks,
  today,
  selectedId,
  onSelect,
  onOpenWeek,
}: Props) {
  const [월초, set월초] = useState(() => 달의첫날(today));
  const [고른날, set고른날] = useState(today);
  const [고른직무, set고른직무] = useState<Role | null>(null);

  const 칸들 = useMemo(() => 달력칸(월초), [월초]);
  const 이달 = 월초.slice(0, 7);

  const 보이는것 = useMemo(
    () => (고른직무 ? tasks.filter((t) => t.role === 고른직무) : tasks),
    [tasks, 고른직무],
  );

  /** 날짜 -> 그 날 마감인 할일 */
  const 날짜별 = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of 보이는것) {
      const cur = m.get(t.dueDate);
      if (cur) cur.push(t);
      else m.set(t.dueDate, [t]);
    }
    return m;
  }, [보이는것]);

  /** 이 달에 실제로 쓰인 직무만 필터로 내놓는다. */
  const 직무들 = useMemo(() => {
    const s = new Set<Role>();
    for (const t of tasks) if (t.dueDate.startsWith(이달)) s.add(t.role);
    return Array.from(s);
  }, [tasks, 이달]);

  const 이달할일 = tasks.filter((t) => t.dueDate.startsWith(이달));
  const 이달지연 = 이달할일.filter((t) => {
    const d = daysUntil(t.dueDate, today);
    return t.status !== "완료" && d !== null && d < 0;
  }).length;
  const 이달완료 = 이달할일.filter((t) => t.status === "완료").length;

  const 고른날할일 = 날짜별.get(고른날) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3.5 py-2.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => set월초((d) => 달이동(d, -1))}
            aria-label="이전 달"
            className="rounded-md px-2 py-1 text-[13px] text-ink-3 hover:bg-sunk"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => set월초((d) => 달이동(d, 1))}
            aria-label="다음 달"
            className="rounded-md px-2 py-1 text-[13px] text-ink-3 hover:bg-sunk"
          >
            ›
          </button>
        </div>
        <h2 className="num text-[13px] font-semibold text-ink">
          {Number(월초.slice(0, 4))}년 {Number(월초.slice(5, 7))}월
        </h2>
        <span className="text-[11px] text-ink-4">
          할일 <span className="num">{이달할일.length}</span> · 지연{" "}
          <span className="num text-critical">{이달지연}</span> · 완료{" "}
          <span className="num text-good">{이달완료}</span>
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {직무들.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => set고른직무((c) => (c === r ? null : r))}
              className={`rounded-md border px-2 py-0.5 text-[10.5px] ${
                고른직무 === r
                  ? ROLE_STYLE[r].badge
                  : "border-line text-ink-3 hover:bg-sunk"
              }`}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenWeek}
            className="rounded-md border border-line px-2.5 py-0.5 text-[10.5px] text-ink-2 hover:bg-sunk"
          >
            주 보기
          </button>
        </div>
      </section>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="thin-scroll overflow-x-auto rounded-md border border-line bg-surface shadow-card">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 border-b border-line">
              {요일머리.map((w) => (
                <div
                  key={w}
                  className={`border-l border-line-soft py-1.5 text-center text-[10.5px] first:border-l-0 ${
                    w === "토" || w === "일" ? "text-ink-4" : "text-ink-3"
                  }`}
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {칸들.map((d) => {
                const 다른달 = !d.startsWith(이달);
                const 오늘 = d === today;
                const 고름 = d === 고른날;
                const items = 날짜별.get(d) ?? [];
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set고른날(d)}
                    className={`min-h-[92px] border-b border-l border-line-soft p-1 text-left align-top first:border-l-0 ${
                      고름 ? "bg-accent-soft" : 다른달 ? "bg-sunk" : "hover:bg-sunk"
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-1">
                      <span
                        className={`num text-[10.5px] ${
                          오늘
                            ? "rounded bg-accent px-1 font-semibold text-white"
                            : 다른달
                              ? "text-ink-4"
                              : "text-ink-2"
                        }`}
                      >
                        {Number(d.slice(8))}
                      </span>
                      {오늘 && <span className="text-[9.5px] text-accent">오늘</span>}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {items.slice(0, 칸당_최대).map((t) => {
                        const 남 = daysUntil(t.dueDate, today);
                        const 지남 = t.status !== "완료" && 남 !== null && 남 < 0;
                        return (
                          <span
                            key={t.id}
                            className={`truncate rounded px-1 py-px text-[9.5px] leading-tight ${
                              t.status === "완료"
                                ? "text-ink-4 line-through"
                                : 지남
                                  ? "bg-critical-soft text-critical"
                                  : "bg-sunk text-ink-2"
                            }`}
                          >
                            {t.title}
                          </span>
                        );
                      })}
                      {items.length > 칸당_최대 && (
                        <span className="num px-1 text-[9.5px] text-ink-4">
                          +{items.length - 칸당_최대}건 더
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 고른 날 상세 */}
        <section className="rounded-md border border-line bg-surface shadow-card">
          <div className="flex items-baseline gap-2 border-b border-line-soft px-3.5 py-2.5">
            <h3 className="num text-[12.5px] font-semibold text-ink">
              {Number(고른날.slice(5, 7))}월 {Number(고른날.slice(8))}일 (
              {weekdayKo(고른날)})
            </h3>
            <span className="num ml-auto text-[11px] text-ink-3">
              할일 {고른날할일.length}
            </span>
          </div>

          {고른날할일.length === 0 ? (
            <p className="px-3.5 py-10 text-center text-[11.5px] text-ink-4">
              이 날 마감인 일이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col">
              {고른날할일.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    className={`w-full border-b border-line-soft px-3.5 py-2.5 text-left last:border-b-0 ${
                      selectedId === t.id ? "bg-accent-soft" : "hover:bg-sunk"
                    }`}
                  >
                    <p
                      className={`text-[12px] font-medium leading-snug ${
                        t.status === "완료" ? "text-ink-4 line-through" : "text-ink"
                      }`}
                    >
                      {t.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10px] ${ROLE_STYLE[t.role].badge}`}
                      >
                        {t.role}
                      </span>
                      <span className="text-[10.5px] text-ink-3">
                        {t.assignee === UNASSIGNED ? "담당 미정" : t.assignee}
                      </span>
                      {/* 시간을 잡았는지가 이 화면에서 가장 자주 묻는 것이다. */}
                      <span className="num text-[10.5px] text-ink-4">
                        {t.slot
                          ? `${clockKST((t.slot as Slot).start)}–${clockKST((t.slot as Slot).end)}`
                          : "시간 안 잡힘"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
