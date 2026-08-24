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
    default: "bg-white text-slate-500 border-slate-200",
    warn: "bg-orange-50 text-orange-700 border-orange-200",
    danger: "bg-red-50 text-red-700 border-red-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
