"use client";

import { useEffect, useRef } from "react";

import { Sample, SampleId } from "@/lib/samples";

interface Props {
  value: string;
  onChange: (v: string) => void;
  samples: Sample[];
  activeSampleId: SampleId | null;
  onInjectSample: (sample: Sample) => void;
  onExtract: () => void;
  loading: boolean;
  /** 선택된 카드의 근거 문장. 원문에서 찾으면 하이라이트 모드로 전환된다. */
  highlight: string | null;
  onExitHighlight: () => void;
  error: string | null;
}

export default function SourcePanel({
  value,
  onChange,
  samples,
  activeSampleId,
  onInjectSample,
  onExtract,
  loading,
  highlight,
  onExitHighlight,
  error,
}: Props) {
  const markRef = useRef<HTMLElement>(null);
  const segments = highlight ? splitAround(value, highlight) : null;

  useEffect(() => {
    if (segments) {
      markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [segments, highlight]);

  return (
    <section className="flex min-h-0 flex-col rounded-md border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold text-ink">원문 입력</h2>
        <div className="flex flex-wrap gap-1">
          {samples.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => onInjectSample(sample)}
              title={sample.hint}
              className={`rounded border px-2 py-1 text-[11px] font-medium transition
                ${
                  activeSampleId === sample.id
                    ? "border-accent bg-accent text-white"
                    : "border-line-strong bg-surface text-ink-2 hover:border-ink-4 hover:text-ink"
                }`}
            >
              {sample.label}
            </button>
          ))}
        </div>
      </header>

      <div className="relative min-h-[320px] flex-1">
        {segments ? (
          <div
            role="button"
            tabIndex={0}
            onClick={onExitHighlight}
            onKeyDown={(e) => e.key === "Enter" && onExitHighlight()}
            title="클릭하면 편집 모드로 돌아갑니다"
            className="thin-scroll h-full w-full cursor-text overflow-auto whitespace-pre-wrap break-words p-3 text-[13px] leading-relaxed text-ink-2"
          >
            {segments.before}
            <mark
              ref={markRef}
              className="rounded bg-yellow-200 px-0.5 py-px text-ink ring-1 ring-yellow-400"
            >
              {segments.match}
            </mark>
            {segments.after}
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            placeholder="메일 원문이나 디스코드 대화를 붙여넣으세요"
            className="thin-scroll h-full w-full resize-none border-0 p-3 text-[13px] leading-relaxed text-ink-2 outline-none placeholder:text-ink-4"
          />
        )}

        {segments && (
          <div className="pointer-events-none absolute right-3 top-3 rounded border border-yellow-300 bg-yellow-50 px-2 py-1 text-[11px] text-yellow-800">
            근거 문장 표시 중 · 클릭하면 편집으로 복귀
          </div>
        )}
      </div>

      <footer className="border-t border-line px-3 py-2">
        {error && (
          <p className="mb-2 rounded border border-critical-line bg-critical-soft px-2 py-1 text-[11px] text-critical">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-4">
            {value.length.toLocaleString()}자
          </span>
          <button
            type="button"
            onClick={onExtract}
            disabled={loading || value.trim().length === 0}
            className="inline-flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:bg-line-strong"
          >
            {loading && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {loading ? "분석 중" : "AI로 할일 추출하기"}
          </button>
        </div>
      </footer>
    </section>
  );
}

/** 원문에서 근거 문장을 찾아 앞/일치/뒤로 쪼갠다. 못 찾으면 null. */
function splitAround(text: string, needle: string) {
  const target = needle.trim();
  if (!target) return null;

  let index = text.indexOf(target);
  let matched = target;

  if (index === -1) {
    // 모델이 문장 끝 구두점이나 공백을 살짝 다르게 옮겨오는 경우를 흡수한다.
    const loose = target.replace(/[\s.,!?"'“”‘’]+$/g, "");
    index = text.indexOf(loose);
    matched = loose;
  }
  if (index === -1) return null;

  return {
    before: text.slice(0, index),
    match: text.slice(index, index + matched.length),
    after: text.slice(index + matched.length),
  };
}
