import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FilePlus2, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/Dialogs";
import { SearchField } from "@/components/SearchField";
import { toast } from "@/lib/toast";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { VirtualList } from "@/components/VirtualList";
import { useNativeDrop } from "@/hooks/useNativeDrop";
import { useLocale } from "@/hooks/useLocale";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import { mergeTuningFiles, mergeTuningFilesMany, parseTuning, type MergeResult } from "@/domain/tuning";
import { openTextFile, saveTextFileAs, type NativeFile } from "@/lib/files";
import { cn } from "@/lib/utils";

type Slot = {
  id: string;
  path: string;
  name: string;
  text: string;
  tunings: number;
  mappings: number;
};

type PreviewTab = "adds" | "conflicts";

function packSlot(file: NativeFile): Slot {
  const data = parseTuning(file.text);
  return {
    id: `${file.name}:${file.path || file.text.length}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
    path: file.path,
    name: file.name,
    text: file.text,
    tunings: data.tunings.length,
    mappings: data.maps.length,
  };
}

export const MergeView = memo(function MergeView({
  onDirty,
  onFooter,
  isActive = true,
}: {
  onDirty: (dirty: boolean) => void;
  onFooter?: (state: import("@/domain/constants").WorkspaceFooterState) => void;
  isActive?: boolean;
}) {
  const { t } = useLocale();
  const workspaceActive = isActive;
  const [main, setMain] = useState<Slot | null>(null);
  const [incoming, setIncoming] = useState<Slot[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<PreviewTab>("adds");
  const [confirmReset, setConfirmReset] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);

  const result: MergeResult | null = useMemo(() => {
    if (!main || incoming.length === 0) return null;
    try {
      return mergeTuningFilesMany(
        main.text,
        incoming.map((file) => ({ name: file.name, text: file.text })),
      );
    } catch {
      /* Invalid XML - useEffect below toasts once per file set. */
      return null;
    }
  }, [main, incoming]);

  const additionCount = result ? result.addTunings.length + result.addMaps.length : 0;
  const hasAdditions = additionCount > 0;
  const nothingNew = !!result && !hasAdditions;

  useEffect(() => {
    if (!onFooter) return;
    onFooter({
      file: main ? { name: main.name, path: main.path || null } : null,
      format: main ? "YMT" : null,
      counts: result
        ? t("status.counts.merge", {
            adds: result.addTunings.length,
            conflicts: result.conflicts.length,
          })
        : incoming.length
          ? t("status.counts.conflicting", { count: incoming.length })
          : null,
      lastExportAt,
    });
  }, [main, incoming.length, result, lastExportAt, onFooter, t]);

  const fileStatus = useMemo(() => {
    const map = new Map<string, { adds: number; conflicts: number }>();
    if (!main) return map;
    for (const file of incoming) {
      try {
        const step = mergeTuningFiles(main.text, file.text);
        map.set(file.id, {
          adds: step.addTunings.length + step.addMaps.length,
          conflicts: step.conflicts.length,
        });
      } catch {
        /* Per-file badge only - bad file shows 0/0; overall merge toast covers failure. */
        map.set(file.id, { adds: 0, conflicts: 0 });
      }
    }
    return map;
  }, [main, incoming]);

  useEffect(() => {
    if (!result) return;
    if (!hasAdditions && result.conflicts.length > 0) setTab("conflicts");
  }, [result, hasAdditions]);

  const mergeFailKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!main || incoming.length === 0) {
      mergeFailKeyRef.current = null;
      return;
    }
    if (result) {
      mergeFailKeyRef.current = null;
      return;
    }
    const key = `${main.id}|${incoming.map((f) => f.id).join(",")}`;
    if (mergeFailKeyRef.current === key) return;
    mergeFailKeyRef.current = key;
    toast(t("merge.toast.mergeFailed"), true);
  }, [main, incoming, result, t]);

  useEffect(() => {
    onDirty(!!main || incoming.length > 0);
  }, [main, incoming.length, onDirty]);

  const setMainFile = useCallback((file: NativeFile) => {
    const slot = packSlot(file);
    setMain(slot);
    toast(t("merge.toast.mainSet", { name: slot.name }), "info");
  }, [t]);

  const addIncomingFiles = useCallback(
    (files: NativeFile[]) => {
      if (!main) {
        toast(t("merge.toast.importMainFirst"), true);
        return;
      }
      const next: Slot[] = [];
      for (const file of files) {
        try {
          const slot = packSlot(file);
          if (
            (main.path && slot.path && main.path === slot.path) ||
            (slot.name === main.name && slot.text === main.text)
          ) {
            toast(t("merge.toast.skippedSameAsMain", { name: slot.name }), true);
            continue;
          }
          if (incoming.some((item) => item.name === slot.name && item.text === slot.text)) {
            toast(t("merge.toast.skippedDuplicate", { name: slot.name }), true);
            continue;
          }
          next.push(slot);
        } catch (error) {
          toast(
            error instanceof Error ? error.message : t("merge.toast.readFailed", { name: file.name }),
            true,
          );
        }
      }
      if (next.length === 0) return;
      setIncoming((prev) => [...prev, ...next]);
      toast(
        next.length === 1
          ? t("merge.toast.addedOne", { name: next[0].name })
          : t("merge.toast.addedMany", { count: next.length }),
        "info",
      );
    },
    [incoming, main, t],
  );

  const loadDropped = useCallback(
    (file: NativeFile) => {
      try {
        if (!main) setMainFile(file);
        else addIncomingFiles([file]);
      } catch (error) {
        toast(error instanceof Error ? error.message : t("merge.toast.importFailed"), true);
      }
    },
    [addIncomingFiles, main, setMainFile, t],
  );

  useNativeDrop(loadDropped, undefined, workspaceActive);

  const pickMain = async () => {
    const file = await openTextFile(t("merge.dialog.main"), [
      { title: t("merge.dialog.filter"), extensions: ["ymt", "xml", "txt"] },
    ]);
    if (!file) return;
    try {
      setMainFile(file);
    } catch (error) {
      toast(error instanceof Error ? error.message : t("merge.toast.importFailed"), true);
    }
  };

  const pickIncoming = async () => {
    const file = await openTextFile(t("merge.dialog.incoming"), [
      { title: t("merge.dialog.filter"), extensions: ["ymt", "xml", "txt"] },
    ]);
    if (!file) return;
    addIncomingFiles([file]);
  };

  const removeIncoming = (id: string) => {
    setIncoming((prev) => prev.filter((item) => item.id !== id));
  };

  const q = search.toLowerCase();
  const tunings = useMemo(
    () => result?.addTunings.filter((name) => name.toLowerCase().includes(q)) ?? [],
    [result, q],
  );
  const maps = useMemo(
    () =>
      result?.addMaps.filter((item) =>
        `${item.model} ${item.tuning}`.toLowerCase().includes(q),
      ) ?? [],
    [result, q],
  );
  const conflicts = useMemo(
    () =>
      result?.conflicts.filter((item) =>
        `${item.kind} ${item.model} ${item.existing} ${item.incoming} ${item.source ?? ""}`
          .toLowerCase()
          .includes(q),
      ) ?? [],
    [result, q],
  );

  const exportMerged = async () => {
    if (!result || !main) return;
    try {
      const saved = await saveTextFileAs(
        t("merge.dialog.export"),
        "doortuning_merged.ymt",
        result.xml,
        [{ title: t("merge.dialog.filterYmt"), extensions: ["ymt", "xml"] }],
      );
      if (!saved) return;
      setLastExportAt(Date.now());
      toast(
        nothingNew ? t("merge.toast.exportedNothingNew") : t("merge.toast.exported"),
        "export",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : t("merge.toast.saveFailed"), true);
    }
  };

  const previewSummary = !result
    ? t("merge.preview.idle")
    : hasAdditions
      ? t("merge.preview.summary", {
          tunings: result.addTunings.length,
          mappings: result.addMaps.length,
          conflicts: result.conflicts.length,
        })
      : result.conflicts.length > 0
        ? t("merge.preview.nothingConflicts", { count: result.conflicts.length })
        : t("merge.preview.nothingCovered");

  useWorkspaceActions("merge", workspaceActive, {
    export: () => {
      if (result) void exportMerged();
    },
    unload: () => setConfirmReset(true),
  });

  return (
    <WorkspaceShell
      title={t("merge.title")}
      subtitle={main?.name}
      status={result ? (hasAdditions ? "ready" : "uptodate") : null}
      actions={
        <>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!result}
            onClick={() => void exportMerged()}
          >
            <Upload className="size-3.5" strokeWidth={1.75} />
            {t("merge.export")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!main && incoming.length === 0}
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
            {t("merge.reset")}
          </Button>
        </>
      }
    >
      <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] divide-x divide-line-soft xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col bg-sidebar/80">
          <div className="ide-panel-head shrink-0">
            {t("merge.panel.main")}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-md px-3 text-[12px]"
              onClick={() => void pickMain()}
            >
              <Download className="size-3.5" strokeWidth={1.75} />
              {main ? t("merge.main.replace") : t("merge.main.import")}
            </Button>
          </div>

          <div className="shrink-0 border-b border-line-soft px-3 py-3">
            {main ? (
              <div className="rounded-lg border border-line-soft bg-panel/50 px-3 py-3">
                <div className="truncate text-[13px] font-semibold tracking-tight text-bright">
                  {main.name}
                </div>
                <div className="mt-1 font-mono text-[11px] text-faint">
                  {t("merge.main.stats", { tunings: main.tunings, mappings: main.mappings })}
                </div>
                <p className="mt-2 m-0 text-[11px] leading-4 text-faint">
                  {t("merge.main.baseHint")}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void pickMain()}
                className="flex w-full flex-col items-center gap-2.5 rounded-lg border border-dashed border-line-soft bg-panel/30 px-3 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-panel-2/80 text-mint">
                  <Download className="size-4" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="text-[12px] font-medium text-bright">{t("merge.main.emptyTitle")}</div>
                  <div className="mt-0.5 text-[11px] text-faint">{t("merge.main.emptyHint")}</div>
                </div>
              </button>
            )}
          </div>

          <div className="ide-panel-head shrink-0 border-t-0">
            {t("merge.panel.conflicting")}
            <span className="flex items-center gap-2 font-normal normal-case tracking-normal">
              <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                {incoming.length}
              </Badge>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 rounded-md px-3 text-[12px] leading-none [&_svg]:size-3.5"
                disabled={!main}
                onClick={() => void pickIncoming()}
              >
                <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
                <span className="leading-none">{t("common.add")}</span>
              </Button>
            </span>
          </div>

          <div className="min-h-0 flex-1 basis-0">
            {!main ? (
              <div className="grid h-full place-items-center px-4 text-center">
                <p className="m-0 text-[12px] leading-5 text-faint">
                  {t("merge.incoming.needMain")}
                </p>
              </div>
            ) : incoming.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <FilePlus2 className="size-5 text-faint" strokeWidth={1.5} />
                <p className="m-0 max-w-55 text-[12px] leading-5 text-faint">
                  {t("merge.incoming.empty")}
                </p>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => void pickIncoming()}>
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  {t("merge.incoming.add")}
                </Button>
              </div>
            ) : (
              <VirtualList
                items={incoming}
                itemHeight={64}
                render={(file) => {
                  const status = fileStatus.get(file.id);
                  const statusLabel = status
                    ? status.adds > 0
                      ? status.conflicts
                        ? t("merge.incoming.status.newWithConflicts", {
                            adds: status.adds,
                            conflicts: status.conflicts,
                          })
                        : t("merge.incoming.status.new", { count: status.adds })
                      : status.conflicts > 0
                        ? t("merge.incoming.status.covered", { count: status.conflicts })
                        : t("merge.incoming.status.alreadyCovered")
                    : t("merge.incoming.status.fallback", {
                        tunings: file.tunings,
                        mappings: file.mappings,
                      });
                  return (
                    <div className="ide-row-actions">
                      <div className="ide-row-main pointer-events-none">
                        <span className="w-full truncate">{file.name}</span>
                        <small>{statusLabel}</small>
                      </div>
                      <div className="ide-row-btns">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          title={t("merge.removeFile", { name: file.name })}
                          aria-label={t("merge.removeFile", { name: file.name })}
                          className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          onClick={() => removeIncoming(file.id)}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                        </Button>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col bg-editor">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold tracking-tight text-bright">
                {result ? t("merge.preview.merge") : t("merge.preview")}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-faint">{previewSummary}</div>
            </div>
            {result ? (
              <div className="flex shrink-0 gap-0.5 rounded-md border border-line-soft bg-panel/50 p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    tab === "adds" ? "bg-primary/20 text-bright" : "text-faint hover:text-muted-foreground",
                  )}
                  onClick={() => setTab("adds")}
                >
                  {t("merge.tab.additions")}
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    tab === "conflicts" ? "bg-primary/20 text-bright" : "text-faint hover:text-muted-foreground",
                  )}
                  onClick={() => setTab("conflicts")}
                >
                  {t("merge.tab.conflicts")}
                  {result.conflicts.length > 0 ? (
                    <span className="ml-1.5 font-mono text-[10px] text-warning">{result.conflicts.length}</span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>

          {!result ? (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <p className="m-0 max-w-sm text-[13px] leading-6 text-muted-foreground">
                {!main ? t("merge.empty.needMain") : t("merge.empty.needIncoming")}
              </p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-line-soft px-2.5 py-3">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder={tab === "conflicts" ? t("merge.filter.conflicts") : t("merge.filter.additions")}
                />
              </div>

              {tab === "conflicts" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  {conflicts.length === 0 ? (
                    <div className="grid h-full place-items-center px-4 text-center text-[12px] text-faint">
                      {t("merge.empty.noConflicts")}
                    </div>
                  ) : (
                    <>
                      <p className="m-0 shrink-0 border-b border-line-soft px-3 py-2 text-[11px] leading-4 text-faint">
                        {nothingNew ? t("merge.conflicts.hintNothingNew") : t("merge.conflicts.hint")}
                      </p>
                      <div className="grid shrink-0 grid-cols-[minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-3 border-b border-line-soft px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                        <span>{t("merge.conflicts.col.type")}</span>
                        <span>{t("merge.conflicts.col.name")}</span>
                        <span>{t("merge.conflicts.col.main")}</span>
                        <span className="text-warning">{t("merge.conflicts.col.conflicting")}</span>
                        <span className="text-right">{t("merge.conflicts.col.file")}</span>
                      </div>
                      <div className="min-h-0 flex-1 basis-0">
                        <VirtualList
                          items={conflicts}
                          itemHeight={56}
                          render={(item) => (
                            <div className="grid h-full min-w-0 grid-cols-[minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-3 border-b border-line-soft/70 px-3">
                              <span className="min-w-0 truncate text-[11px] uppercase tracking-wide text-faint">
                                {item.kind === "tuning"
                                  ? t("merge.conflicts.kind.tuning")
                                  : t("merge.conflicts.kind.mapping")}
                              </span>
                              <span className="min-w-0 truncate text-[13px] text-bright">{item.model}</span>
                              <span className="min-w-0 truncate font-mono text-[12px] text-bright">
                                {item.existing}
                              </span>
                              <span className="min-w-0 truncate font-mono text-[12px] text-warning">
                                {item.incoming}
                              </span>
                              <span className="min-w-0 truncate text-right text-[11px] text-faint">
                                {item.source ?? "-"}
                              </span>
                            </div>
                          )}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : nothingNew ? (
                <div className="grid flex-1 place-items-center px-6 text-center">
                  <p className="m-0 max-w-sm text-[13px] leading-6 text-muted-foreground">
                    {t("merge.empty.nothingNew")}
                  </p>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-line-soft lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <div className="flex min-h-0 flex-col">
                    <div className="ide-panel-head shrink-0">
                      {t("merge.additions.newTunings")}
                      <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                        {tunings.length}
                      </Badge>
                    </div>
                    <div className="min-h-0 flex-1 basis-0">
                      {tunings.length === 0 ? (
                        <div className="grid h-full place-items-center px-4 text-center text-[12px] text-faint">
                          {t("common.empty.none")}
                        </div>
                      ) : (
                        <VirtualList
                          items={tunings}
                          itemHeight={48}
                          render={(name) => (
                            <div className="ide-row pointer-events-none">
                              <span className="w-full truncate">{name}</span>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col">
                    <div className="ide-panel-head shrink-0">
                      {t("merge.additions.newMappings")}
                      <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                        {maps.length}
                      </Badge>
                    </div>
                    <div className="min-h-0 flex-1 basis-0">
                      {maps.length === 0 ? (
                        <div className="grid h-full place-items-center px-4 text-center text-[12px] text-faint">
                          {t("common.empty.none")}
                        </div>
                      ) : (
                        <VirtualList
                          items={maps}
                          itemHeight={56}
                          render={(item) => (
                            <div className="ide-row pointer-events-none">
                              <span className="w-full truncate">{item.model}</span>
                              <small className="w-full truncate">→ {item.tuning}</small>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t("merge.confirm.reset.title")}
        body={t("merge.confirm.reset.body")}
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setMain(null);
          setIncoming([]);
          setSearch("");
          setTab("adds");
          onDirty(false);
          setConfirmReset(false);
        }}
      />
    </WorkspaceShell>
  );
});
