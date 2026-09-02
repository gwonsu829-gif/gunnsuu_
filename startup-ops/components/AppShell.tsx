"use client";

import { useEffect, useRef, useState } from "react";

import {
  IconCalendar,
  IconFlow,
  IconGrid,
  IconInbox,
  IconMail,
  IconSearch,
  IconSettings,
  IconSync,
} from "./Icons";
import { initial } from "@/lib/team";
import { TeamMember } from "@/lib/types";

export type TabKey = "overview" | "mail" | "calendar" | "inbox" | "flow" | "settings";

export interface NavItem {
  key: TabKey;
  label: string;
  count?: number;
  /** 숫자 색. 급한 것만 빨갛게. */
  tone?: "critical" | "default";
}

interface Props {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  nav: NavItem[];
  team: TeamMember[];
  user: string | null;
  onPickUser: (name: string) => void;
  search: string;
  onSearch: (v: string) => void;
  syncing: boolean;
  /** 상단 오른쪽 상태 칩 */
  chips: { label: string; tone: "good" | "warn" | "muted"; onClick?: () => void }[];
  companyName: string;
  children: React.ReactNode;
}

const GROUPS: { title: string; keys: TabKey[] }[] = [
  { title: "", keys: ["overview"] },
  { title: "업무", keys: ["inbox", "calendar", "flow"] },
  { title: "연동", keys: ["mail"] },
];

const ICON: Record<TabKey, (p: { className?: string }) => JSX.Element> = {
  overview: IconGrid,
  mail: IconMail,
  calendar: IconCalendar,
  inbox: IconInbox,
  flow: IconFlow,
  settings: IconSettings,
};

/**
 * 왼쪽 사이드바 + 위 검색줄 + 본문.
 *
 * 탭을 상단에 늘어놓던 것을 사이드바로 옮겼다. 화면이 여섯 개가 되면서 가로 탭은
 * 한 줄에 안 들어가고, 무엇보다 "지금 어디에 있나"가 항상 왼쪽에 보여야 한다.
 */
export default function AppShell({
  tab,
  onTab,
  nav,
  team,
  user,
  onPickUser,
  search,
  onSearch,
  syncing,
  chips,
  companyName,
  children,
}: Props) {
  const [open, setOpen] = useState(false); // 모바일 서랍
  const [userMenu, setUserMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K 로 검색. 참고 이미지와 같은 관례라 손이 먼저 간다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const me = team.find((m) => m.name === user) ?? null;
  const byKey = new Map(nav.map((n) => [n.key, n]));

  const Sidebar = (
    <aside className="flex h-full w-[232px] flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-white"
        >
          {initial(companyName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold tracking-[-0.01em] text-ink">
            {companyName}
          </p>
          <p className="text-[11px] text-ink-4">업무 대시보드</p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 px-3">
        {GROUPS.map((g) => (
          <div key={g.title || "top"}>
            {g.title && (
              <p className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">
                {g.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {g.keys.map((key) => {
                const item = byKey.get(key);
                if (!item) return null;
                const Icon = ICON[key];
                const active = tab === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        onTab(key);
                        setOpen(false);
                      }}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition ${
                        active
                          ? "bg-sunk font-semibold text-ink"
                          : "text-ink-2 hover:bg-sunk hover:text-ink"
                      }`}
                    >
                      <Icon className={active ? "text-ink" : "text-ink-3"} />
                      <span className="flex-1">{item.label}</span>
                      {item.count !== undefined && item.count > 0 && (
                        <span
                          className={`num rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${
                            item.tone === "critical"
                              ? "bg-critical-soft text-critical"
                              : "bg-ground text-ink-3"
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <button
          type="button"
          onClick={() => {
            onTab("settings");
            setOpen(false);
          }}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition ${
            tab === "settings"
              ? "bg-sunk font-semibold text-ink"
              : "text-ink-2 hover:bg-sunk hover:text-ink"
          }`}
        >
          <IconSettings className="text-ink-3" />
          설정
        </button>

        <div className="relative mt-2">
          <button
            type="button"
            onClick={() => setUserMenu((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-sunk"
          >
            <Avatar name={user ?? "?"} color={me?.color ?? "#9b9ba3"} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">
                {user ?? "이름을 고르세요"}
              </p>
              <p className="truncate text-[11px] text-ink-4">
                {me?.role ?? "내가 누구인지 알려주면 이력에 이름이 남습니다"}
              </p>
            </div>
          </button>
          {userMenu && (
            <div className="drop-in absolute bottom-full left-0 z-20 mb-1 w-full rounded-md border border-line bg-surface p-1 shadow-pop">
              {team.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => {
                    onPickUser(m.name);
                    setUserMenu(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-sunk ${
                    m.name === user ? "font-semibold text-ink" : "text-ink-2"
                  }`}
                >
                  <Avatar name={m.name} color={m.color} small />
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      {/* 데스크톱 사이드바 */}
      <div className="sticky top-0 hidden h-screen lg:block">{Sidebar}</div>

      {/* 모바일 서랍 */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <div className="absolute inset-y-0 left-0">{Sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="메뉴"
            onClick={() => setOpen(true)}
            className="rounded-md border border-line p-1.5 text-ink-2 lg:hidden"
          >
            <IconGrid />
          </button>

          <label className="relative flex w-full max-w-[400px] items-center">
            <IconSearch className="pointer-events-none absolute left-3 text-ink-4" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="할일·메일 검색"
              className="w-full rounded-md border border-line bg-sunk py-2 pl-9 pr-12 text-[13px] text-ink placeholder:text-ink-4 focus:border-accent focus:bg-surface focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2.5 rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px] text-ink-4">
              ⌘K
            </kbd>
          </label>

          <div className="ml-auto flex items-center gap-1.5">
            {syncing && (
              <span className="hidden items-center gap-1 text-[11px] text-ink-4 sm:flex">
                <IconSync className="animate-spin" size={13} /> 동기화 중
              </span>
            )}
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.onClick}
                className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium sm:flex ${
                  c.tone === "good"
                    ? "border-good-line bg-good-soft text-good"
                    : c.tone === "warn"
                      ? "border-warn-line bg-warn-soft text-warn"
                      : "border-line bg-surface text-ink-3"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    c.tone === "good" ? "bg-good" : c.tone === "warn" ? "bg-warn" : "bg-ink-4"
                  }`}
                />
                {c.label}
              </button>
            ))}
            <Avatar name={user ?? "?"} color={me?.color ?? "#9b9ba3"} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function Avatar({
  name,
  color,
  small = false,
}: {
  name: string;
  color: string;
  small?: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
        small ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-[11.5px]"
      }`}
    >
      {initial(name)}
    </span>
  );
}
