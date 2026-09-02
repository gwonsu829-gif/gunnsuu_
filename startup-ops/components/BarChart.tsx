"use client";

import { useState } from "react";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarDatum {
  label: string;
  /** 축 밑 보조 표기 (요일 등) */
  sub?: string;
  values: Record<string, number>;
  /** 오늘 칸 강조 */
  today?: boolean;
}

interface Props {
  series: BarSeries[];
  data: BarDatum[];
  height?: number;
}

/**
 * 묶음 막대. 라이브러리 없이 SVG로 그린다 — 필요한 건 막대 14개와 눈금 4줄뿐이다.
 * 마우스를 올리면 그 날 숫자가 뜬다. 값이 전부 0이어도 축은 그려서 "비어 있음"이 보이게 한다.
 */
export default function BarChart({ series, data, height = 200 }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const padL = 30;
  const padR = 8;
  const padT = 12;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(
    1,
    ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)),
  );
  // 눈금이 3~4개로 떨어지게 위를 올림한다.
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  const groupW = innerW / Math.max(data.length, 1);
  const barGap = 2;
  const barW = Math.max(6, Math.min(22, (groupW * 0.62 - barGap * (series.length - 1)) / series.length));

  const y = (v: number) => padT + innerH - (v / top) * innerH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="최근 7일 인입·완료">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="#e6e6e9"
              strokeDasharray={t === 0 ? undefined : "2 4"}
            />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#9b9ba3" className="num">
              {t}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const gx = padL + i * groupW;
          const totalW = series.length * barW + (series.length - 1) * barGap;
          const startX = gx + (groupW - totalW) / 2;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* 넉넉한 마우스 영역. 막대가 얇아 막대 자체를 맞히게 하면 답답하다. */}
              <rect x={gx} y={padT} width={groupW} height={innerH} fill={hover === i ? "#f7f7f8" : "transparent"} rx="6" />
              {series.map((s, j) => {
                const v = d.values[s.key] ?? 0;
                const h = Math.max(0, y(0) - y(v));
                return (
                  <rect
                    key={s.key}
                    x={startX + j * (barW + barGap)}
                    y={y(v)}
                    width={barW}
                    height={h}
                    rx={h < 4 ? 1 : 4}
                    fill={s.color}
                    opacity={hover !== null && hover !== i ? 0.55 : 1}
                  />
                );
              })}
              <text
                x={gx + groupW / 2}
                y={H - padB + 16}
                textAnchor="middle"
                fontSize="11"
                fontWeight={d.today ? 600 : 400}
                fill={d.today ? "#141416" : "#6c6c74"}
                className="num"
              >
                {d.label}
              </text>
              {d.sub && (
                <text x={gx + groupW / 2} y={H - padB + 29} textAnchor="middle" fontSize="10" fill="#9b9ba3">
                  {d.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-2 rounded-md border border-line bg-surface px-2.5 py-2 text-[11px] shadow-pop"
          style={{
            left: `${((padL + hover * groupW + groupW / 2) / W) * 100}%`,
            transform: hover > data.length / 2 ? "translateX(-105%)" : "translateX(8px)",
          }}
        >
          <p className="font-semibold text-ink">
            {data[hover].label}
            {data[hover].sub ? ` (${data[hover].sub})` : ""}
          </p>
          {series.map((s) => (
            <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label} <span className="num font-medium text-ink">{data[hover].values[s.key] ?? 0}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(max: number): number {
  if (max <= 4) return 1;
  if (max <= 8) return 2;
  if (max <= 20) return 5;
  if (max <= 40) return 10;
  if (max <= 100) return 25;
  return Math.pow(10, Math.floor(Math.log10(max))) / 2;
}
