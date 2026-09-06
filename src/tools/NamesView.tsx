import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Download, ListPlus, Plus, Replace, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog, PromptDialog } from "@/components/Dialogs";
import { UnsavedChangesBar } from "@/components/UnsavedChangesBar";
import { toast } from "@/lib/toast";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { VirtualList } from "@/components/VirtualList";
import { useNativeDrop } from "@/hooks/useNativeDrop";
import { useLocale } from "@/hooks/useLocale";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import { nametableBytes, parseNametable } from "@/domain/audio";
import { openTextFile, saveTextFile, saveTextFileAs, backupExisting, fileNameFromPath, type NativeFile } from "@/lib/files";
import { cn } from "@/lib/utils";

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, "_");
}

function sameNameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].map((n) => n.toLowerCase()).sort();
  const right = [...b].map((n) => n.toLowerCase()).sort();
  return left.every((value, index) => value === right[index]);
}

function entriesFromAudioDoors(doorNames: string[]): string[] {
  const out: string[] = [];
  for (const raw of doorNames) {
    const name = normalizeName(raw);
    if (!name || name === "d_") continue;
    out.push(name);
  }
  return [...new Set(out)];
}

export const NamesView = memo(function NamesView({
  onDirty,
  onFooter,
  isActive = true,
  names,
  onNames,
  audioDoorNames = [],
}: {
  onDirty: (dirty: boolean) => void;
  onFooter?: (state: import("@/domain/constants").WorkspaceFooterState) => void;
  isActive?: boolean;
  names: string[];
  onNames: (names: string[]) => void;
  audioDoorNames?: string[];
}) {
  const { t } = useLocale();
  const workspaceActive = isActive;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [promptAdd, setPromptAdd] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [baseline, setBaseline] = useState<string[]>([]);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);

  useEffect(() => {
    if (!onFooter) return;
    onFooter({
      file: importPath
        ? { name: fileNameFromPath(importPath), path: importPath }
        : null,
      format: "nametable",
      counts: names.length ? t("status.counts.names", { count: names.length }) : null,
      lastExportAt,
    });
  }, [importPath, names.length, lastExportAt, onFooter, t]);

  const sorted = useMemo(() => [...names].sort((a, b) => a.localeCompare(b)), [names]);
  const shown = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return sorted;
    return sorted.filter((name) => name.toLowerCase().includes(q));
  }, [sorted, search]);

  const active = selected && names.includes(selected) ? selected : null;
  const formDirty = !!active && draft !== active;
  const listDirty = !sameNameList(names, baseline);
  const sessionDirty = listDirty || formDirty;

  const audioCandidates = useMemo(() => entriesFromAudioDoors(audioDoorNames), [audioDoorNames]);
  const audioNewCount = useMemo(() => {
    const have = new Set(names.map((n) => n.toLowerCase()));
    return audioCandidates.filter((n) => !have.has(n.toLowerCase())).length;
  }, [audioCandidates, names]);

  useEffect(() => {
    setDraft(active ?? "");
  }, [active]);

  useEffect(() => {
    onDirty(sessionDirty);
  }, [sessionDirty, onDirty]);

  const loadFile = useCallback(
    (file: NativeFile) => {
      try {
        const values = parseNametable(file.text).map(normalizeName).filter(Boolean);
        if (values.length === 0) {
          toast(t("names.toast.noneInFile"), true);
          return;
        }
        const next = [...new Set([...names, ...values])];
        onNames(next);
        if (file.path) setImportPath(file.path);
        toast(
          values.length === 1
            ? t("names.toast.importedOne")
            : t("names.toast.importedMany", { count: values.length }),
          "info",
        );
      } catch (error) {
        toast(error instanceof Error ? error.message : t("names.toast.importFailed"), true);
      }
    },
    [names, onNames, t],
  );

  useNativeDrop(loadFile, undefined, workspaceActive);

  const pickImport = async () => {
    const file = await openTextFile(t("names.dialog.import"), [
      { title: t("names.dialog.filter"), extensions: ["dat151.nametable", "nametable", "txt"] },
    ]);
    if (file) loadFile(file);
  };

  const flushNames = (): string[] | null => {
    let next = names;
    if (formDirty) {
      const renamed = applyRename(draft);
      if (!renamed) return null;
      next = renamed;
    }
    return next;
  };

  const addFromAudio = () => {
    if (audioCandidates.length === 0) {
      toast(t("names.toast.saveAudioFirst"), true);
      return;
    }
    const have = new Set(names.map((n) => n.toLowerCase()));
    const fresh = audioCandidates.filter((n) => !have.has(n.toLowerCase()));
    if (fresh.length === 0) {
      toast(t("names.toast.allFromAudio"));
      return;
    }
    onNames([...names, ...fresh]);
    setSearch("");
    setSelected(fresh[0] ?? null);
    toast(
      fresh.length === 1
        ? t("names.toast.addedOneFromAudio")
        : t("names.toast.addedManyFromAudio", { count: fresh.length }),
    );
  };

  const addName = (raw: string) => {
    const name = normalizeName(raw);
    if (!name) {
      toast(t("names.toast.enterName"), true);
      return;
    }
    if (names.some((item) => item.toLowerCase() === name.toLowerCase())) {
      toast(t("names.toast.nameExists"), true);
      return;
    }
    onNames([...names, name]);
    setPromptAdd(false);
    setSearch("");
    setSelected(name);
    toast(t("names.toast.added", { name }));
  };

  const applyRename = (nextDraft: string): string[] | null => {
    if (!active) return names;
    const name = normalizeName(nextDraft);
    if (!name) {
      toast(t("names.toast.nameEmpty"), true);
      return null;
    }
    if (
      names.some(
        (item) => item.toLowerCase() === name.toLowerCase() && item.toLowerCase() !== active.toLowerCase(),
      )
    ) {
      toast(t("names.toast.nameExists"), true);
      return null;
    }
    const next = names.map((item) => (item === active ? name : item));
    onNames(next);
    setSelected(name);
    return next;
  };

  const saveSession = () => {
    let next = names;
    if (formDirty) {
      const renamed = applyRename(draft);
      if (!renamed) return;
      next = renamed;
    }
    setBaseline([...next]);
    toast(t("names.toast.sessionSaved"), "save");
  };

  const discardSession = () => {
    onNames([...baseline]);
    setDraft("");
    setSelected(null);
    toast(t("common.toast.discardedSession"));
  };

  const removeName = (name: string) => {
    onNames(names.filter((item) => item !== name));
    if (selected === name) setSelected(null);
    setConfirmDelete(null);
    toast(t("names.toast.removed"));
  };

  const exportTable = async () => {
    const next = flushNames();
    if (!next) return;
    if (next.length === 0) {
      toast(t("names.toast.needOne"), true);
      return;
    }
    try {
      const saved = await saveTextFileAs(
        t("names.dialog.export"),
        "names.dat151.nametable",
        nametableBytes(next),
        [{ title: t("names.dialog.filter"), extensions: ["dat151.nametable", "nametable", "txt"] }],
      );
      if (!saved) return;
      setBaseline([...next]);
      setLastExportAt(Date.now());
      toast(t("common.toast.exported", { name: saved.name }), "export");
    } catch (error) {
      toast(error instanceof Error ? error.message : t("common.toast.exportFailed"), true);
    }
  };

  const replaceImport = async () => {
    if (!importPath) {
      toast(t("common.toast.noImportToReplace"), true);
      return;
    }
    const next = flushNames();
    if (!next) return;
    if (next.length === 0) {
      toast(t("names.toast.needOne"), true);
      return;
    }
    try {
      const backup = await backupExisting(importPath, "names");
      await saveTextFile(importPath, nametableBytes(next));
      setBaseline([...next]);
      setConfirmReplace(false);
      setLastExportAt(Date.now());
      toast(
        backup ? t("common.toast.importedReplacedBackup") : t("common.toast.importedReplaced"),
        "export",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : t("common.toast.replaceFailed"), true);
    }
  };

  useWorkspaceActions("names", workspaceActive, {
    export: () => void exportTable(),
    unload: () => setConfirmReset(true),
  });

  return (
    <WorkspaceShell
      title={t("names.title")}
      subtitle={importPath ? fileNameFromPath(importPath) : undefined}
      status={sessionDirty ? "unsaved" : null}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={audioCandidates.length === 0}
            title={
              audioCandidates.length === 0
                ? t("names.fromAudio.none")
                : audioNewCount === 0
                  ? t("names.fromAudio.allListed")
                  : t("names.fromAudio.addCount", { count: audioNewCount })
            }
            onClick={addFromAudio}
          >
            <ListPlus className="size-3.5" strokeWidth={1.75} />
            {t("names.fromAudio")}
            {audioNewCount > 0 ? (
              <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px] tabular-nums">
                {audioNewCount}
              </Badge>
            ) : null}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void pickImport()}>
            <Download className="size-3.5" strokeWidth={1.75} />
            {t("names.import")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={names.length === 0 && !formDirty}
            onClick={() => void exportTable()}
          >
            <Upload className="size-3.5" strokeWidth={1.75} />
            {t("names.export")}
          </Button>
          {importPath ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              title={importPath}
              onClick={() => setConfirmReplace(true)}
            >
              <Replace className="size-3.5" strokeWidth={1.75} />
              {t("common.replaceImport")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={names.length === 0 && baseline.length === 0}
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
            {t("common.reset")}
          </Button>
        </>
      }
    >
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] divide-x divide-line-soft xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col bg-sidebar/80">
            <div className="ide-panel-head shrink-0">
              {t("names.panel.names")}
              <span className="flex items-center gap-2 font-normal normal-case tracking-normal">
                <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                  {shown.length}/{names.length}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-3 text-[12px] leading-none [&_svg]:size-3.5"
                  onClick={() => setPromptAdd(true)}
                >
                  <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
                  <span className="leading-none">{t("names.add")}</span>
                </Button>
              </span>
            </div>
            <div className="shrink-0 border-b border-line-soft px-2.5 py-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
                  strokeWidth={1.75}
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("names.search")}
                  className="h-9 rounded-md pl-8"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 basis-0">
              {shown.length === 0 ? (
                <div className="grid h-full place-items-center px-4 text-center">
                  <p className="m-0 text-[12px] leading-5 text-faint">
                    {names.length === 0 ? t("names.empty") : t("names.noMatches")}
                  </p>
                </div>
              ) : (
                <VirtualList
                  items={shown}
                  itemHeight={64}
                  render={(name) => {
                    const isActive = name === active;
                    const subtitle = audioDoorNames.some((d) => d.toLowerCase() === name.toLowerCase())
                      ? t("names.subtitle.fromAudio")
                      : t("names.subtitle.entry");
                    return (
                      <div className={cn("ide-row-actions", isActive && "active")}>
                        <button
                          type="button"
                          className="ide-row-main"
                          onClick={() => {
                            if (formDirty && active !== name) {
                              toast(t("names.toast.saveOrDiscardEdit"), true);
                              return;
                            }
                            setSelected(name);
                          }}
                        >
                          <span className="w-full truncate font-mono">{name}</span>
                          <small>{subtitle}</small>
                        </button>
                        <div className="ide-row-btns">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title={t("names.remove", { name })}
                            aria-label={t("names.remove", { name })}
                            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmDelete(name);
                            }}
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

          <div className="flex min-h-0 min-w-0 flex-col bg-editor">
            {active ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate font-mono text-[14px] font-semibold tracking-tight text-bright">
                        {active}
                      </div>
                      {formDirty ? (
                        <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-warning">
                          {t("common.editingBadge")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">
                      {t("names.detail.hint")}
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-5">
                  <section className="w-full shrink-0 rounded-lg border border-line-soft bg-panel/40 p-4 sm:p-5">
                    <h3 className="mb-1 text-[13px] font-medium tracking-tight text-muted-foreground">{t("names.section.identity")}</h3>
                    <p className="mb-4 m-0 text-[12px] leading-5 text-faint">
                      {t("names.section.identityHint")}
                    </p>
                    <div className="max-w-md">
                      <Label className="mb-1.5 mt-0 text-[11px] font-normal text-faint">{t("names.field.name")}</Label>
                      <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="h-9 font-mono text-[12px]"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveSession();
                        }}
                      />
                      {draft.trim() && normalizeName(draft) !== active ? (
                        <p className="mt-1.5 m-0 font-mono text-[11px] text-faint">
                          {t("names.becomes", { name: normalizeName(draft) })}
                        </p>
                      ) : null}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center px-6 text-center">
                <p className="m-0 text-[13px] leading-6 text-muted-foreground">
                  {t("names.emptyDetail")}
                </p>
              </div>
            )}
          </div>
        </div>

        <UnsavedChangesBar
          open={sessionDirty}
          onReset={discardSession}
          onSave={saveSession}
          description={t("names.unsavedBar.description")}
        />
      </div>

      <PromptDialog
        open={promptAdd}
        title={t("names.prompt.add.title")}
        label={t("names.prompt.add.label")}
        initial=""
        onCancel={() => setPromptAdd(false)}
        onSubmit={addName}
      />
      <ConfirmDialog
        open={confirmReset}
        title={t("names.confirm.reset.title")}
        body={t("names.confirm.reset.body")}
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          onNames([]);
          setBaseline([]);
          setImportPath(null);
          setSelected(null);
          setConfirmReset(false);
        }}
      />
      <ConfirmDialog
        open={confirmReplace}
        title={t("common.dialog.replaceImported.title")}
        body={
          importPath
            ? t("names.confirm.replace.body", { path: importPath })
            : t("names.confirm.replace.noPath")
        }
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => {
          void replaceImport();
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title={t("names.confirm.remove.title")}
        body={t("names.confirm.remove.body", { name: confirmDelete ?? "" })}
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeName(confirmDelete);
        }}
      />
    </WorkspaceShell>
  );
});
