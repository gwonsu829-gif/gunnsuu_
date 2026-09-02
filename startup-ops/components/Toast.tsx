"use client";

import { IconAlert, IconCheck, IconX } from "./Icons";

export interface ToastItem {
  id: number;
  tone: "info" | "good" | "warn" | "critical";
  text: string;
}

/**
 * 오른쪽 아래 알림. 저장 결과·충돌·동기화 결과를 알린다.
 * 화면 한가운데 모달로 막지 않는다 — 세 사람이 계속 손을 움직이는 화면이다.
 */
export default function ToastStack({
  items,
  onClose,
}: {
  items: ToastItem[];
  onClose: (id: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`rise-in pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[12.5px] shadow-pop ${
            t.tone === "good"
              ? "border-good-line bg-surface text-ink"
              : t.tone === "warn"
                ? "border-warn-line bg-warn-soft text-warn"
                : t.tone === "critical"
                  ? "border-critical-line bg-critical-soft text-critical"
                  : "border-line bg-surface text-ink"
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {t.tone === "good" ? <IconCheck size={14} className="text-good" /> : <IconAlert size={14} />}
          </span>
          <p className="flex-1 leading-snug">{t.text}</p>
          <button type="button" aria-label="닫기" onClick={() => onClose(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
