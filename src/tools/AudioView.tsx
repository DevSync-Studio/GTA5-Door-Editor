import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Code2, Download, Plus, Replace, RotateCcw, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { ConfirmDialog } from "@/components/Dialogs";
import { SearchField } from "@/components/SearchField";
import { UnsavedChangesBar } from "@/components/UnsavedChangesBar";
import { toast } from "@/lib/toast";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { VirtualList } from "@/components/VirtualList";
import { useNativeDrop } from "@/hooks/useNativeDrop";
import { useLocale } from "@/hooks/useLocale";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import type { MessageKey } from "@/domain/i18n";
import {
  audioXml,
  matchPresetIndex,
  normalizeDoorName,
  parseAudioCatalog,
  parseDat151,
  type AudioAssignment,
  type AudioDoor,
  type AudioPreset,
} from "@/domain/audio";
import { openTextFile, saveTextFile, saveTextFileAs, backupExisting, fileNameFromPath, type NativeFile } from "@/lib/files";
import { cn } from "@/lib/utils";
import { PresetJsonEditor } from "@/tools/audio/PresetJsonEditor";

function blankAssignment(id: string): AudioAssignment {
  return {
    id,
    name: "",
    preset: "",
    sounds: "",
    tuningParams: "",
    maxOcclusion: "0.7",
  };
}

