"use client";

import { useState } from "react";

import { clockKST, isOnDate } from "@/lib/activity";
import { addDays, daysUntil, formatDue, weekdayKo } from "@/lib/dates";
import { ROLE_STYLE } from "@/lib/roles";
import { UNASSIGNED } from "@/lib/team";
import { Slot, Task } from "@/lib/types";

/** 화면에 펼쳐 두는 시간대. 그 밖은 접는다 — 새벽 칸은 늘 비어 자리만 먹는다. */
const 시작시 = 9;
const 끝시 = 19;
const 시간칸 = Array.from({ length: 끝시 - 시작시 }, (_, i) => 시작시 + i);
/** 한 시간의 높이(px). 블록 위치를 이 값으로 계산한다. */
const ROW_H = 44;
/** 끌어다 놓을 때 기본으로 잡히는 길이. */
const 기본길이 = 2;

interface Props {
  tasks: Task[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSlotChange: (id: string, slot: Slot | null) => void;
  onOpenFlow: () => void;
}

/** 그 날짜가 속한 주의 월요일. 일요일은 그 주의 끝으로 본다. */
function 주의월요일(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const 요일 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(iso, 요일 === 0 ? -6 : 1 - 요일);
}

/** slot이 걸린 KST 날짜 */
function 슬롯날짜(slot: Slot, 후보: string[]): string | null {
  return 후보.find((d) => isOnDate(slot.start, d)) ?? null;
}

/** "14:30" -> 14.5 */
function 시각소수(iso: string): number {
  const [h, m] = clockKST(iso).split(":").map(Number);
  return h + m / 60;
}

function 마감글(t: Task, today: string): string {
  const d = daysUntil(t.dueDate, today);
  if (d === null) return "기한 미정";
  if (d < 0) return `${formatDue(t.dueDate)} 마감 · ${-d}일 지남`;
  if (d === 0) return `${formatDue(t.dueDate)} 마감 · 오늘`;
  return `${formatDue(t.dueDate)} 마감 · ${d}일 남음`;
}

export default function WeekView({
  tasks,
  today,
  selectedId,
  onSelect,
  onSlotChange,
  onOpenFlow,
}: Props) {
  const [기준일, set기준일] = useState(() => 주의월요일(today));
  const [끄는중, set끄는중] = useState<string | null>(null);

  const 요일들 = Array.from({ length: 7 }, (_, i) => addDays(기준일, i));
  const 주끝 = 요일들[6];

  /*
   * 왼쪽에 남는 것과 격자에 올라가는 것을 가르는 기준은 slot 하나다.
   * 기한만 있는 일은 "언제까지"만 정해졌을 뿐 "언제 한다"가 없으므로
   * 시간 격자에 놓을 자리가 없다. 이 구분이 이 화면의 전부다.
   */
  const 미정 = tasks.filter(
    (t) => t.status !== "완료" && !t.slot && t.assignee !== UNASSIGNED,
  );
  // 담당이 없으면 시간을 잡을 사람이 없다. 흐름 탭에서 먼저 정해야 한다.
  const 담당없음 = tasks.filter(
    (t) => t.status !== "완료" && !t.slot && t.assignee === UNASSIGNED,
  );

  const 이번주슬롯 = tasks.filter(
    (t) => t.slot && 슬롯날짜(t.slot, 요일들) !== null,
  );
  const 잡힌시간 = 이번주슬롯.reduce((sum, t) => {
    const s = t.slot as Slot;
    return (
      sum + (new Date(s.end).getTime() - new Date(s.start).getTime()) / 3600_000
    );
  }, 0);
  const 이번주기한 = tasks.filter(
    (t) => t.status !== "완료" && t.dueDate >= 기준일 && t.dueDate <= 주끝,
  );

  function 놓기(날짜: string, 시: number) {
    if (!끄는중) return;
    const 대상 = tasks.find((t) => t.id === 끄는중);
    set끄는중(null);
    if (!대상) return;

    // 이미 잡혀 있던 일을 옮길 때는 그 길이를 지킨다.
    const 길이 = 대상.slot
      ? (new Date(대상.slot.end).getTime() -
          new Date(대상.slot.start).getTime()) /
        3600_000
      : 기본길이;
    const 시작 = new Date(`${날짜}T${String(시).padStart(2, "0")}:00:00+09:00`);
    onSlotChange(대상.id, {
      start: 시작.toISOString(),
      end: new Date(시작.getTime() + 길이 * 3600_000).toISOString(),
    });
  }

  const 이번주표시 = `${Number(기준일.slice(5, 7))}월 ${Number(기준일.slice(8))}일 – ${Number(주끝.slice(8))}일`;

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3.5 py-2.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => set기준일((d) => addDays(d, -7))}
            aria-label="이전 주"
            className="rounded-md px-2 py-1 text-[13px] text-ink-3 hover:bg-sunk"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => set기준일((d) => addDays(d, 7))}
            aria-label="다음 주"
            className="rounded-md px-2 py-1 text-[13px] text-ink-3 hover:bg-sunk"
          >
            ›
          </button>
        </div>
        <h2 className="num text-[13px] font-semibold text-ink">{이번주표시}</h2>
        <span className="text-[11px] text-ink-4">
          이번 주 잡힌 시간 <span className="num">{잡힌시간.toFixed(1)}</span>시간 ·
          기한 <span className="num">{이번주기한.length}</span>건
        </span>
        <button
          type="button"
          onClick={() => set기준일(주의월요일(today))}
          className="ml-auto rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-2 hover:bg-sunk"
        >
          오늘로
        </button>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* ---------------- 왼쪽: 아직 시간을 안 잡은 일 ---------------- */}
        <div className="flex flex-col gap-3">
          <section className="rounded-md border border-line bg-surface shadow-card">
            <div className="flex items-baseline gap-2 border-b border-line-soft px-3.5 py-2.5">
              <h3 className="text-[12.5px] font-semibold text-ink">미정 업무</h3>
              <span className="num text-[11px] text-ink-3">{미정.length}</span>
            </div>
            <p className="px-3.5 pt-2 text-[10.5px] leading-snug text-ink-4">
              기한은 있는데 아직 언제 할지 정하지 않은 일입니다. 끌어다 놓으면 그
              시간에 잡힙니다.
            </p>
            <ul className="flex flex-col gap-1.5 p-2.5">
              {미정.length === 0 && (
                <li className="px-1 py-3 text-center text-[11px] text-ink-4">
                  모두 시간이 잡혀 있습니다.
                </li>
              )}
              {미정.map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={() => set끄는중(t.id)}
                  onDragEnd={() => set끄는중(null)}
                  onClick={() => onSelect(t.id)}
                  className={`flex cursor-grab items-start gap-1.5 rounded-md border px-2 py-1.5 active:cursor-grabbing ${
                    selectedId === t.id
                      ? "border-accent-line bg-accent-soft"
                      : "border-line bg-sunk hover:border-line-strong"
                  }`}
                >
                  <span aria-hidden className="mt-px text-[10px] text-ink-4">
                    ⠿
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-medium leading-snug text-ink">
                      {t.title}
                    </p>
                    <p className="num mt-0.5 text-[10px] text-ink-4">
                      {마감글(t, today)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {담당없음.length > 0 && (
            <section className="rounded-md border border-warn-line bg-warn-soft px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[12px] font-semibold text-warn">
                  담당자 미정 업무
                </h3>
                <span className="num text-[11px] text-warn">
                  {담당없음.length}
                </span>
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-warn">
                담당을 정해야 달력에 올릴 수 있습니다.
              </p>
              <button
                type="button"
                onClick={onOpenFlow}
                className="mt-1.5 text-[10.5px] font-medium text-warn underline"
              >
                흐름에서 정하기
              </button>
            </section>
          )}
        </div>

        {/* ---------------- 오른쪽: 주 격자 ---------------- */}
        <section className="thin-scroll overflow-x-auto rounded-md border border-line bg-surface shadow-card">
          <div className="min-w-[680px]">
            {/* 요일 머리 */}
            <div className="flex border-b border-line">
              <div className="w-11 flex-none" />
              {요일들.map((d) => {
                const 오늘 = d === today;
                const 주말 = ["토", "일"].includes(weekdayKo(d));
                return (
                  <div
                    key={d}
                    className={`flex-1 border-l border-line-soft px-2 py-1.5 text-center ${
                      오늘 ? "bg-accent-soft" : 주말 ? "bg-sunk" : ""
                    }`}
                  >
                    <div
                      className={`text-[10.5px] ${오늘 ? "font-semibold text-accent" : "text-ink-4"}`}
                    >
                      {weekdayKo(d)}
                    </div>
                    <div
                      className={`num text-[12px] font-semibold ${오늘 ? "text-accent" : "text-ink-2"}`}
                    >
                      {Number(d.slice(8))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 기한 줄 — 마감은 시간이 아니라 그 날에 속한다. */}
            <div className="flex border-b border-line bg-sunk">
              <div className="flex w-11 flex-none items-center justify-center py-1.5 text-[9.5px] text-ink-4">
                기한
              </div>
              {요일들.map((d) => (
                <div
                  key={d}
                  className="flex min-h-[30px] flex-1 flex-col gap-0.5 border-l border-line-soft p-1"
                >
                  {이번주기한
                    .filter((t) => t.dueDate === d)
                    .map((t) => {
                      const 남 = daysUntil(t.dueDate, today);
                      const 지남 = 남 !== null && 남 < 0;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSelect(t.id)}
                          className={`truncate rounded px-1.5 py-0.5 text-left text-[10px] leading-tight ${
                            지남
                              ? "bg-critical-soft text-critical"
                              : "bg-surface text-ink-2"
                          }`}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>

            {/* 시간 격자 */}
            <div className="flex">
              <div className="w-11 flex-none">
                {시간칸.map((h) => (
                  <div
                    key={h}
                    style={{ height: ROW_H }}
                    className="num border-t border-line-soft pr-1.5 pt-0.5 text-right text-[9.5px] text-ink-4"
                  >
                    {String(h).padStart(2, "0")}
                  </div>
                ))}
              </div>

              {요일들.map((d) => {
                const 주말 = ["토", "일"].includes(weekdayKo(d));
                const 블록 = 이번주슬롯.filter(
                  (t) => 슬롯날짜(t.slot as Slot, [d]) === d,
                );
                return (
                  <div
                    key={d}
                    className={`relative flex-1 border-l border-line-soft ${주말 ? "bg-sunk" : ""}`}
                  >
                    {시간칸.map((h) => (
                      <div
                        key={h}
                        style={{ height: ROW_H }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => 놓기(d, h)}
                        className="border-t border-line-soft transition-colors hover:bg-accent-soft"
                      />
                    ))}

                    {블록.map((t) => {
                      const s = t.slot as Slot;
                      const 시작 = 시각소수(s.start);
                      const 끝 = 시각소수(s.end);
                      const top = (시작 - 시작시) * ROW_H;
                      const height = Math.max((끝 - 시작) * ROW_H, 22);
                      const style = ROLE_STYLE[t.role];
                      return (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={() => set끄는중(t.id)}
                          onDragEnd={() => set끄는중(null)}
                          onClick={() => onSelect(t.id)}
                          style={{ top, height }}
                          className={`absolute inset-x-1 cursor-grab overflow-hidden rounded border px-1.5 py-1 active:cursor-grabbing ${style.badge} ${
                            selectedId === t.id ? "ring-1 ring-accent" : ""
                          }`}
                        >
                          <p className="truncate text-[10.5px] font-medium leading-tight">
                            {t.title}
                          </p>
                          <p className="num truncate text-[9.5px] leading-tight opacity-80">
                            {clockKST(s.start)}–{clockKST(s.end)}
                            {t.assignee !== UNASSIGNED ? ` · ${t.assignee}` : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="border-t border-line-soft px-3.5 py-2 text-[10px] text-ink-4">
            {시작시}:00–{끝시}:00 표시 · 그 밖의 시간은 접혀 있습니다
          </p>
        </section>
      </div>
    </div>
  );
}
