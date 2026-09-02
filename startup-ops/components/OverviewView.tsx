"use client";

import BarChart, { BarDatum } from "./BarChart";
import { Avatar } from "./AppShell";
import { MetaBadge, RoleBadge } from "./Badge";
import {
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconChevron,
  IconClock,
  IconMail,
} from "./Icons";
import { clockKST, isOnDate } from "@/lib/activity";
import { addDays, daysUntil, formatDue, weekdayKo } from "@/lib/dates";
import { PRIORITY_ORDER } from "@/lib/roles";
import { UNASSIGNED } from "@/lib/team";
import { AuditEntry, BusyEvent, MailRecord, Status, Task, TeamMember } from "@/lib/types";

interface Props {
  tasks: Task[];
  mails: MailRecord[];
  audit: AuditEntry[];
  busy: BusyEvent[];
  team: TeamMember[];
  today: string;
  user: string | null;
  companyName: string;
  googleConnected: boolean;
  search: string;
  onSelectTask: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  onOpen: (tab: "mail" | "calendar" | "flow" | "inbox" | "settings") => void;
}

/** 하루 중 언제인지에 따라 인사말. 참고 이미지처럼 화면이 사람에게 말을 건다. */
function greeting(name: string | null): string {
  const h = Number(clockKST(new Date().toISOString()).slice(0, 2));
  const who = name ? `${name}님` : "";
  const word = h < 11 ? "좋은 아침이에요" : h < 17 ? "좋은 오후예요" : "수고 많으셨어요";
  return who ? `${word}, ${who}.` : `${word}.`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.round((now - d.getTime()) / 60_000);
  if (diff < 1) return "방금";
  if (diff < 60) return `${diff}분 전`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}

