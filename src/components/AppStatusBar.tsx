import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { GITHUB_REPO_URL, APP_VERSION, type WorkspaceFooterState } from "@/domain/constants";
import type { MessageKey } from "@/domain/i18n";
import { NotificationCenter } from "@/components/NotificationCenter";
import { CreditsPanel } from "@/components/CreditsPanel";
import { useLocale } from "@/hooks/useLocale";
import { openExternalUrl, revealInExplorer } from "@/lib/files";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  );
}

function formatExportAgo(
  at: number,
  now: number,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 45) return t("status.savedJustNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("status.savedMinutesAgo", { minutes: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("status.savedHoursAgo", { hours: hr });
  return t("status.savedDaysAgo", { days: Math.floor(hr / 24) });
}

function Dot() {
  return <span className="text-border select-none">·</span>;
}

export function AppStatusBar({
  footer,
  unsaved,
}: {
  footer: WorkspaceFooterState;
  unsaved: boolean;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const canReveal = !!footer.file?.path;

  useEffect(() => {
    if (footer.lastExportAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [footer.lastExportAt]);

  useEffect(() => {
    if (footer.lastExportAt != null) setNow(Date.now());
  }, [footer.lastExportAt]);

  const reveal = async () => {
    if (!footer.file?.path || busy) return;
    setBusy(true);
    try {
      await revealInExplorer(footer.file.path);
    } catch (error) {
      toast(error instanceof Error ? error.message : t("status.toast.revealFailed"), true);
    } finally {
      setBusy(false);
    }
  };

  const openRepo = async () => {
    try {
      await openExternalUrl(GITHUB_REPO_URL);
    } catch (error) {
      toast(error instanceof Error ? error.message : t("status.toast.githubFailed"), true);
    }
  };

  const metaBits = [
    footer.format,
    footer.counts,
    footer.lastExportAt != null ? formatExportAgo(footer.lastExportAt, now, t) : null,
  ].filter(Boolean) as string[];

  return (
    <footer className="flex h-[var(--statusbar-h)] shrink-0 items-center justify-between gap-3 border-t border-border bg-activity/95 px-3">
      <div className="flex min-w-0 items-center gap-2">
        {footer.file ? (
          <>
            <span
              className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
              title={footer.file.path ?? footer.file.name}
            >
              {footer.file.name}
            </span>
            {canReveal ? (
              <button
                type="button"
                title={t("status.revealTitle")}
                disabled={busy}
                onClick={() => void reveal()}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-line-soft bg-panel/50 px-1.5",
                  "text-[10px] font-medium text-muted-foreground transition-colors",
                  "hover:border-primary/35 hover:bg-primary/10 hover:text-bright",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                <FolderOpen className="size-3" strokeWidth={1.75} />
                {t("status.reveal")}
              </button>
            ) : null}
          </>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">{t("status.noFile")}</span>
        )}

        {unsaved ? (
          <>
            <Dot />
            <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-warning">
              {t("status.unsaved")}
            </span>
          </>
        ) : null}

        {metaBits.length > 0 ? (
          <>
            <Dot />
            <span className="min-w-0 truncate font-mono text-[11px] text-faint">
              {metaBits.map((bit, i) => (
                <span key={`${bit}-${i}`}>
                  {i > 0 ? <span className="text-border"> · </span> : null}
                  {bit}
                </span>
              ))}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <CreditsPanel />
        <NotificationCenter />
        <button
          type="button"
          title={t("status.githubTitle")}
          aria-label={t("status.githubTitle")}
          onClick={() => void openRepo()}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-primary/10 hover:text-bright",
          )}
        >
          <GitHubIcon className="size-3.5" />
        </button>
        <span className="font-mono text-[11px] text-muted-foreground">v{APP_VERSION}</span>
      </div>
    </footer>
  );
}