function newDoorId(): string {
  return `door_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function assignmentEqual(a: AudioAssignment, b: AudioAssignment): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.preset === b.preset &&
    a.sounds === b.sounds &&
    a.tuningParams === b.tuningParams &&
    a.maxOcclusion === b.maxOcclusion
  );
}

type AudioSession = {
  doors: AudioDoor[];
  assignments: AudioAssignment[];
};

function cloneSession(doors: AudioDoor[], assignments: AudioAssignment[]): AudioSession {
  return {
    doors: doors.map((d) => ({ ...d })),
    assignments: assignments.map((a) => ({ ...a })),
  };
}

function sessionEqual(a: AudioSession, b: AudioSession): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function FormCard({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="w-full shrink-0 rounded-lg border border-line-soft bg-panel/40 p-4 sm:p-5">
      <h3 className="mb-1 text-[13px] font-medium tracking-tight text-muted-foreground">{title}</h3>
      {hint ? <p className="mb-4 m-0 text-[12px] leading-5 text-faint">{hint}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label className="mb-1.5 mt-0 text-[11px] font-normal text-faint">{label}</Label>
      {children}
    </div>
  );
}

function presetLabel(
  catalog: AudioPreset[],
  preset: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (!preset) return t("audio.preset.unassigned");
  if (preset === "custom") return t("audio.preset.custom");
  const item = catalog[+preset];
  return item?.name ?? t("audio.preset.fallback");
}

function rematchAssignments(assignments: AudioAssignment[], catalog: AudioPreset[]): AudioAssignment[] {
  return assignments.map((row) => ({
    ...row,
    preset: matchPresetIndex(catalog, row.sounds, row.tuningParams, row.maxOcclusion),
  }));
}

export const AudioView = memo(function AudioView({
  onDirty,
  onFooter,
  isActive = true,
  doors,
  assignments,
  catalog,
  onDoors,
  onAssignments,
  onCatalog,
}: {
  onDirty: (dirty: boolean) => void;
  onFooter?: (state: import("@/domain/constants").WorkspaceFooterState) => void;
  isActive?: boolean;
  doors: AudioDoor[];
  assignments: AudioAssignment[];
  catalog: AudioPreset[];
  onDoors: (doors: AudioDoor[]) => void;
  onAssignments: (assignments: AudioAssignment[]) => void;
  onCatalog: (catalog: AudioPreset[]) => void;
}) {
  const { t } = useLocale();
  const workspaceActive = isActive;
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AudioDoor | null>(null);
  const [draft, setDraft] = useState<AudioAssignment>(() => blankAssignment(""));
  const [baseline, setBaseline] = useState<AudioAssignment>(() => blankAssignment(""));
  const [customName, setCustomName] = useState("");
  const [page, setPage] = useState<"doors" | "presets">("doors");
  const [importPath, setImportPath] = useState<string | null>(null);
  const [session, setSession] = useState<AudioSession | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);

  useEffect(() => {
    if (!onFooter) return;
    onFooter({
      file: importPath
        ? { name: fileNameFromPath(importPath), path: importPath }
        : null,
      format: "REL",
      counts: t("status.counts.doors", { count: doors.length }),
      lastExportAt,
    });
  }, [importPath, doors.length, lastExportAt, onFooter, t]);

  useEffect(() => {
    if (doors.length > 0) return;
    const id = newDoorId();
    const blank = blankAssignment(id);
    const nextDoors = [{ id, label: t("audio.newDoor") }];
    onDoors(nextDoors);
    setSelected(0);
    setDraft(blank);
    setBaseline(blank);
    setSession(cloneSession(nextDoors, []));
  }, [doors.length, onDoors, t]);

  const door = doors[Math.min(selected, Math.max(doors.length - 1, 0))];
  const isCustom = draft.preset === "custom";
  const locked = !!draft.preset && !isCustom;
  const formDirty = !assignmentEqual(draft, baseline);
  const listDirty =
    !!session &&
    !sessionEqual(session, cloneSession(doors, assignments));
  const sessionDirty = formDirty || listDirty;

  useEffect(() => {
    onDirty(sessionDirty);
  }, [sessionDirty, onDirty]);
  
  useEffect(() => {
    if (!door) return;
    const current = assignments.find((row) => row.id === door.id) ?? blankAssignment(door.id);
    setDraft(current);
    setBaseline(current);
    setCustomName("");
  }, [door?.id]);

  const shown = useMemo(
    () =>
      doors.filter((item) => {
        const assigned = assignments.find((row) => row.id === item.id);
        const name = (assigned?.name || t("audio.newDoor")).toLowerCase();
        return (
          (!search || name.includes(search.toLowerCase())) &&
          (filter === "all" ||
            (filter === "assigned" && !!assigned) ||
            (filter === "unassigned" && !assigned))
        );
      }),
    [doors, assignments, search, filter, t],
  );

  const commitDraft = (): AudioAssignment[] | null => {
    if (!door) return assignments;
    if (!formDirty) return assignments;
    const saved: AudioAssignment = {
      id: door.id,
      name: normalizeDoorName(draft.name),
      preset: draft.preset,
      sounds: draft.sounds.trim(),
      tuningParams: draft.tuningParams.trim(),
      maxOcclusion: draft.maxOcclusion.trim(),
    };
    if (saved.name === "d_" || !saved.sounds || !saved.tuningParams) {
      toast(t("audio.toast.requiredFields"), true);
      return null;
    }
    const next = assignments.filter((item) => item.id !== door.id).concat(saved);
    onAssignments(next);
    setDraft(saved);
    setBaseline(saved);
    return next;
  };

  const loadDat151 = useCallback(
    (file: NativeFile) => {
      try {
        const entries = parseDat151(file.text);
        const nextDoors: AudioDoor[] = [];
        const nextAssignments: AudioAssignment[] = [];
        for (const entry of entries) {
          const id = newDoorId();
          nextDoors.push({ id, label: entry.name });
          nextAssignments.push({
            id,
            name: entry.name,
            preset: matchPresetIndex(
              catalog,
              entry.sounds,
              entry.tuningParams,
              entry.maxOcclusion,
            ),
            sounds: entry.sounds,
            tuningParams: entry.tuningParams,
            maxOcclusion: entry.maxOcclusion,
          });
        }
        onDoors(nextDoors);
        onAssignments(nextAssignments);
        setImportPath(file.path || null);
        setSelected(0);
        const first = nextAssignments[0]!;
        setDraft(first);
        setBaseline(first);
        setCustomName("");
        setSession(cloneSession(nextDoors, nextAssignments));
        toast(
          entries.length === 1
            ? t("audio.toast.importedOne")
            : t("audio.toast.importedMany", { count: entries.length }),
          "info",
        );
      } catch (error) {
        toast(error instanceof Error ? error.message : t("audio.toast.importFailed"), true);
      }
    },
    [catalog, onDoors, onAssignments, t],
  );

  const addDoor = () => {
    const id = newDoorId();
    const blank = blankAssignment(id);
    onDoors([...doors, { id, label: t("audio.newDoor") }]);
    setSelected(doors.length);
    setDraft(blank);
    setBaseline(blank);
    setCustomName("");
  };

  const selectDoor = (index: number) => {
    if (formDirty) {
      toast(t("audio.toast.saveBeforeSwitch"), true);
      return;
    }
    setSelected(index);
  };

  const discardSession = () => {
    if (!session) {
      setDraft(baseline);
      setCustomName("");
      return;
    }
    onDoors(session.doors.map((d) => ({ ...d })));
    onAssignments(session.assignments.map((a) => ({ ...a })));
    const id = session.doors[Math.min(selected, Math.max(session.doors.length - 1, 0))]?.id;
    const current =
      (id && session.assignments.find((row) => row.id === id)) ||
      (id ? blankAssignment(id) : blankAssignment(""));
    setDraft(current);
    setBaseline(current);
    setCustomName("");
    toast(t("common.toast.discardedSession"));
  };

  const saveSession = () => {
    const nextAssignments = commitDraft();
    if (!nextAssignments) return;
    setSession(cloneSession(doors, nextAssignments));
    toast(t("common.toast.sessionSavedExport"), "save");
  };

  const buildExportXml = (rows: AudioAssignment[]) =>
    audioXml(
      rows.map((item) => ({
        name: item.name,
        sounds: item.sounds,
        tuningParams: item.tuningParams,
        maxOcclusion: item.maxOcclusion,
      })),
    );

  const exportRel = async () => {
    const nextAssignments = commitDraft();
    if (!nextAssignments) return;
    if (nextAssignments.length === 0) {
      toast(t("audio.toast.saveBeforeExport"), true);
      return;
    }
    if (nextAssignments.length !== doors.length) {
      toast(t("audio.toast.saveEveryDoor"), true);
      return;
    }
    try {
      const saved = await saveTextFileAs(
        t("audio.dialog.export"),
        "game.dat151.rel.xml",
        buildExportXml(nextAssignments),
        [{ title: t("audio.dialog.filterRel"), extensions: ["xml"] }],
      );
      if (!saved) return;
      setSession(cloneSession(doors, nextAssignments));
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
    const nextAssignments = commitDraft();
    if (!nextAssignments) return;
    if (nextAssignments.length === 0 || nextAssignments.length !== doors.length) {
      toast(t("audio.toast.saveEveryDoor"), true);
      return;
    }
    try {
      const backup = await backupExisting(importPath, "audio");
      await saveTextFile(importPath, buildExportXml(nextAssignments));
      setSession(cloneSession(doors, nextAssignments));
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

  const saveCustomToCatalog = () => {
    const name = customName.trim();
    if (!name) {
      toast(t("audio.toast.nameCustomFirst"), true);
      return;
    }
    const sounds = draft.sounds.trim();
    const tuningParams = draft.tuningParams.trim();
    const maxOcclusion = draft.maxOcclusion.trim() || "0.7";
    if (!sounds || !tuningParams) {
      toast(t("audio.toast.soundsTuningRequired"), true);
      return;
    }

    const nextPreset: AudioPreset = {
      name,
      Sounds: sounds,
      TuningParams: tuningParams,
      MaxOcclusion: Number.isFinite(Number(maxOcclusion)) ? Number(maxOcclusion) : maxOcclusion,
    };

    const existing = catalog.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
    let nextCatalog: AudioPreset[];
    let presetIndex: number;

    if (existing >= 0) {
      nextCatalog = catalog.map((item, index) => (index === existing ? nextPreset : item));
      presetIndex = existing;
      toast(t("audio.toast.presetUpdated", { name }));
    } else {
      nextCatalog = [...catalog, nextPreset];
      presetIndex = catalog.length;
      toast(t("audio.toast.presetAdded", { name }));
    }

    onCatalog(nextCatalog);
    const nextDraft = {
      ...draft,
      preset: String(presetIndex),
      sounds,
      tuningParams,
      maxOcclusion,
    };
    setDraft(nextDraft);
    setCustomName("");
  };

  const applyCatalog = (next: AudioPreset[]) => {
    onCatalog(next);
    const rematched = rematchAssignments(assignments, next);
    onAssignments(rematched);
    if (session) {
      setSession(cloneSession(doors, rematched));
    }
    if (door) {
      const current = rematched.find((row) => row.id === door.id);
      if (current) {
        setDraft(current);
        setBaseline(current);
      } else if (draft.preset && draft.preset !== "custom") {
        const rematchedDraft = {
          ...draft,
          preset: matchPresetIndex(next, draft.sounds, draft.tuningParams, draft.maxOcclusion),
        };
        setDraft(rematchedDraft);
      }
    }
    setPage("doors");
    toast(t("audio.toast.presetsApplied", { count: next.length }));
  };

  const loadDropped = (file: NativeFile) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".json")) {
      try {
        applyCatalog(parseAudioCatalog(file.text));
      } catch (error) {
        toast(error instanceof Error ? error.message : t("audio.toast.invalidPresetsJson"), true);
      }
      return;
    }
    if (lower.endsWith(".xml") || /Dat151/i.test(file.text)) {
      loadDat151(file);
      return;
    }
    toast(t("audio.toast.dropHint"), true);
  };

  useNativeDrop(loadDropped, undefined, workspaceActive);

  const removeDoor = (item: AudioDoor) => {
    const index = doors.indexOf(item);
    const nextDoors = doors.filter((d) => d.id !== item.id);
    const nextAssignments = assignments.filter((a) => a.id !== item.id);
    onDoors(nextDoors);
    onAssignments(nextAssignments);
    setSelected((current) => {
      if (nextDoors.length === 0) return 0;
      if (current > index) return current - 1;
      if (current === index) return Math.min(index, nextDoors.length - 1);
      return current;
    });
    toast(t("audio.toast.doorRemoved"));
  };

  const displayName = draft.name.replace(/^d_/, "") || t("audio.newDoor");
  const doorNameInput = draft.name.replace(/^d_/, "");

  const openPresetsPage = () => {
    if (formDirty) {
      toast(t("audio.toast.saveBeforePresets"), true);
      return;
    }
    setPage("presets");
  };

  useWorkspaceActions("audio", workspaceActive && page === "doors", {
    export: () => void exportRel(),
    unload: () => setConfirmReset(true),
  });

  return (
    <WorkspaceShell
      title={page === "presets" ? t("audio.presetsTitle") : t("audio.title")}
      subtitle={
        page === "presets"
          ? undefined
          : importPath
            ? fileNameFromPath(importPath)
            : undefined
      }
      status={page === "doors" && sessionDirty ? "unsaved" : null}
      actions={
        page === "presets" ? null : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                const file = await openTextFile(t("audio.dialog.import"), [
                  { title: t("audio.dialog.filterRel"), extensions: ["xml"] },
                ]);
                if (file) loadDat151(file);
              }}
            >
              <Download className="size-3.5" strokeWidth={1.75} />
              {t("audio.importRel")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => void exportRel()}
            >
              <Upload className="size-3.5" strokeWidth={1.75} />
              {t("audio.exportRel")}
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
              onClick={openPresetsPage}
            >
              <Code2 className="size-3.5" strokeWidth={1.75} />
              {t("audio.editPresets")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
              {t("audio.reset")}
            </Button>
          </>
        )
      }
    >
      {page === "presets" ? (
        <PresetJsonEditor
          catalog={catalog}
          onBack={() => setPage("doors")}
          onApply={applyCatalog}
        />
      ) : (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] divide-x divide-line-soft xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col bg-sidebar/80">
            <div className="ide-panel-head shrink-0">
              {t("audio.panel.doors")}
              <span className="flex items-center gap-2 font-normal normal-case tracking-normal">
                <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                  {shown.length}/{doors.length || 1}
                </Badge>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-3 text-[12px] leading-none [&_svg]:size-3.5"
                  onClick={addDoor}
                >
                  <Plus className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  <span className="leading-none">{t("audio.addDoor")}</span>
                </Button>
              </span>
            </div>
            <div className="flex shrink-0 flex-col gap-2.5 border-b border-line-soft px-2.5 py-3">
              <SearchField placeholder={t("audio.search")} value={search} onChange={setSearch} />
              <SimpleSelect
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: "all", label: t("audio.filter.all") },
                  { value: "assigned", label: t("audio.filter.assigned") },
                  { value: "unassigned", label: t("audio.filter.unassigned") },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 basis-0">
              <VirtualList
                items={shown}
                itemHeight={64}
                render={(item) => {
                  const index = doors.indexOf(item);
                  const assigned = assignments.find((row) => row.id === item.id);
                  const active = index === selected;
                  const deleteName = assigned?.name || t("audio.deleteDoorFallback");
                  return (
                    <div className={cn("ide-row-actions", active && "active")}>
                      <button
                        type="button"
                        className="ide-row-main"
                        onClick={() => selectDoor(index)}
                      >
                        <span className="w-full truncate">{assigned?.name || t("audio.newDoor")}</span>
                        <small>{presetLabel(catalog, assigned?.preset ?? "", t)}</small>
                      </button>
                      <div className="ide-row-btns">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          title={t("audio.deleteDoor", { name: deleteName })}
                          aria-label={t("audio.deleteDoor", { name: deleteName })}
                          className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmDelete(item);
                          }}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                        </Button>
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col bg-editor">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-[14px] font-semibold tracking-tight text-bright">
                    {displayName}
                  </div>
                  {formDirty ? (
                    <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-warning">
                      {t("common.editingBadge")}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[11px] text-faint">
                  {t("audio.detail.hint")}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-5">
              <FormCard
                title={t("audio.section.identity")}
                hint={t("audio.section.identityHint")}
              >
                <div className="max-w-md">
                  <Field label={t("audio.field.doorName")}>
                    <Input
                      placeholder={t("audio.placeholder.doorName")}
                      value={doorNameInput}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  {doorNameInput.trim() ? (
                    <p className="mt-1.5 m-0 font-mono text-[11px] text-faint">
                      {t("audio.relName", { name: normalizeDoorName(draft.name) || "d_..." })}
                    </p>
                  ) : null}
                </div>
              </FormCard>

              <FormCard
                title={t("audio.section.preset")}
                hint={
                  isCustom
                    ? t("audio.section.presetHintCustom")
                    : t("audio.section.presetHint")
                }
              >
                <div className="flex max-w-xl flex-col gap-3">
                  <Field label={t("audio.field.audioPreset")}>
                    <SimpleSelect
                      value={draft.preset || "none"}
                      placeholder={t("audio.choosePreset")}
                      onValueChange={(preset) => {
                        const next = preset === "none" ? "" : preset;
                        if (next !== "" && next !== "custom") {
                          const item = catalog[+next];
                          setDraft({
                            ...draft,
                            preset: next,
                            sounds: item.Sounds,
                            tuningParams: item.TuningParams,
                            maxOcclusion: String(item.MaxOcclusion),
                          });
                          setCustomName("");
                        } else {
                          setDraft({ ...draft, preset: next });
                          if (next !== "custom") setCustomName("");
                        }
                      }}
                      options={[
                        { value: "none", label: t("audio.choosePreset") },
                        ...catalog.map((item, index) => ({
                          value: String(index),
                          label: item.name,
                        })),
                        { value: "custom", label: t("audio.preset.custom") },
                      ]}
                    />
                  </Field>

                  {isCustom ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <Field label={t("audio.field.customPresetName")} className="min-w-0 flex-1">
                        <Input
                          placeholder={t("audio.placeholder.customPreset")}
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className="h-9 text-[12px]"
                        />
                      </Field>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 shrink-0 gap-1.5"
                        onClick={saveCustomToCatalog}
                      >
                        {t("audio.saveToPresets")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </FormCard>

              <FormCard
                title={t("audio.section.parameters")}
                hint={
                  locked
                    ? t("audio.section.parametersLocked")
                    : t("audio.section.parametersEditable")
                }
              >
                <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("audio.field.sounds")}>
                    <Input
                      readOnly={locked}
                      value={draft.sounds}
                      onChange={(e) => setDraft({ ...draft, sounds: e.target.value })}
                      className={cn("h-9 font-mono text-[12px]", locked && "opacity-70")}
                    />
                  </Field>
                  <Field label={t("audio.field.tuningParams")}>
                    <Input
                      readOnly={locked}
                      value={draft.tuningParams}
                      onChange={(e) => setDraft({ ...draft, tuningParams: e.target.value })}
                      className={cn("h-9 font-mono text-[12px]", locked && "opacity-70")}
                    />
                  </Field>
                  <Field label={t("audio.field.maxOcclusion")} className="sm:col-span-1">
                    <Input
                      readOnly={locked}
                      value={draft.maxOcclusion}
                      onChange={(e) => setDraft({ ...draft, maxOcclusion: e.target.value })}
                      className={cn(
                        "h-9 max-w-35 font-mono text-[12px] tabular-nums",
                        locked && "opacity-70",
                      )}
                    />
                  </Field>
                </div>
              </FormCard>
            </div>
          </div>
        </div>

        <UnsavedChangesBar
          open={sessionDirty}
          onReset={discardSession}
          onSave={saveSession}
          description={t("audio.unsavedBar.description")}
        />
      </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        title={t("audio.confirm.reset.title")}
        body={t("audio.confirm.reset.body")}
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          onDoors([]);
          onAssignments([]);
          setImportPath(null);
          setSession(null);
          setConfirmReset(false);
          setPage("doors");
        }}
      />
      <ConfirmDialog
        open={confirmReplace}
        title={t("common.dialog.replaceImported.title")}
        body={
          importPath
            ? t("audio.confirm.replace.body", { path: importPath })
            : t("audio.confirm.replace.noPath")
        }
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => {
          void replaceImport();
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title={t("audio.confirm.remove.title")}
        body={t("audio.confirm.remove.body", {
          name:
            assignments.find((a) => a.id === confirmDelete?.id)?.name ||
            t("audio.confirm.remove.thisDoor"),
        })}
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeDoor(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </WorkspaceShell>
  );
});
