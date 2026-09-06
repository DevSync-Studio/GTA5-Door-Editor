import type { ReactNode } from "react";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";

export type WorkspaceStatus = "unsaved" | "ready" | "uptodate";

const STATUS_STYLES: Record<WorkspaceStatus, string> = {
  unsaved: "border-warning/35 bg-warning/12 text-warning",
  ready: "border-mint/35 bg-mint/12 text-mint",
  uptodate: "border-line-soft bg-panel-2/80 text-faint",
};

const STATUS_KEYS: Record<WorkspaceStatus, "app.status.unsaved" | "app.status.ready" | "app.status.uptodate"> = {
  unsaved: "app.status.unsaved",
  ready: "app.status.ready",
  uptodate: "app.status.uptodate",
};

export function WorkspaceStatusBadge({
  status,
  className,
}: {
  status: WorkspaceStatus;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em]",
        "border",
        STATUS_STYLES[status],
        className,
      )}
    >
      {t(STATUS_KEYS[status])}
    </span>
  );
}

export function WorkspaceShell({
  title,
  subtitle,
  status,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: WorkspaceStatus | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line-soft bg-activity/90 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="m-0 shrink-0 text-[13px] font-semibold tracking-tight text-bright">
            {title}
          </h1>
          {subtitle ? (
            <>
              <span className="shrink-0 text-faint/50" aria-hidden>
                /
              </span>
              <p
                className="m-0 min-w-0 truncate font-mono text-[12px] leading-none text-faint"
                title={typeof subtitle === "string" ? subtitle : undefined}
              >
                {subtitle}
              </p>
            </>
          ) : null}
          {status ? <WorkspaceStatusBadge status={status} className="ml-0.5" /> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center justify-end gap-1.5">{actions}</div>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
