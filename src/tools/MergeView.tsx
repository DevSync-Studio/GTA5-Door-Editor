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
        ? `${result.addTunings.length} adds · ${result.conflicts.length} conflicts`
        : incoming.length
          ? `${incoming.length} conflicting`
          : null,
      lastExportAt,
    });
  }, [main, incoming.length, result, lastExportAt, onFooter]);

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
    toast("Could not merge these YMT files. Check they are valid doortuning XML.", true);
  }, [main, incoming, result]);

  useEffect(() => {
    onDirty(!!main || incoming.length > 0);
  }, [main, incoming.length, onDirty]);

  const setMainFile = useCallback((file: NativeFile) => {
    const slot = packSlot(file);
    setMain(slot);
    toast(`Main file · ${slot.name}`, "info");
  }, []);

  const addIncomingFiles = useCallback(
    (files: NativeFile[]) => {
      if (!main) {
        toast("Import the main doortuning .ymt first.", true);
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
            toast(`Skipped ${slot.name} - same as main file.`, true);
            continue;
          }
          if (incoming.some((item) => item.name === slot.name && item.text === slot.text)) {
            toast(`Skipped duplicate ${slot.name}.`, true);
            continue;
          }
          next.push(slot);
        } catch (error) {
          toast(error instanceof Error ? error.message : `Could not read ${file.name}`, true);
        }
      }
      if (next.length === 0) return;
      setIncoming((prev) => [...prev, ...next]);
      toast(
        next.length === 1 ? `Added ${next[0].name}` : `Added ${next.length} conflicting files`,
        "info",
      );
    },
    [incoming, main],
  );

  const loadDropped = useCallback(
    (file: NativeFile) => {
      try {
        if (!main) setMainFile(file);
        else addIncomingFiles([file]);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not import YMT", true);
      }
    },
    [addIncomingFiles, main, setMainFile],
  );

  useNativeDrop(loadDropped, undefined, workspaceActive);

  const pickMain = async () => {
    const file = await openTextFile("Main doortuning .ymt", [
      { title: "YMT / XML", extensions: ["ymt", "xml", "txt"] },
    ]);
    if (!file) return;
    try {
      setMainFile(file);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not import YMT", true);
    }
  };

  const pickIncoming = async () => {
    const file = await openTextFile("Conflicting file (.ymt)", [
      { title: "YMT / XML", extensions: ["ymt", "xml", "txt"] },
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
        "Export merged YMT",
        "doortuning_merged.ymt",
        result.xml,
        [{ title: "YMT", extensions: ["ymt", "xml"] }],
      );
      if (!saved) return;
      setLastExportAt(Date.now());
      toast(
        nothingNew
          ? "Exported - no new entries were added (main already has them)."
          : "Merged YMT exported.",
        "export",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", true);
    }
  };

  const previewSummary = !result
    ? "Adds missing entries. Main file wins on conflicts."
    : hasAdditions
      ? `${result.addTunings.length} tunings · ${result.addMaps.length} mappings · ${result.conflicts.length} conflicts`
      : result.conflicts.length > 0
        ? `Nothing to add · ${result.conflicts.length} conflicts`
        : "Nothing to add - already covered.";

  useWorkspaceActions("merge", workspaceActive, {
    export: () => {
      if (result) void exportMerged();
    },
    unload: () => setConfirmReset(true),
  });

  return (
    <WorkspaceShell
      title="Doortuning Merger"
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
            <Download className="size-3.5" strokeWidth={1.75} />
            Export
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
            Reset
          </Button>
        </>
      }
    >
      <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] divide-x divide-line-soft xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col bg-sidebar/80">
          <div className="ide-panel-head shrink-0">
            Main file
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-md px-3 text-[12px]"
              onClick={() => void pickMain()}
            >
              <Upload className="size-3.5" strokeWidth={1.75} />
              {main ? "Replace" : "Import"}
            </Button>
          </div>

          <div className="shrink-0 border-b border-line-soft px-3 py-3">
            {main ? (
              <div className="rounded-lg border border-line-soft bg-panel/50 px-3 py-3">
                <div className="truncate text-[13px] font-semibold tracking-tight text-bright">
                  {main.name}
                </div>
                <div className="mt-1 font-mono text-[11px] text-faint">
                  {main.tunings} tunings · {main.mappings} mappings
                </div>
                <p className="mt-2 m-0 text-[11px] leading-4 text-faint">
                  Base file - conflicts keep these entries.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void pickMain()}
                className="flex w-full flex-col items-center gap-2.5 rounded-lg border border-dashed border-line-soft bg-panel/30 px-3 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-panel-2/80 text-mint">
                  <Upload className="size-4" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="text-[12px] font-medium text-bright">Import main .ymt</div>
                  <div className="mt-0.5 text-[11px] text-faint">Drop a file or browse</div>
                </div>
              </button>
            )}
          </div>

          <div className="ide-panel-head shrink-0 border-t-0">
            Conflicting files
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
                <span className="leading-none">Add</span>
              </Button>
            </span>
          </div>

          <div className="min-h-0 flex-1 basis-0">
            {!main ? (
              <div className="grid h-full place-items-center px-4 text-center">
                <p className="m-0 text-[12px] leading-5 text-faint">
                  Import the main file first, then add conflicting files here.
                </p>
              </div>
            ) : incoming.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <FilePlus2 className="size-5 text-faint" strokeWidth={1.5} />
                <p className="m-0 max-w-55 text-[12px] leading-5 text-faint">
                  Add one or more conflicting .ymt files to collect missing tunings and mappings.
                </p>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => void pickIncoming()}>
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  Add conflicting file
                </Button>
              </div>
            ) : (
              <VirtualList
                items={incoming}
                itemHeight={64}
                render={(file) => {
                  const status = fileStatus.get(file.id);
                  return (
                    <div className="ide-row-actions">
                      <div className="ide-row-main pointer-events-none">
                        <span className="w-full truncate">{file.name}</span>
                        <small>
                          {status
                            ? status.adds > 0
                              ? `${status.adds} new${status.conflicts ? ` · ${status.conflicts} conflicts` : ""}`
                              : status.conflicts > 0
                                ? `Covered · ${status.conflicts} conflicts`
                                : "Already covered"
                            : `${file.tunings} tunings · ${file.mappings} maps`}
                        </small>
                      </div>
                      <div className="ide-row-btns">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          title={`Remove ${file.name}`}
                          aria-label={`Remove ${file.name}`}
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
                {result ? "Merge preview" : "Preview"}
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
                  Additions
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    tab === "conflicts" ? "bg-primary/20 text-bright" : "text-faint hover:text-muted-foreground",
                  )}
                  onClick={() => setTab("conflicts")}
                >
                  Conflicts
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
                {!main
                  ? "Import your main doortuning on the left to begin."
                  : "Add conflicting files on the left to build the merge preview."}
              </p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-line-soft px-2.5 py-3">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder={tab === "conflicts" ? "Filter conflicts" : "Filter additions"}
                />
              </div>

              {tab === "conflicts" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  {conflicts.length === 0 ? (
                    <div className="grid h-full place-items-center px-4 text-center text-[12px] text-faint">
                      No conflicts
                    </div>
                  ) : (
                    <>
                      <p className="m-0 shrink-0 border-b border-line-soft px-3 py-2 text-[11px] leading-4 text-faint">
                        {nothingNew
                          ? "Main already has these names. Export will not change them."
                          : "Main wins when both files share a tuning name or model mapping."}
                      </p>
                      <div className="grid shrink-0 grid-cols-[minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-3 border-b border-line-soft px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                        <span>Type</span>
                        <span>Name</span>
                        <span>Main</span>
                        <span className="text-warning">Conflicting</span>
                        <span className="text-right">File</span>
                      </div>
                      <div className="min-h-0 flex-1 basis-0">
                        <VirtualList
                          items={conflicts}
                          itemHeight={56}
                          render={(item) => (
                            <div className="grid h-full min-w-0 grid-cols-[minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-3 border-b border-line-soft/70 px-3">
                              <span className="min-w-0 truncate text-[11px] uppercase tracking-wide text-faint">
                                {item.kind === "tuning" ? "Tuning" : "Mapping"}
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
                    No new tunings or mappings to add. Conflicting files are already covered by main.
                  </p>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-line-soft lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <div className="flex min-h-0 flex-col">
                    <div className="ide-panel-head shrink-0">
                      New tunings
                      <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                        {tunings.length}
                      </Badge>
                    </div>
                    <div className="min-h-0 flex-1 basis-0">
                      {tunings.length === 0 ? (
                        <div className="grid h-full place-items-center px-4 text-center text-[12px] text-faint">
                          None
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
                      New mappings
                      <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                        {maps.length}
                      </Badge>
                    </div>
                    <div className="min-h-0 flex-1 basis-0">
                      {maps.length === 0 ? (
                        <div className="grid h-full place-items-center px-4 text-center text-[12px] text-faint">
                          None
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
        title="Reset merger"
        body="Clear the main file, all conflicting files, and the merge preview."
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
