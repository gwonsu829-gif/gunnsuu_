import { PRIORITY_STYLE, ROLE_STYLE } from "@/lib/roles";
import { Priority, Role } from "@/lib/types";

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${ROLE_STYLE[role].badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ROLE_STYLE[role].dot}`} />
      {role}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${PRIORITY_STYLE[priority]}`}
    >
      {priority}
    </span>
  );
}

export function MetaBadge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warn" | "danger";
}) {
  const tones = {
    default: "bg-surface text-ink-3 border-line",
    warn: "bg-warn-soft text-warn border-warn-line",
    danger: "bg-critical-soft text-critical border-critical-line",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