export default function OverviewView({
  tasks,
  mails,
  audit,
  busy,
  team,
  today,
  user,
  companyName,
  googleConnected,
  search,
  onSelectTask,
  onStatusChange,
  onOpen,
}: Props) {
  const open = tasks.filter((t) => t.status !== "완료");
  const q = search.trim().toLowerCase();
  const matches = (t: Task) =>
    !q || t.title.toLowerCase().includes(q) || t.sourceLabel.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q);

  /* ---------- 지표 ---------- */
  const dueNow = open.filter((t) => {
    const d = daysUntil(t.dueDate, today);
    return d !== null && d <= 0;
  });
  const overdue = dueNow.filter((t) => (daysUntil(t.dueDate, today) ?? 0) < 0).length;
  const unassigned = open.filter((t) => t.assignee === UNASSIGNED).length;

  const inWindow = (iso: string | undefined, from: string, to: string) =>
    Boolean(iso) && (iso as string).slice(0, 10) >= from && (iso as string).slice(0, 10) <= to;
  const weekFrom = addDays(today, -6);
  const prevFrom = addDays(today, -13);
  const prevTo = addDays(today, -7);
  const createdThis = tasks.filter((t) => inWindow(kstDay(t.createdAt), weekFrom, today)).length;
  const createdPrev = tasks.filter((t) => inWindow(kstDay(t.createdAt), prevFrom, prevTo)).length;
  const doneThis = tasks.filter((t) => t.status === "완료" && inWindow(kstDay(t.stageAt?.done), weekFrom, today)).length;
  const donePrev = tasks.filter((t) => t.status === "완료" && inWindow(kstDay(t.stageAt?.done), prevFrom, prevTo)).length;

  /* ---------- 차트: 최근 7일 ---------- */
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const chart: BarDatum[] = days.map((d) => ({
    label: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`,
    sub: weekdayKo(d),
    today: d === today,
    values: {
      in: tasks.filter((t) => kstDay(t.createdAt) === d).length,
      done: tasks.filter((t) => t.status === "완료" && kstDay(t.stageAt?.done) === d).length,
    },
  }));

  /* ---------- 지금 할 일: 기한 순 ---------- */
  const sorted = open
    .filter(matches)
    .sort((a, b) => {
      const da = daysUntil(a.dueDate, today);
      const db = daysUntil(b.dueDate, today);
      if (da === null && db === null) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (da === null) return 1;
      if (db === null) return -1;
      if (da !== db) return da - db;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    })
    .slice(0, 7);

  /* ---------- 팀 현황 ---------- */
  const rows = team.map((m) => {
    const mine = tasks.filter((t) => t.assignee === m.name);
    const left = mine.filter((t) => t.status !== "완료");
    return {
      member: m,
      left: left.length,
      doing: left.filter((t) => t.status === "진행중").length,
      late: left.filter((t) => (daysUntil(t.dueDate, today) ?? 1) < 0).length,
      doneWeek: mine.filter((t) => t.status === "완료" && inWindow(kstDay(t.stageAt?.done), weekFrom, today)).length,
      total: mine.length,
    };
  });
  const maxLeft = Math.max(1, ...rows.map((r) => r.left));

  /* ---------- 오늘 일정 ---------- */
  const todaySlots = tasks
    .filter((t) => t.slot && isOnDate(t.slot.start, today))
    .map((t) => ({ id: t.id, title: t.title, start: t.slot!.start, end: t.slot!.end, kind: "task" as const, who: t.assignee }));
  const todayBusy = busy
    .filter((b) => (b.allDay ? b.start <= today && b.end > today : isOnDate(b.start, today)))
    .map((b) => ({ id: b.id, title: b.title, start: b.start, end: b.end, kind: "busy" as const, who: "", allDay: b.allDay }));
  const agenda = [...todaySlots, ...todayBusy].sort((a, b) => a.start.localeCompare(b.start));

  const newMails = mails.filter((m) => m.actionable && kstDay(m.receivedAt) === today).length;

  const [y, mo, d] = today.split("-");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-[24px]">
            {greeting(user)}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {y}년 {Number(mo)}월 {Number(d)}일 ({weekdayKo(today)}) ·{" "}
            {open.length === 0
              ? "남은 일이 없습니다"
              : `남은 일 ${open.length}건${newMails ? ` · 오늘 들어온 업무 메일 ${newMails}통` : ""}`}
          </p>
        </div>
        <div className="flex gap-1.5 text-[12px]">
          <button
            type="button"
            onClick={() => onOpen("inbox")}
            className="rounded-md border border-line bg-surface px-3 py-1.5 font-medium text-ink-2 hover:bg-sunk"
          >
            원문 붙여넣기
          </button>
          <button
            type="button"
            onClick={() => onOpen("calendar")}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-hover"
          >
            시간 잡기
          </button>
        </div>
      </div>

      {/* ---------- 지표 4개 ---------- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="오늘까지 해야 할 일"
          value={dueNow.length}
          tone={overdue > 0 ? "critical" : dueNow.length > 0 ? "warn" : "default"}
          hint={overdue > 0 ? `그중 ${overdue}건은 이미 늦었습니다` : dueNow.length ? "오늘 안에 끝내야 합니다" : "오늘 마감은 없습니다"}
          onClick={() => onOpen("flow")}
        />
        <Kpi
          label="담당자 없는 일"
          value={unassigned}
          tone={unassigned > 0 ? "warn" : "default"}
          hint={unassigned > 0 ? "누가 할지 정해야 움직입니다" : "모두 담당이 있습니다"}
          onClick={() => onOpen("flow")}
        />
        <Kpi
          label="이번 주 들어온 일"
          value={createdThis}
          delta={createdThis - createdPrev}
          deltaGoodWhen="down"
          hint="지난 7일 대비"
          onClick={() => onOpen("inbox")}
        />
        <Kpi
          label="이번 주 끝낸 일"
          value={doneThis}
          delta={doneThis - donePrev}
          deltaGoodWhen="up"
          hint="지난 7일 대비"
          onClick={() => onOpen("flow")}
        />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        {/* ---------- 왼쪽 ---------- */}
        <div className="flex flex-col gap-4">
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-semibold text-ink">들어온 일과 끝낸 일</h2>
                <p className="text-[12px] text-ink-4">최근 7일 · 건수</p>
              </div>
              <ul className="flex items-center gap-3 text-[11.5px] text-ink-3">
                <li className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-ink" /> 들어옴
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-accent" /> 끝냄
                </li>
              </ul>
            </div>
            <div className="mt-3">
              <BarChart
                data={chart}
                series={[
                  { key: "in", label: "들어옴", color: "#141416" },
                  { key: "done", label: "끝냄", color: "#4f4fd0" },
                ]}
              />
            </div>
          </section>

          <section className="card">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[14px] font-semibold text-ink">지금 할 일</h2>
                <span className="text-[11.5px] text-ink-4">기한이 가까운 순</span>
              </div>
              <button
                type="button"
                onClick={() => onOpen("flow")}
                className="flex items-center gap-0.5 text-[12px] text-ink-3 hover:text-ink"
              >
                전체 보기 <IconChevron size={13} />
              </button>
            </div>
            {sorted.length === 0 ? (
              <p className="px-5 pb-8 pt-4 text-center text-[12.5px] text-ink-4">
                {q ? "검색 결과가 없습니다." : "남은 일이 없습니다. 메일·디스코드가 들어오면 여기에 쌓입니다."}
              </p>
            ) : (
              <ul className="border-t border-line-soft">
                {sorted.map((t) => {
                  const dd = daysUntil(t.dueDate, today);
                  const late = dd !== null && dd < 0;
                  const member = team.find((m) => m.name === t.assignee);
                  return (
                    <li
                      key={t.id}
                      onClick={() => onSelectTask(t.id)}
                      className="flex cursor-pointer items-center gap-3 border-b border-line-soft px-5 py-2.5 last:border-b-0 hover:bg-sunk"
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onStatusChange(t.id, "완료")}
                        aria-label={`${t.title} 완료`}
                        className="h-3.5 w-3.5 cursor-pointer accent-good"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{t.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <RoleBadge role={t.role} />
                          {t.duplicateOf && <MetaBadge tone="warn">중복 의심</MetaBadge>}
                          <span className="text-[11px] text-ink-4">{t.sourceLabel}</span>
                        </div>
                      </div>
                      <div className="hidden items-center gap-1.5 sm:flex">
                        {member ? (
                          <>
                            <Avatar name={member.name} color={member.color} small />
                            <span className="text-[12px] text-ink-2">{member.name}</span>
                          </>
                        ) : (
                          <span className="rounded-full border border-warn-line bg-warn-soft px-2 py-0.5 text-[11px] text-warn">
                            {t.assignee === UNASSIGNED ? "담당 미정" : t.assignee}
                          </span>
                        )}
                      </div>
                      <span
                        className={`num w-[74px] shrink-0 text-right text-[12px] font-medium ${
                          late ? "text-critical" : dd === 0 ? "text-warn" : "text-ink-3"
                        }`}
                      >
                        {dd === null ? "기한 미정" : late ? `${-dd}일 지남` : dd === 0 ? "오늘" : `D-${dd}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ---------- 오른쪽 ---------- */}
        <div className="flex flex-col gap-4">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-ink">팀 현황</h2>
              <span className="text-[11.5px] text-ink-4">남은 일 기준</span>
            </div>
            <ul className="mt-3 space-y-3.5">
              {rows.map((r) => (
                <li key={r.member.name}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.member.name} color={r.member.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {r.member.name}
                          {r.member.name === user && (
                            <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              나
                            </span>
                          )}
                        </p>
                        <p className="num shrink-0 text-[12px] text-ink-3">
                          남은 <span className="font-semibold text-ink">{r.left}</span>
                          {r.late > 0 && <span className="ml-1.5 text-critical">지남 {r.late}</span>}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunk">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(r.left / maxLeft) * 100}%`,
                            backgroundColor: r.member.color,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-ink-4">
                        진행중 {r.doing} · 이번 주 완료 {r.doneWeek} · {r.member.role}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
              {unassigned > 0 && (
                <li className="flex items-center justify-between rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[12px] text-warn">
                  <span>담당자 없는 일 {unassigned}건</span>
                  <button type="button" onClick={() => onOpen("flow")} className="font-medium underline">
                    나누기
                  </button>
                </li>
              )}
            </ul>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                <IconCalendar className="text-ink-3" /> 오늘 일정
              </h2>
              <button type="button" onClick={() => onOpen("calendar")} className="flex items-center gap-0.5 text-[12px] text-ink-3 hover:text-ink">
                주간 보기 <IconChevron size={13} />
              </button>
            </div>
            {agenda.length === 0 ? (
              <p className="mt-3 text-[12px] text-ink-4">
                {googleConnected ? "잡힌 일정이 없습니다." : "구글 캘린더를 연결하면 회의 일정도 여기 보입니다."}
                {!googleConnected && (
                  <button type="button" onClick={() => onOpen("settings")} className="ml-1 text-accent underline">
                    연결하기
                  </button>
                )}
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {agenda.map((a) => (
                  <li
                    key={`${a.kind}-${a.id}`}
                    onClick={() => a.kind === "task" && onSelectTask(a.id)}
                    className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 ${
                      a.kind === "task"
                        ? "cursor-pointer border-accent-line bg-accent-soft hover:border-accent"
                        : "border-line bg-sunk"
                    }`}
                  >
                    <IconClock size={14} className={a.kind === "task" ? "text-accent" : "text-ink-4"} />
                    <span className="num w-[86px] shrink-0 text-[11.5px] text-ink-3">
                      {"allDay" in a && a.allDay ? "종일" : `${clockKST(a.start)}–${clockKST(a.end)}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{a.title}</span>
                    {a.who && a.who !== UNASSIGNED && <span className="text-[11px] text-ink-4">{a.who}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-ink">최근 활동</h2>
              <span className="text-[11.5px] text-ink-4">누가 무엇을 바꿨나</span>
            </div>
            {audit.length === 0 ? (
              <p className="mt-3 text-[12px] text-ink-4">아직 기록이 없습니다.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {audit.slice(0, 8).map((e) => {
                  const m = team.find((t) => t.name === e.who);
                  return (
                    <li key={e.id} className="flex items-start gap-2.5">
                      <Avatar name={e.who} color={m?.color ?? "#9b9ba3"} small />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-ink-2">
                          <span className="font-medium text-ink">{e.who}</span> · {e.summary}
                        </p>
                        <p className="text-[10.5px] text-ink-4">{fmtTime(e.at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {mails.length > 0 && (
            <button
              type="button"
              onClick={() => onOpen("mail")}
              className="card flex items-center gap-3 px-5 py-3.5 text-left hover:bg-sunk"
            >
              <IconMail className="text-ink-3" />
              <span className="flex-1 text-[13px] text-ink">
                메일함 <span className="text-ink-4">· 분류된 메일 {mails.length}통, 오늘 업무 메일 {newMails}통</span>
              </span>
              <IconChevron size={14} className="text-ink-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** ISO → KST 날짜 (YYYY-MM-DD). 없으면 undefined. */
function kstDay(iso?: string): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
  delta,
  deltaGoodWhen = "up",
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "default" | "warn" | "critical";
  delta?: number;
  deltaGoodWhen?: "up" | "down";
  onClick?: () => void;
}) {
  const valueTone =
    value === 0 && tone !== "default"
      ? "text-ink-4"
      : tone === "critical"
        ? "text-critical"
        : tone === "warn"
          ? "text-warn"
          : "text-ink";
  const good = delta !== undefined && delta !== 0 && (deltaGoodWhen === "up" ? delta > 0 : delta < 0);
  const bad = delta !== undefined && delta !== 0 && !good;
  return (
    <button type="button" onClick={onClick} className="card p-4 text-left transition hover:shadow-raised">
      <p className="text-[12px] font-medium text-ink-3">{label}</p>
      <p className={`num mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] ${valueTone}`}>
        {value}
      </p>
      <p className="mt-2 flex items-center gap-1 text-[11.5px]">
        {delta !== undefined && delta !== 0 && (
          <span className={`flex items-center gap-0.5 font-medium ${good ? "text-good" : bad ? "text-critical" : "text-ink-4"}`}>
            {delta > 0 ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
        <span className="text-ink-4">{hint}</span>
      </p>
    </button>
  );
}
