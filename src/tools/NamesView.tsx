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

/** Only the door settings names - link (`dasl_...`) names are added automatically on export. */
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
      counts: names.length ? `${names.length} names` : null,
      lastExportAt,
    });
  }, [importPath, names.length, lastExportAt, onFooter]);

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
          toast("No names found in that file.", true);
          return;
        }
        const next = [...new Set([...names, ...values])];
        onNames(next);
        if (file.path) setImportPath(file.path);
        toast(values.length === 1 ? "Imported 1 name" : `Imported ${values.length} names`, "info");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not import nametable", true);
      }
    },
    [names, onNames],
  );

  useNativeDrop(loadFile, undefined, workspaceActive);

  const pickImport = async () => {
    const file = await openTextFile("Import nametable", [
      { title: "Nametable", extensions: ["nametable", "txt"] },
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
      toast("Save at least one door in Audio first.", true);
      return;
    }
    const have = new Set(names.map((n) => n.toLowerCase()));
    const fresh = audioCandidates.filter((n) => !have.has(n.toLowerCase()));
    if (fresh.length === 0) {
      toast("All Audio door names are already in the nametable.");
      return;
    }
    onNames([...names, ...fresh]);
    setSearch("");
    setSelected(fresh[0] ?? null);
    toast(fresh.length === 1 ? "Added 1 name from Audio" : `Added ${fresh.length} names from Audio`);
  };

  const addName = (raw: string) => {
    const name = normalizeName(raw);
    if (!name) {
      toast("Enter a name.", true);
      return;
    }
    if (names.some((item) => item.toLowerCase() === name.toLowerCase())) {
      toast("That name already exists.", true);
      return;
    }
    onNames([...names, name]);
    setPromptAdd(false);
    setSearch("");
    setSelected(name);
    toast(`Added ${name}`);
  };

  const applyRename = (nextDraft: string): string[] | null => {
    if (!active) return names;
    const name = normalizeName(nextDraft);
    if (!name) {
      toast("Name can't be empty.", true);
      return null;
    }
    if (
      names.some(
        (item) => item.toLowerCase() === name.toLowerCase() && item.toLowerCase() !== active.toLowerCase(),
      )
    ) {
      toast("That name already exists.", true);
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
    toast("Session saved - Export or Replace import to write a file.", "save");
  };

  const discardSession = () => {
    onNames([...baseline]);
    setDraft("");
    setSelected(null);
    toast("Discarded session changes");
  };

  const removeName = (name: string) => {
    onNames(names.filter((item) => item !== name));
    if (selected === name) setSelected(null);
    setConfirmDelete(null);
    toast("Name removed");
  };

  const exportTable = async () => {
    const next = flushNames();
    if (!next) return;
    if (next.length === 0) {
      toast("Add or import at least one name first.", true);
      return;
    }
    try {
      const saved = await saveTextFileAs(
        "Export nametable",
        "names.nametable",
        nametableBytes(next),
        [{ title: "Nametable", extensions: ["nametable", "txt"] }],
      );
      if (!saved) return;
      setBaseline([...next]);
      setLastExportAt(Date.now());
      toast(`Exported ${saved.name}`, "export");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Export failed", true);
    }
  };

  const replaceImport = async () => {
    if (!importPath) {
      toast("No imported file to replace - use Export instead.", true);
      return;
    }
    const next = flushNames();
    if (!next) return;
    if (next.length === 0) {
      toast("Add or import at least one name first.", true);
      return;
    }
    try {
      const backup = await backupExisting(importPath, "names");
      await saveTextFile(importPath, nametableBytes(next));
      setBaseline([...next]);
      setConfirmReplace(false);
      setLastExportAt(Date.now());
      toast(backup ? "Imported file replaced (backup created)" : "Imported file replaced", "export");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Replace failed", true);
    }
  };

  useWorkspaceActions("names", workspaceActive, {
    export: () => void exportTable(),
    unload: () => setConfirmReset(true),
  });

  return (
    <WorkspaceShell
      title="Nametable"
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
                ? "Save doors in Audio first"
                : audioNewCount === 0
                  ? "All Audio names already listed"
                  : `Add ${audioNewCount} new name(s) from Audio`
            }
            onClick={addFromAudio}
          >
            <ListPlus className="size-3.5" strokeWidth={1.75} />
            From Audio
            {audioNewCount > 0 ? (
              <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px] tabular-nums">
                {audioNewCount}
              </Badge>
            ) : null}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void pickImport()}>
            <Upload className="size-3.5" strokeWidth={1.75} />
            Import
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={names.length === 0 && !formDirty}
            onClick={() => void exportTable()}
          >
            <Download className="size-3.5" strokeWidth={1.75} />
            Export
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
              Replace import
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
            Reset
          </Button>
        </>
      }
    >
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] divide-x divide-line-soft xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col bg-sidebar/80">
            <div className="ide-panel-head shrink-0">
              Names
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
                  <span className="leading-none">Add</span>
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
                  placeholder="Search names"
                  className="h-9 rounded-md pl-8"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 basis-0">
              {shown.length === 0 ? (
                <div className="grid h-full place-items-center px-4 text-center">
                  <p className="m-0 text-[12px] leading-5 text-faint">
                    {names.length === 0 ? "No names yet." : "No matches."}
                  </p>
                </div>
              ) : (
                <VirtualList
                  items={shown}
                  itemHeight={64}
                  render={(name) => {
                    const isActive = name === active;
                    const subtitle = audioDoorNames.some((d) => d.toLowerCase() === name.toLowerCase())
                      ? "from Audio"
                      : "nametable entry";
                    return (
                      <div className={cn("ide-row-actions", isActive && "active")}>
                        <button
                          type="button"
                          className="ide-row-main"
                          onClick={() => {
                            if (formDirty && active !== name) {
                              toast("Save or discard the current edit first.", true);
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
                            title={`Remove ${name}`}
                            aria-label={`Remove ${name}`}
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
                          Editing
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">
                      Rename this entry - spaces become underscores
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-5">
                  <section className="w-full shrink-0 rounded-lg border border-line-soft bg-panel/40 p-4 sm:p-5">
                    <h3 className="mb-1 text-[13px] font-medium tracking-tight text-muted-foreground">Identity</h3>
                    <p className="mb-4 m-0 text-[12px] leading-5 text-faint">
                      Name kept in this session. Export / Replace import writes the .nametable (including auto dasl_ links).
                    </p>
                    <div className="max-w-md">
                      <Label className="mb-1.5 mt-0 text-[11px] font-normal text-faint">Name</Label>
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
                          Becomes: {normalizeName(draft)}
                        </p>
                      ) : null}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center px-6 text-center">
                <p className="m-0 text-[13px] leading-6 text-muted-foreground">
                  Select a name to edit, or use Add / From Audio / Import above.
                </p>
              </div>
            )}
          </div>
        </div>

        <UnsavedChangesBar
          open={sessionDirty}
          onReset={discardSession}
          onSave={saveSession}
          description="Save keeps edits in this session only. Export or Replace import writes a file."
        />
      </div>

      <PromptDialog
        open={promptAdd}
        title="Add name"
        label="Name"
        initial=""
        onCancel={() => setPromptAdd(false)}
        onSubmit={addName}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset nametable"
        body="Clear all names from this nametable."
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
        title="Replace imported file"
        body={
          importPath
            ? `Overwrite the imported nametable on disk?\n${importPath}`
            : "No import path."
        }
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => {
          void replaceImport();
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove name"
        body={`Remove ${confirmDelete}?`}
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeName(confirmDelete);
        }}
      />
    </WorkspaceShell>
  );
});
