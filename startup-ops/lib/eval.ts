import { addDays, nextWeekMonday, todayISO, upcomingWeekday } from "./dates";
import { DueSpec, EVAL_SET, EvalCase, ExpectedTask } from "./eval-set";
import { runExtraction } from "./extract";
import { ExtractedTask, Role } from "./types";

/** 실행일 기준으로 정답 마감일을 계산한다. */
export function resolveDue(spec: DueSpec, today: string): string {
  switch (spec.kind) {
    case "offset":
      return addDays(today, spec.days);
    case "weekday":
      return upcomingWeekday(today, spec.weekday);
    case "nextWeekMonday":
      return nextWeekMonday(today);
    case "nextWeekWeekday":
      // 다음 주 월요일을 기준으로 요일만큼 민다 (일요일은 그 주의 끝으로 본다).
      return addDays(nextWeekMonday(today), spec.weekday === 0 ? 6 : spec.weekday - 1);
    case "none":
      return "미정";
  }
}

/** 띄어쓰기·기호 차이로 놓치지 않도록 붙여서 비교한다. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

/** 정답의 낱말이 뽑힌 제목 안에 다 들어 있으면 같은 할일로 본다. */
function matches(expected: ExpectedTask, task: ExtractedTask): boolean {
  const hay = norm(`${task.title} ${task.source}`);
  return expected.keywords.every((k) =>
    (Array.isArray(k) ? k : [k]).some((word) => hay.includes(norm(word))),
  );
}

function roleOk(expected: ExpectedTask, role: Role): boolean {
  return role === expected.role || (expected.roleAlt ?? []).includes(role);
}

export interface CaseResult {
  원문: string;
  정답: number;
  잡음: number;
  놓침: string[];
  오탐: string[];
  마감_맞음: number;
  직무_맞음: number;
  오류?: string;
}

export interface EvalReport {
  실행일: string;
  건수: { 정답: number; 잡음: number; 놓침: number; 오탐: number };
  재현율: string;
  정밀도: string;
  마감일_정확도: string;
  직무_정확도: string;
  사례별: CaseResult[];
}

async function runCase(c: EvalCase, today: string): Promise<CaseResult> {
  const base: CaseResult = {
    원문: c.label,
    정답: c.expected.length,
    잡음: 0,
    놓침: [],
    오탐: [],
    마감_맞음: 0,
    직무_맞음: 0,
  };

  const outcome = await runExtraction(c.text, today);
  if (outcome.demo) {
    // 폴백 결과를 점수에 넣으면 모델 성능이 아니라 폴백 성능을 재게 된다.
    return { ...base, 오류: `추출 실패 — ${outcome.demoReason ?? "원인 미상"}` };
  }

  const tasks = outcome.tasks;
  const used = new Set<number>();

  /*
   * 조건이 많은(=구체적인) 정답부터 짝을 짓는다.
   * 느슨한 정답이 먼저 붙으면 구체적인 정답이 놓친 것으로 잘못 세어진다.
   * ("배포"가 "릴리즈 노트 정리"를 먼저 물어가는 식)
   */
  const ordered = c.expected
    .map((exp, order) => ({ exp, order }))
    .sort((a, b) => b.exp.keywords.length - a.exp.keywords.length || a.order - b.order);

  for (const { exp } of ordered) {
    const idx = tasks.findIndex((t, i) => !used.has(i) && matches(exp, t));
    if (idx === -1) {
      base.놓침.push(exp.keywords.map((k) => (Array.isArray(k) ? k[0] : k)).join(" "));
      continue;
    }
    used.add(idx);
    base.잡음 += 1;
    if (tasks[idx].dueDate === resolveDue(exp.due, today)) base.마감_맞음 += 1;
    if (roleOk(exp, tasks[idx].role)) base.직무_맞음 += 1;
  }

  tasks.forEach((t, i) => {
    if (!used.has(i)) base.오탐.push(t.title);
  });

  return base;
}

const pct = (n: number, d: number) =>
  d === 0 ? "해당 없음" : `${Math.round((n / d) * 100)}% (${n}/${d})`;

/**
 * 정답지를 모두 돌려 점수를 낸다.
 *
 * 순차로 부르면 서버리스 실행 시간을 넘기므로 한꺼번에 보낸다.
 */
export async function runEval(): Promise<EvalReport> {
  const today = todayISO();
  const 사례별 = await Promise.all(EVAL_SET.map((c) => runCase(c, today)));

  const sum = (f: (r: CaseResult) => number) => 사례별.reduce((n, r) => n + f(r), 0);
  const 정답 = sum((r) => r.정답);
  const 잡음 = sum((r) => r.잡음);
  const 오탐 = sum((r) => r.오탐.length);

  return {
    실행일: today,
    건수: { 정답, 잡음, 놓침: 정답 - 잡음, 오탐 },
    재현율: pct(잡음, 정답),
    정밀도: pct(잡음, 잡음 + 오탐),
    마감일_정확도: pct(sum((r) => r.마감_맞음), 잡음),
    직무_정확도: pct(sum((r) => r.직무_맞음), 잡음),
    사례별,
  };
}
