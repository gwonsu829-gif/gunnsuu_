"use client";

import { useState } from "react";

/** 팀 접근코드 입력. 계정이 아니라 코드 하나 — 3인 팀에 맞는 만큼만 잠근다. */
export default function LoginPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "접근코드가 맞지 않습니다.");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-[380px] p-7">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[14px] font-bold text-white"
          >
            앰
          </span>
          <div>
            <h1 className="text-[16px] font-bold text-ink">업무 대시보드</h1>
            <p className="text-[12px] text-ink-3">팀 접근코드를 입력하세요</p>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="text-[12px] font-medium text-ink-2">접근코드</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-md border border-critical-line bg-critical-soft px-3 py-2 text-[12px] text-critical">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="mt-5 w-full rounded-md bg-primary py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "확인 중" : "들어가기"}
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-ink-4">
          코드는 대표님이 정해 팀에 공유합니다. 30일 동안 다시 묻지 않습니다.
        </p>
      </form>
    </main>
  );
}
