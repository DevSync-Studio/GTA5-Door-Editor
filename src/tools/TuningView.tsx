import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef, memo, type ChangeEvent, type DragEvent } from "react";
import { ArrowRight, ChevronDown, Copy, Download, ExternalLink, FileMinus, Package, Plus, Replace, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, PromptDialog } from "@/components/Dialogs";
import { SearchField } from "@/components/SearchField";
import { UnsavedChangesBar } from "@/components/UnsavedChangesBar";
import { toast } from "@/lib/toast";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { VirtualList } from "@/components/VirtualList";
import { useNativeDrop, useNativeDragHighlight } from "@/hooks/useNativeDrop";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import { useLocale } from "@/hooks/useLocale";
import vanillaDoortuningXml from "@/assets/vanilla/doortuning.ymt?raw";
import {
  appendTuning,
  duplicateTuning,
  newTuningItem,
  parseTuning,
  removeDoorMapping,
  removeTuning,
  renameDoorModel,
  renameTuning,
  setDoorMapping,
  updateTriggerBox,
  updateTuningValues,
  type DoorMapping,
  type TuningDocument,
  type TuningEntry,
} from "@/domain/tuning";
import {
  fxManifestForResource,
  gta5MetaForResource,
  sanitizeResourceName,
} from "@/domain/fivemResource";
import {
  backupExisting,
  joinPath,
  openTextFile,
  pickDirectory,
  saveTextFile,
  saveTextFileAs,
  type NativeFile,
} from "@/lib/files";
import { setPreviewTuningSource } from "@/domain/previewTuning";
import { cn } from "@/lib/utils";
import {
  AutoOpenVolumeSection,
  FlagsDirectionSection,
  OptionsSection,
  PhysicsSection,
  TriggerBoxSection,
} from "@/tools/tuning/TuneFormSections";

type Prompt =
  | { kind: "addTune" }
  | { kind: "dupTune"; name: string }
  | { kind: "renameTune"; name: string }
  | { kind: "addDoor" }
  | { kind: "exportResource" }
  | null;

type EditorHandle = {
  isDirty: () => boolean;
  reset: () => void;
  flush: () => string | null;
};


type TuningFileExtension = ".ymt" | ".ymt.pso.xml" | ".xml";

interface TuningFilePayload {
  name: string;
  text: string;
  extension: TuningFileExtension;
}

const TUNING_FILE_EXTENSIONS = [".ymt.pso.xml", ".ymt", ".xml"] as const satisfies readonly TuningFileExtension[];
const TUNING_FILE_ACCEPT = ".ymt,.ymt.pso.xml,.xml";

function getTuningExtension(fileName: string): TuningFileExtension | null {
  const lower = fileName.toLowerCase();
  for (const ext of TUNING_FILE_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

function isTuningFileName(fileName: string): boolean {
  return getTuningExtension(fileName) !== null;
}

async function readBrowserTuningFile(file: File): Promise<TuningFilePayload> {
  const extension = getTuningExtension(file.name);
  if (!extension) {
    throw new Error("unsupported");
  }
  const text = await file.text();
  return { name: file.name, text, extension };
}

interface TuningDropZoneProps {
  onFile: (file: NativeFile) => void;
  onStartFresh: () => void;
}

function TuningDropZone({
  onFile,
  onStartFresh,
  isActive = true,
}: TuningDropZoneProps & { isActive?: boolean }) {
  const { t } = useLocale();
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, []);

  const hasFilePayload = (types: readonly string[] | DOMStringList): boolean => {
    const list = Array.from(types as ArrayLike<string>);
    return list.includes("Files") || list.includes("application/x-moz-file");
  };

  const ingestPayload = useCallback(
    (payload: TuningFilePayload) => {
      onFile({
        path: "",
        name: payload.name,
        text: payload.text,
      });
    },
    [onFile],
  );

  useNativeDragHighlight(isActive, setIsDragging);
  useEffect(() => {
    if (!isActive) resetDrag();
  }, [isActive, resetDrag]);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current += 1;
      if (hasFilePayload(event.dataTransfer.types)) {
        setIsDragging(true);
      }
    },
    [],
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasFilePayload(event.dataTransfer.types)) return;
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      resetDrag();

      const file = event.dataTransfer.files.item(0);
      if (!file) return;

      if (!isTuningFileName(file.name)) {
        toast(t("tuning.drop.unsupported"), true);
        return;
      }

      try {
        ingestPayload(await readBrowserTuningFile(file));
      } catch (error) {
        const message =
          error instanceof Error && error.message === "unsupported"
            ? t("tuning.drop.unsupported")
            : error instanceof Error
              ? error.message
              : t("common.toast.couldNotReadFile");
        toast(message, true);
      }
    },
    [ingestPayload, resetDrag, t],
  );

  const handleInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.item(0);
      event.target.value = "";
      if (!file) return;

      if (!isTuningFileName(file.name)) {
        toast(t("tuning.drop.unsupported"), true);
        return;
      }

      try {
        ingestPayload(await readBrowserTuningFile(file));
      } catch (error) {
        const message =
          error instanceof Error && error.message === "unsupported"
            ? t("tuning.drop.unsupported")
            : error instanceof Error
              ? error.message
              : t("common.toast.couldNotReadFile");
        toast(message, true);
      }
    },
    [ingestPayload, t],
  );

  return (
    <div
      className="flex h-full min-h-0 items-center justify-center p-6 sm:p-8 lg:p-10"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex w-full max-w-4xl flex-col gap-4 sm:gap-5">
        <div
          role="region"
          aria-label={t("tuning.drop.aria")}
          aria-dropeffect={isDragging ? "copy" : "none"}
          className={cn(
            "flex min-h-[16rem] flex-col items-center justify-center gap-4 rounded-xl border px-8 py-10 text-center transition-[border-color,border-style,background-color,box-shadow] duration-150 sm:min-h-[18rem] sm:gap-5 sm:px-12",
            isDragging
              ? "border-solid border-primary bg-primary/10 shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent),0_0_24px_color-mix(in_oklch,var(--primary)_22%,transparent)]"
              : "border-dashed border-line bg-transparent shadow-none",
          )}
        >
          <Download
            className={cn(
              "size-7 transition-colors duration-150 sm:size-8",
              isDragging ? "text-primary" : "text-faint",
            )}
            strokeWidth={1.75}
            aria-hidden
          />

          <div className="space-y-1.5">
            <p className="m-0 text-[15px] text-bright sm:text-[16px]">
              {t("tuning.drop.headline")}
            </p>
            <p className="m-0 text-[12px] text-muted-foreground sm:text-[13px]">
              {t("tuning.drop.formats")}
            </p>
          </div>

          <div className="flex w-full max-w-56 items-center gap-2.5 py-0.5">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[12px] text-faint">{t("common.or")}</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="border-line bg-panel-2/60 text-bright hover:border-primary hover:bg-primary hover:text-primary-foreground active:bg-primary/85 active:border-primary/85"
            onClick={() => {
              void (async () => {
                try {
                  const file = await openTextFile(t("tuning.dialog.open"), [
                    { title: t("tuning.dialog.filterYmt"), extensions: ["ymt", "xml"] },
                  ]);
                  if (file) onFile(file);
                  return;
                } catch {
                  /* Native dialog unavailable (browser) - fall through to HTML picker. */
                }
                inputRef.current?.click();
              })();
            }}
          >
            {t("common.browseFiles")}
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept={TUNING_FILE_ACCEPT}
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line-soft bg-panel/30 px-8 py-8 text-center sm:px-12">
          <div className="space-y-1.5">
            <p className="m-0 text-[15px] text-bright sm:text-[16px]">{t("tuning.fresh.headline")}</p>
            <p className="m-0 max-w-md text-[12px] leading-5 text-muted-foreground sm:text-[13px]">
              {t("tuning.fresh.body")}
            </p>
          </div>
          <Button type="button" size="lg" onClick={onStartFresh}>
            {t("tuning.fresh.cta")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const TuningView = memo(function TuningView(props: {
  onDirty: (dirty: boolean) => void;
  onFooter?: (state: import("@/domain/constants").WorkspaceFooterState) => void;
  isActive?: boolean;
}) {
  const { onDirty, onFooter, isActive = true } = props;
  const { t } = useLocale();
  const workspaceActive = isActive;
  const [path, setPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [baselineXml, setBaselineXml] = useState<string | null>(null);
  const [doc, setDoc] = useState<TuningDocument | null>(null);
  const [active, setActive] = useState<"tuning" | "door">("tuning");
  const [selected, setSelected] = useState(0);
  const [selectedDoor, setSelectedDoor] = useState(0);
  const [tuneSearch, setTuneSearch] = useState("");
  const [doorSearch, setDoorSearch] = useState("");
  const [doorFilter, setDoorFilter] = useState("all");
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => void } | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  const xmlDirty = xml != null && baselineXml != null && xml !== baselineXml;
  const hasUnsaved = formDirty || xmlDirty;

  useEffect(() => {
    onDirty(hasUnsaved);
  }, [hasUnsaved, onDirty]);

  useEffect(() => {
    if (!onFooter) return;
    if (!fileName) {
      onFooter({
        file: null,
        format: null,
        counts: null,
        lastExportAt,
      });
      return;
    }
    const ext = fileName.toLowerCase().endsWith(".xml")
      ? t("status.format.xml")
      : t("status.format.ymt");
    onFooter({
      file: { name: fileName, path: path || null },
      format: ext,
      counts: doc
        ? t("status.counts.tuningsDoors", {
            tunings: doc.tunings.length,
            doors: doc.maps.length,
          })
        : null,
      lastExportAt,
    });
  }, [path, fileName, doc, lastExportAt, onFooter, t]);

  useEffect(() => {
    if (!doc) {
      setPreviewTuningSource(null);
      return;
    }
    setPreviewTuningSource({
      maps: doc.maps.map((m) => ({ model: m.model, tuning: m.tuning })),
      tunings: doc.tunings.map((entry) => ({
        name: entry.name,
        rotationLimitAngle: entry.fields.RotationLimitAngle,
        stdDoorRotDir: entry.fields.StdDoorRotDir,
        autoOpenRate: entry.fields.AutoOpenRate,
        angularVelocityLimit: entry.fields.TorqueAngularVelocityLimit,
        closeRateTaper: entry.fields.AutoOpenCloseRateTaper,
      })),
    });
  }, [doc]);

  const applyXml = (next: string) => {
    setXml(next);
    setDoc(parseTuning(next));
  };

  const loadFile = useCallback(
    (file: NativeFile) => {
      try {
        const parsed = parseTuning(file.text);
        setPath(file.path || null);
        setFileName(file.name);
        setXml(file.text);
        setBaselineXml(file.text);
        setDoc(parsed);
        setActive("tuning");
        setSelected(0);
        setSelectedDoor(0);
        setFormDirty(false);
        toast(t("common.toast.opened", { name: file.name }), "info");
      } catch (error) {
        toast(error instanceof Error ? error.message : t("tuning.toast.importFailed"), true);
      }
    },
    [t],
  );

  const startFresh = useCallback(() => {
    try {
      const parsed = parseTuning(vanillaDoortuningXml);
      setPath(null);
      setFileName("doortuning.ymt");
      setXml(vanillaDoortuningXml);
      setBaselineXml(vanillaDoortuningXml);
      setDoc(parsed);
      setActive("tuning");
      setSelected(0);
      setSelectedDoor(0);
      setFormDirty(false);
      toast(t("tuning.toast.vanillaLoaded"), "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : t("tuning.toast.vanillaFailed"), true);
    }
  }, [t]);

  useNativeDrop(loadFile, undefined, workspaceActive);

  const closeFile = () => {
    setConfirm({
      title: t("common.dialog.unload.title"),
      body: hasUnsaved
        ? t("tuning.confirm.unload.bodyDirty")
        : t("tuning.confirm.unload.bodyClean"),
      run: () => {
        setXml(null);
        setBaselineXml(null);
        setDoc(null);
        setPath(null);
        setFileName(null);
        setFormDirty(false);
        setLastExportAt(null);
        setPreviewTuningSource(null);
      },
    });
  };

  const resetChanges = () => {
    editorRef.current?.reset();
    if (baselineXml) {
      setXml(baselineXml);
      setDoc(parseTuning(baselineXml));
    }
    setFormDirty(false);
  };

  const flushEditor = (): string | null => {
    if (!xml) return null;
    if (editorRef.current?.isDirty()) {
      const flushed = editorRef.current.flush();
      if (!flushed) return null;
      setXml(flushed);
      setDoc(parseTuning(flushed));
      setFormDirty(false);
      return flushed;
    }
    return xml;
  };

  const blockIfFormDirty = (): boolean => {
    if (!formDirty && !editorRef.current?.isDirty()) return false;
    toast(t("common.toast.saveOrDiscardBeforeSwitch"), true);
    return true;
  };

  const saveSession = () => {
    const nextXml = flushEditor();
    if (!nextXml) return;
    setBaselineXml(nextXml);
    toast(t("common.toast.sessionSavedExport"), "save");
  };

  const exportToPath = async (targetPath: string) => {
    const nextXml = flushEditor();
    if (!nextXml) return;
    setSaving(true);
    try {
      const backup = await backupExisting(targetPath, "tuning");
      await saveTextFile(targetPath, nextXml);
      setBaselineXml(nextXml);
      setLastExportAt(Date.now());
      toast(backup ? t("tuning.toast.replacedBackup") : t("tuning.toast.replaced"), "export");
    } catch (error) {
      toast(error instanceof Error ? error.message : t("common.toast.exportFailed"), true);
    } finally {
      setSaving(false);
    }
  };

  const exportAs = async () => {
    const nextXml = flushEditor();
    if (!nextXml) return;
    setSaving(true);
    try {
      const saved = await saveTextFileAs(
        t("tuning.dialog.export"),
        fileName || "doortuning.ymt",
        nextXml,
        [{ title: t("tuning.dialog.filterYmtOnly"), extensions: ["ymt", "xml"] }],
      );
      if (!saved) return;
      setBaselineXml(nextXml);
      setPath(saved.path || null);
      setFileName(saved.name);
      setLastExportAt(Date.now());
      toast(t("common.toast.exported", { name: saved.name }), "export");
    } catch (error) {
      toast(error instanceof Error ? error.message : t("common.toast.exportFailed"), true);
    } finally {
      setSaving(false);
    }
  };

  const exportResourceBundle = async (rawName: string) => {
    const resourceName = sanitizeResourceName(rawName);
    const nextXml = flushEditor();
    if (!nextXml) return;

    const parent = await pickDirectory(t("tuning.dialog.pickResources"));
    if (!parent) return;

    const dest = joinPath(parent, resourceName);
    setSaving(true);
    try {
      await saveTextFile(joinPath(dest, "doortuning.ymt"), nextXml);
      await saveTextFile(joinPath(dest, "gta5.meta"), gta5MetaForResource(resourceName));
      await saveTextFile(joinPath(dest, "fxmanifest.lua"), fxManifestForResource());
      setBaselineXml(nextXml);
      setPath(joinPath(dest, "doortuning.ymt"));
      setFileName("doortuning.ymt");
      setLastExportAt(Date.now());
      toast(t("tuning.toast.resourceExported", { name: resourceName }), "export");
    } catch (error) {
      toast(error instanceof Error ? error.message : t("tuning.toast.resourceFailed"), true);
    } finally {
      setSaving(false);
    }
  };

  const replaceImport = async () => {
    if (!path) {
      toast(t("common.toast.noImportToReplace"), true);
      return;
    }
    setConfirm({
      title: t("common.dialog.replaceImported.title"),
      body: t("tuning.confirm.replace.body", { path }),
      run: () => {
        void exportToPath(path);
      },
    });
  };

  const uniqueTune = (name: string) =>
    !!name && !doc?.tunings.some((item) => item.name.toLowerCase() === name.toLowerCase());

  const tunings = useMemo(() => {
    if (!doc) return [];
    const q = tuneSearch.toLowerCase();
    return doc.tunings.filter((item) => item.name.toLowerCase().includes(q));
  }, [doc, tuneSearch]);

  const doors = useMemo(() => {
    if (!doc) return [];
    const q = doorSearch.toLowerCase();
    return doc.maps.filter(
      (item) =>
        `${item.model} ${item.tuning}`.toLowerCase().includes(q) &&
        (doorFilter === "all" || item.tuning === doorFilter),
    );
  }, [doc, doorSearch, doorFilter]);

  const selectedTune: TuningEntry | undefined = doc?.tunings[selected];
  const selectedMap: DoorMapping | undefined = doc?.maps[selectedDoor];

  useWorkspaceActions("tuning", workspaceActive, {
    export: () => {
      if (doc && xml) void exportAs();
    },
    unload: () => {
      if (doc && xml) closeFile();
    },
  });

  return (
    <WorkspaceShell
      title={t("tuning.title")}
      subtitle={fileName || undefined}
      status={hasUnsaved ? "unsaved" : null}
      actions={
        doc && xml ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={saving}
                >
                  <Upload className="size-3.5" strokeWidth={1.75} />
                  {t("tuning.export")}
                  <ChevronDown className="size-3.5 opacity-70" strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => void exportAs()}
                >
                  <Upload className="size-3.5" strokeWidth={1.75} />
                  {t("tuning.export.ymtOnly")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => setPrompt({ kind: "exportResource" })}
                >
                  <Package className="size-3.5" strokeWidth={1.75} />
                  {t("tuning.export.fivemBundle")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {path ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={saving}
                title={path}
                onClick={() => void replaceImport()}
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
              title={t("common.unloadTitle")}
              onClick={closeFile}
            >
              <FileMinus className="size-3.5" strokeWidth={1.75} />
              {t("common.unload")}
            </Button>
          </>
        ) : undefined
      }
    >
      {!doc || !xml ? (
        <div className="h-full overflow-auto">
          <TuningDropZone onFile={loadFile} onStartFresh={startFresh} isActive={workspaceActive} />
        </div>
      ) : (
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] divide-x divide-line-soft xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col bg-sidebar/80">
              <div className="ide-panel-head shrink-0">
                {t("tuning.panel.tunings")}
                <span className="flex items-center gap-2 font-normal normal-case tracking-normal">
                  <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                    {doc.tunings.length}
                  </Badge>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 rounded-md px-3 text-[12px] leading-none [&_svg]:size-3.5"
                    onClick={() => setPrompt({ kind: "addTune" })}
                  >
                    <Plus className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    <span className="leading-none">{t("tuning.addTuning")}</span>
                  </Button>
                </span>
              </div>
              <div className="shrink-0 border-b border-line-soft px-2.5 py-3">
                <SearchField
                  placeholder={t("tuning.searchTunings")}
                  value={tuneSearch}
                  onChange={setTuneSearch}
                />
              </div>
              <div className="min-h-0 flex-[1.15] basis-0">
                <VirtualList
                  items={tunings}
                  itemHeight={64}
                  render={(item) => {
                    const index = doc.tunings.indexOf(item);
                    const linked = doc.maps.filter((map) => map.tuning === item.name).length;
                    const isActive = active === "tuning" && index === selected;
                    return (
                      <div className={cn("ide-row-actions", isActive && "active")}>
                        <button
                          type="button"
                          className="ide-row-main"
                          onClick={() => {
                            if (blockIfFormDirty()) return;
                            setActive("tuning");
                            setSelected(index);
                          }}
                        >
                          <span className="w-full truncate">{item.name}</span>
                          <small>
                            {linked === 1
                              ? t("tuning.linkedDoors", { count: linked })
                              : t("tuning.linkedDoorsOther", { count: linked })}
                          </small>
                        </button>
                        <div className="ide-row-btns">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title={t("tuning.duplicate", { name: item.name })}
                            aria-label={t("tuning.duplicate", { name: item.name })}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPrompt({ kind: "dupTune", name: item.name });
                            }}
                          >
                            <Copy className="size-3.5" strokeWidth={1.75} />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title={t("tuning.delete", { name: item.name })}
                            aria-label={t("tuning.delete", { name: item.name })}
                            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              const links = doc.maps.filter((map) => map.tuning === item.name);
                              setConfirm({
                                title: t("tuning.confirm.removeTuning.title"),
                                body: links.length
                                  ? t("tuning.confirm.removeTuning.withLinks", {
                                      name: item.name,
                                      count: links.length,
                                    })
                                  : t("tuning.confirm.removeTuning.alone", { name: item.name }),
                                run: () => {
                                  const base = flushEditor();
                                  if (!base) return;
                                  applyXml(
                                    removeTuning(
                                      base,
                                      item.name,
                                      links.map((link) => link.model),
                                    ),
                                  );
                                  setSelected((current) =>
                                    current >= index ? Math.max(0, current - 1) : current,
                                  );
                                  toast(t("tuning.toast.tuningRemoved"));
                                },
                              });
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

              <div className="ide-panel-head shrink-0 border-t border-line-soft">
                {t("tuning.panel.doors")}
                <span className="flex items-center gap-2 font-normal normal-case tracking-normal">
                  <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                    {doc.maps.length}
                  </Badge>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 rounded-md px-3 text-[12px] leading-none [&_svg]:size-3.5"
                    onClick={() => setPrompt({ kind: "addDoor" })}
                  >
                    <Plus className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    <span className="leading-none">{t("tuning.addDoor")}</span>
                  </Button>
                </span>
              </div>
              <div className="flex shrink-0 flex-col gap-2.5 border-b border-line-soft px-2.5 py-3">
                <SearchField
                  placeholder={t("tuning.searchDoors")}
                  value={doorSearch}
                  onChange={setDoorSearch}
                />
                <SimpleSelect
                  value={doorFilter}
                  onValueChange={setDoorFilter}
                  options={[
                    { value: "all", label: t("tuning.filter.allTunings") },
                    ...doc.tunings.map((item) => ({ value: item.name, label: item.name })),
                  ]}
                />
              </div>
              <div className="min-h-0 flex-1 basis-0">
                <VirtualList
                  items={doors}
                  render={(item) => {
                    const index = doc.maps.indexOf(item);
                    return (
                      <button
                        className={cn(
                          "ide-row h-full",
                          active === "door" && index === selectedDoor && "active",
                        )}
                        onClick={() => {
                          if (blockIfFormDirty()) return;
                          setActive("door");
                          setSelectedDoor(index);
                        }}
                      >
                        <span className="w-full truncate">{item.model}</span>
                        <small>
                          <ArrowRight className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                          <span className="min-w-0 truncate">{item.tuning}</span>
                        </small>
                      </button>
                    );
                  }}
                />
              </div>
            </div>

            <div className="min-h-0 overflow-auto bg-editor">
              {active === "door" && selectedMap ? (
                <DoorDetail
                  key={selectedMap.model}
                  ref={editorRef}
                  map={selectedMap}
                  maps={doc.maps}
                  tunings={doc.tunings}
                  xml={xml}
                  onDirtyChange={setFormDirty}
                  onOpenTuning={(name) => {
                    if (blockIfFormDirty()) return;
                    const index = doc.tunings.findIndex((item) => item.name === name);
                    if (index < 0) {
                      toast(t("tuning.toast.tuningMissing"), true);
                      return;
                    }
                    setSelected(index);
                    setActive("tuning");
                  }}
                  onRemove={() =>
                    setConfirm({
                      title: t("tuning.confirm.removeDoor.title"),
                      body: t("tuning.confirm.removeDoor.body", { model: selectedMap.model }),
                      run: () => {
                        const base = flushEditor();
                        if (!base) return;
                        applyXml(removeDoorMapping(base, selectedMap.model));
                        setSelectedDoor(0);
                        toast(t("tuning.toast.doorRemoved"));
                      },
                    })
                  }
                />
              ) : selectedTune ? (
                <TuneDetail
                  key={selectedTune.name}
                  ref={editorRef}
                  entry={selectedTune}
                  xml={xml}
                  linked={doc.maps.filter((map) => map.tuning === selectedTune.name).length}
                  onDirtyChange={setFormDirty}
                  onRename={() => setPrompt({ kind: "renameTune", name: selectedTune.name })}
                  onRemove={() => {
                    const links = doc.maps.filter((map) => map.tuning === selectedTune.name);
                    setConfirm({
                      title: t("tuning.confirm.removeTuning.title"),
                      body: links.length
                        ? t("tuning.confirm.removeTuning.withLinks", {
                            name: selectedTune.name,
                            count: links.length,
                          })
                        : t("tuning.confirm.removeTuning.alone", { name: selectedTune.name }),
                      run: () => {
                        const base = flushEditor();
                        if (!base) return;
                        applyXml(
                          removeTuning(
                            base,
                            selectedTune.name,
                            links.map((link) => link.model),
                          ),
                        );
                        setSelected(0);
                        toast(t("tuning.toast.tuningRemoved"));
                      },
                    });
                  }}
                />
              ) : (
                <div className="grid h-full place-items-center px-6 text-center text-[13px] text-muted-foreground">
                  {t("tuning.emptySelect")}
                </div>
              )}
            </div>
          </div>

          <UnsavedChangesBar
            open={hasUnsaved}
            saving={saving}
            onReset={resetChanges}
            onSave={saveSession}
            description={t("tuning.unsavedBar.description")}
          />
        </div>
      )}

      <PromptDialog
        open={!!prompt}
        title={
          prompt?.kind === "addTune"
            ? t("tuning.prompt.addTune")
            : prompt?.kind === "dupTune"
              ? t("tuning.prompt.dupTune", { name: prompt.name })
              : prompt?.kind === "renameTune"
                ? t("tuning.prompt.renameTune")
                : prompt?.kind === "exportResource"
                  ? t("tuning.prompt.exportResource")
                  : t("tuning.prompt.addDoor")
        }
        label={
          prompt?.kind === "addDoor"
            ? t("tuning.prompt.label.doorModel")
            : prompt?.kind === "exportResource"
              ? t("tuning.prompt.label.resourceFolder")
              : t("tuning.prompt.label.tuningName")
        }
        initial={
          prompt?.kind === "renameTune"
            ? prompt.name
            : prompt?.kind === "exportResource"
              ? "doortuning"
              : ""
        }
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => {
          if (prompt?.kind === "exportResource") {
            setPrompt(null);
            void exportResourceBundle(value);
            return;
          }
          if (!xml || !doc) return;
          const base = flushEditor();
          if (!base) return;
          const name = value.trim();
          try {
            if (prompt?.kind === "addTune") {
              if (!uniqueTune(name)) return toast(t("tuning.toast.uniqueNameRequired"), true);
              const next = appendTuning(base, newTuningItem(name));
              applyXml(next);
              setSelected(parseTuning(next).tunings.findIndex((item) => item.name === name));
              setActive("tuning");
            } else if (prompt?.kind === "dupTune") {
              if (!uniqueTune(name)) return toast(t("tuning.toast.nameExists"), true);
              const next = duplicateTuning(base, prompt.name, name);
              applyXml(next);
              setSelected(parseTuning(next).tunings.findIndex((item) => item.name === name));
              setActive("tuning");
            } else if (prompt?.kind === "renameTune") {
              if (name === prompt.name) return setPrompt(null);
              if (!uniqueTune(name)) return toast(t("tuning.toast.nameExists"), true);
              applyXml(renameTuning(base, prompt.name, name));
              toast(t("tuning.toast.tuningRenamed"));
            } else if (prompt?.kind === "addDoor") {
              if (!name) return toast(t("tuning.toast.modelRequired"), true);
              const tuning = doc.tunings[0]?.name;
              if (!tuning) return toast(t("tuning.toast.addTuningFirst"), true);
              applyXml(setDoorMapping(base, name, tuning));
              setActive("door");
            }
            setPrompt(null);
          } catch (error) {
            toast(error instanceof Error ? error.message : t("common.toast.updateFailed"), true);
          }
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        body={confirm?.body}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      />
    </WorkspaceShell>
  );
});

function isTuningFieldsEqual(a: TuningEntry["fields"], b: TuningEntry["fields"]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isBoxEqual(a: TuningEntry["box"], b: TuningEntry["box"]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const DoorDetail = forwardRef<
  EditorHandle,
  {
    map: DoorMapping;
    maps: DoorMapping[];
    tunings: TuningEntry[];
    xml: string;
    onDirtyChange: (dirty: boolean) => void;
    onOpenTuning: (name: string) => void;
    onRemove: () => void;
  }
>(function DoorDetail({ map, maps, tunings, xml, onDirtyChange, onOpenTuning, onRemove }, ref) {
  const { t } = useLocale();
  const [model, setModel] = useState(map.model);
  const [tuning, setTuning] = useState(map.tuning);

  useEffect(() => {
    setModel(map.model);
    setTuning(map.tuning);
  }, [map.model, map.tuning]);

  const dirty = model !== map.model || tuning !== map.tuning;
  const shared = useMemo(
    () => maps.filter((item) => item.tuning === tuning).length,
    [maps, tuning],
  );
  const tuningExists = tunings.some((item) => item.name === tuning);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => dirty,
      reset: () => {
        setModel(map.model);
        setTuning(map.tuning);
      },
      flush: () => {
        if (!dirty) return null;
        const nextModel = model.trim();
        if (!nextModel) {
          toast(t("tuning.toast.modelRequired"), true);
          return null;
        }
        let next = setDoorMapping(xml, map.model, tuning);
        if (nextModel !== map.model) next = renameDoorModel(next, map.model, nextModel);
        return next;
      },
    }),
    [dirty, map.model, model, t, tuning, xml],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-[14px] font-semibold tracking-tight text-bright">
              {map.model}
            </div>
            {dirty ? (
              <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-warning">
                {t("common.unsavedBadge")}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] text-faint">
            {t("tuning.door.subtitle")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!tuningExists}
            title={
              tuningExists
                ? t("tuning.door.openTuningTitle", { name: tuning })
                : t("tuning.door.tuningNotFound")
            }
            onClick={() => onOpenTuning(tuning)}
          >
            <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
            {t("tuning.door.openTuning")}
          </Button>
          <Button variant="destructive" size="sm" onClick={onRemove}>
            {t("common.remove")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
        <section className="w-full rounded-lg border border-line-soft bg-panel/40 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-medium tracking-tight text-muted-foreground">
              {t("tuning.door.mapping")}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
              <span className="rounded-md bg-secondary px-2 py-1 font-mono text-[11px] text-secondary-foreground">
                {shared === 1
                  ? t("tuning.door.sharedOnTuning", { count: shared })
                  : t("tuning.door.sharedOnTuningOther", { count: shared })}
              </span>
              {tuning !== map.tuning ? (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 truncate font-mono">
                  <span className="truncate text-muted-foreground">{map.tuning}</span>
                  <ArrowRight className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="truncate text-bright">{tuning}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.15fr)]">
            <div className="min-w-0">
              <Label className="mb-1.5 mt-0 text-[11px] font-normal text-faint">
                {t("tuning.door.modelName")}
              </Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-10 font-mono text-[13px]"
              />
            </div>

            <div className="flex h-10 items-center justify-center text-faint sm:px-1">
              <ArrowRight className="size-4 rotate-90 sm:rotate-0" strokeWidth={2} aria-hidden />
            </div>

            <div className="min-w-0">
              <Label className="mb-1.5 mt-0 text-[11px] font-normal text-faint">
                {t("tuning.door.linkedTuning")}
              </Label>
              <SimpleSelect
                value={tuning}
                onValueChange={setTuning}
                options={tunings.map((item) => item.name)}
                className="h-10 data-[size=default]:h-10 font-mono text-[13px]"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});

const TuneDetail = forwardRef<
  EditorHandle,
  {
    entry: TuningEntry;
    xml: string;
    linked: number;
    onDirtyChange: (dirty: boolean) => void;
    onRename: () => void;
    onRemove: () => void;
  }
>(function TuneDetail({ entry, xml, linked, onDirtyChange, onRename, onRemove }, ref) {
  const { t } = useLocale();
  const [fields, setFields] = useState(entry.fields);
  const [box, setBox] = useState(entry.box);

  useEffect(() => {
    setFields(entry.fields);
    setBox(entry.box);
  }, [entry]);

  const dirty = !isTuningFieldsEqual(fields, entry.fields) || !isBoxEqual(box, entry.box);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => dirty,
      reset: () => {
        setFields(entry.fields);
        setBox(entry.box);
      },
      flush: () => {
        if (!dirty) return null;
        let next = updateTuningValues(xml, entry.name, fields);
        next = updateTriggerBox(next, entry.name, box);
        return next;
      },
    }),
    [box, dirty, entry.box, entry.fields, entry.name, fields, xml],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-tight text-bright">{entry.name}</div>
          <div className="text-[11px] text-faint">
            {linked === 1
              ? t("tuning.detail.sharedBy", { count: linked })
              : t("tuning.detail.sharedByOther", { count: linked })}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onRename}>
            {t("common.rename")}
          </Button>
          <Button variant="destructive" size="sm" onClick={onRemove}>
            {t("common.remove")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-1 items-stretch gap-2.5 p-4 pb-8 sm:p-5 xl:grid-cols-2 xl:gap-3">
          <AutoOpenVolumeSection fields={fields} onFieldsChange={setFields} />
          <PhysicsSection fields={fields} onFieldsChange={setFields} />
          <OptionsSection fields={fields} onFieldsChange={setFields} />
          <TriggerBoxSection box={box} onBoxChange={setBox} />
          <FlagsDirectionSection fields={fields} onFieldsChange={setFields} />
        </div>
      </div>
    </div>
  );
});
