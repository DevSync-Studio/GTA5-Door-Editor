import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { FileMinus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { ConfirmDialog } from "@/components/Dialogs";
import { SearchField } from "@/components/SearchField";
import { UnsavedChangesBar } from "@/components/UnsavedChangesBar";
import { toast } from "@/lib/toast";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { VirtualList } from "@/components/VirtualList";
import { useNativeDrop, useNativeDragHighlight } from "@/hooks/useNativeDrop";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import { DOOR_TYPES, ytypDoorFlagsPresetLabel } from "@/domain/constants";
import {
  applyDoorTypeChange,
  applyUseFlagsChange,
  parseYtyp,
  type Archetype,
} from "@/domain/ytyp";
import {
  backupExisting,
  openYtypFile,
  parseYtypBytes,
  readYtypFile,
  saveTextFile,
  saveTextFileAs,
  saveYtypBinary,
  saveYtypBinaryAs,
  type OpenedYtyp,
} from "@/lib/files";
import { cn } from "@/lib/utils";
import { YdrPreviewPanel } from "@/tools/type/YdrPreviewPanel";

const YTYP_ACCEPT = ".ytyp,.xml,.ytyp.xml";

function isYtypFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".ytyp") || lower.endsWith(".xml");
}

async function readBrowserYtypFile(file: File): Promise<OpenedYtyp> {
  if (!isYtypFileName(file.name)) {
    throw new Error("Unsupported file type. Use .ytyp or .xml.");
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  return parseYtypBytes(file.name, buffer);
}

function TypeDropZone({
  onFile,
  isActive = true,
}: {
  onFile: (file: OpenedYtyp) => void;
  isActive?: boolean;
}) {
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

  useNativeDragHighlight(isActive, setIsDragging);
  useEffect(() => {
    if (!isActive) resetDrag();
  }, [isActive, resetDrag]);

  const browseNative = async () => {
    try {
      const file = await openYtypFile("Import YTYP", [
        { title: "YTYP", extensions: ["ytyp", "xml"] },
        { title: "YTYP XML", extensions: ["xml"] },
      ]);
      if (file) onFile(file);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not open YTYP", true);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 items-center justify-center p-6 sm:p-8 lg:p-10"
      onDragEnter={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current += 1;
        if (hasFilePayload(event.dataTransfer.types)) setIsDragging(true);
      }}
      onDragLeave={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!hasFilePayload(event.dataTransfer.types)) return;
        event.dataTransfer.dropEffect = "copy";
        setIsDragging(true);
      }}
      onDrop={async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        resetDrag();
        const file = event.dataTransfer.files.item(0);
        if (!file) return;
        if (!isYtypFileName(file.name)) {
          toast("Unsupported file type. Use .ytyp or .xml.", true);
          return;
        }
        try {
          onFile(await readBrowserYtypFile(file));
        } catch (error) {
          toast(error instanceof Error ? error.message : "Could not read file", true);
        }
      }}
    >
      <div
        role="region"
        aria-label="Drop YTYP file"
        aria-dropeffect={isDragging ? "copy" : "none"}
        className={cn(
          "flex h-[min(72%,42rem)] w-full max-w-4xl flex-col items-center justify-center gap-4 rounded-xl border px-8 text-center transition-[border-color,border-style,background-color,box-shadow] duration-150 sm:gap-5 sm:px-12 lg:gap-6 lg:px-16",
          isDragging
            ? "border-solid border-primary bg-primary/10 shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent),0_0_24px_color-mix(in_oklch,var(--primary)_22%,transparent)]"
            : "border-dashed border-line bg-transparent shadow-none",
        )}
      >
        <Upload
          className={cn(
            "size-7 transition-colors duration-150 sm:size-8 lg:size-9",
            isDragging ? "text-primary" : "text-faint",
          )}
          strokeWidth={1.75}
          aria-hidden
        />

        <div className="space-y-1.5">
          <p className="m-0 text-[15px] text-bright sm:text-[16px] lg:text-[18px]">
            Drag and drop your YTYP file here
          </p>
          <p className="m-0 text-[12px] text-muted-foreground sm:text-[13px]">
          Supports .ytyp and .ytyp.xml formats
          </p>
        </div>

        <div className="flex w-full max-w-[14rem] items-center gap-2.5 py-0.5">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[12px] text-faint">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="border-line bg-panel-2/60 text-bright hover:border-primary hover:bg-primary hover:text-primary-foreground active:bg-primary/85 active:border-primary/85"
          onClick={() => void browseNative()}
        >
          Browse Files
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={YTYP_ACCEPT}
          className="hidden"
          onChange={async (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.item(0);
            event.target.value = "";
            if (!file) return;
            try {
              onFile(await readBrowserYtypFile(file));
            } catch (error) {
              toast(error instanceof Error ? error.message : "Could not read file", true);
            }
          }}
        />
      </div>
    </div>
  );
}

export const TypeView = memo(function TypeView(props: {
  onDirty: (dirty: boolean) => void;
  onFooter?: (state: import("@/domain/constants").WorkspaceFooterState) => void;
  isActive?: boolean;
}) {
  const { onDirty, onFooter, isActive = true } = props;
  const workspaceActive = isActive;
  const [path, setPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [baselineXml, setBaselineXml] = useState<string | null>(null);
  const [format, setFormat] = useState<"xml" | "binary">("xml");
  const [binaryBase64, setBinaryBase64] = useState<string | null>(null);
  const [baselineBinaryBase64, setBaselineBinaryBase64] = useState<string | null>(null);
  const [items, setItems] = useState<Archetype[]>([]);
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => void } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);

  const hasUnsaved = xml != null && baselineXml != null && xml !== baselineXml;

  useEffect(() => {
    onDirty(hasUnsaved);
  }, [hasUnsaved, onDirty]);

  useEffect(() => {
    if (!onFooter) return;
    if (!fileName) {
      onFooter({ file: null, format: null, counts: null, lastExportAt });
      return;
    }
    onFooter({
      file: { name: fileName, path: path || null },
      format: format === "binary" ? "YTYP" : "YTYP XML",
      counts: items.length ? `${items.length} archetypes` : null,
      lastExportAt,
    });
  }, [path, fileName, format, items.length, lastExportAt, onFooter]);

  const loadFile = useCallback((file: OpenedYtyp) => {
    try {
      const data = parseYtyp(file.text);
      if (data.length === 0) {
        throw new Error("No archetypes with specialAttribute were found in this YTYP.");
      }
      setPath(file.path || null);
      setFileName(file.name);
      setXml(file.text);
      setBaselineXml(file.text);
      setFormat(file.format === "binary" ? "binary" : "xml");
      setBinaryBase64(file.binaryBase64 ?? null);
      setBaselineBinaryBase64(file.binaryBase64 ?? null);
      setItems(data);
      setSelected(0);
      toast(`Opened ${file.name}`, "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not import YTYP", true);
    }
  }, []);

  useNativeDrop<OpenedYtyp>(
    (file) => {
      if (/\.ydr$/i.test(file.name) || /\.ytd$/i.test(file.name)) return;
      loadFile(file);
    },
    async (path) => {
      if (/\.ydr$/i.test(path) || /\.ytd$/i.test(path)) throw new Error("skip-drawable");
      return readYtypFile(path);
    },
    workspaceActive,
  );

  const shown = useMemo(
    () =>
      items.filter(
        (item) =>
          item.name.toLowerCase().includes(search.toLowerCase()) &&
          (filter === "all" || item.specialAttribute === filter),
      ),
    [items, search, filter],
  );

  const current = items[selected];

  const closeFile = () => {
    setConfirm({
      title: "Unload file",
      body: hasUnsaved
        ? "You still have pending edits. Unload anyway and lose them?"
        : "Unload this YTYP file from the editor.",
      run: () => {
        setXml(null);
        setBaselineXml(null);
        setItems([]);
        setPath(null);
        setFileName(null);
        setFormat("xml");
        setBinaryBase64(null);
        setBaselineBinaryBase64(null);
        setLastExportAt(null);
      },
    });
  };

  const resetChanges = () => {
    if (!baselineXml) return;
    setXml(baselineXml);
    setItems(parseYtyp(baselineXml));
    setBinaryBase64(baselineBinaryBase64);
  };

  const saveChanges = async () => {
    if (!xml) return;
    setSaving(true);
    try {
      if (format === "binary") {
        if (!binaryBase64) {
          toast("YTYP data is missing.", true);
          return;
        }
        const updates = items.map((item) => ({
          name: item.name,
          specialAttribute: Number.parseInt(item.specialAttribute, 10) || 0,
          flags: item.useFlags ? Number.parseInt(item.flags, 10) || 0 : null,
        }));
        if (path) {
          const backup = await backupExisting(path, "type");
          await saveYtypBinary(path, binaryBase64, updates);
          const refreshed = await readYtypFile(path);
          setBinaryBase64(refreshed.binaryBase64);
          setBaselineBinaryBase64(refreshed.binaryBase64);
          setXml(refreshed.text);
          setBaselineXml(refreshed.text);
          setItems(parseYtyp(refreshed.text));
          setLastExportAt(Date.now());
          toast(backup ? "Saved (backup created)" : "Changes saved", "save");
        } else {
          const defaultName = fileName?.replace(/\.xml$/i, "") || "door.ytyp";
          const saved = await saveYtypBinaryAs(
            "Save YTYP binary",
            defaultName.endsWith(".ytyp") ? defaultName : `${defaultName}.ytyp`,
            binaryBase64,
            updates,
          );
          if (!saved) return;
          setPath(saved.path);
          setFileName(saved.name);
          const refreshed = await readYtypFile(saved.path);
          setBinaryBase64(refreshed.binaryBase64);
          setBaselineBinaryBase64(refreshed.binaryBase64);
          setXml(refreshed.text);
          setBaselineXml(refreshed.text);
          setItems(parseYtyp(refreshed.text));
          setLastExportAt(Date.now());
          toast("Changes saved", "save");
        }
      } else if (path) {
        const backup = await backupExisting(path, "type");
        await saveTextFile(path, xml);
        setBaselineXml(xml);
        setLastExportAt(Date.now());
        toast(backup ? "Saved (backup created)" : "Changes saved", "save");
      } else {
        const saved = await saveTextFileAs("Save YTYP XML", fileName || "door.ytyp.xml", xml, [
          { title: "XML", extensions: ["xml"] },
        ]);
        if (!saved) return;
        setPath(saved.path);
        setFileName(saved.name);
        setBaselineXml(xml);
        setLastExportAt(Date.now());
        toast("Changes saved", "save");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", true);
    } finally {
      setSaving(false);
    }
  };

  const setDoorType = (value: string) => {
    if (!xml || !current) return;
    const { xml: nextXml, item } = applyDoorTypeChange(xml, current, value);
    setXml(nextXml);
    setItems((prev) => prev.map((entry, index) => (index === selected ? item : entry)));
  };

  const setUseFlags = (checked: boolean) => {
    if (!xml || !current || !baselineXml) return;
    const baselineItem = parseYtyp(baselineXml).find((entry) => entry.name === current.name);
    const baselineFlags = baselineItem?.flags ?? "0";
    const { xml: nextXml, item } = applyUseFlagsChange(xml, current, checked, baselineFlags);
    setXml(nextXml);
    setItems((prev) => prev.map((entry, index) => (index === selected ? item : entry)));
  };

  useWorkspaceActions("type", workspaceActive, {
    export: () => {
      if (xml) void saveChanges();
    },
    unload: () => {
      if (xml) closeFile();
    },
  });

  return (
    <WorkspaceShell
      title="Door Type"
      subtitle={fileName || undefined}
      status={hasUnsaved ? "unsaved" : null}
      actions={
        xml ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            title="Unload this file"
            onClick={closeFile}
          >
            <FileMinus className="size-3.5" strokeWidth={1.75} />
            Unload
          </Button>
        ) : undefined
      }
    >
      {!xml || !current ? (
        <div className="h-full overflow-auto">
          <TypeDropZone onFile={loadFile} isActive={workspaceActive} />
        </div>
      ) : (
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] divide-x divide-line-soft xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col bg-sidebar/80">
              <div className="ide-panel-head shrink-0">
                Archetypes
                <span className="flex items-center gap-2 font-normal normal-case tracking-normal">
                  <Badge variant="secondary" className="h-8 px-2 font-mono text-[11px] tabular-nums">
                    {shown.length}/{items.length}
                  </Badge>
                </span>
              </div>
              <div className="flex shrink-0 flex-col gap-2.5 border-b border-line-soft px-2.5 py-3">
                <SearchField placeholder="Search archetypes" value={search} onChange={setSearch} />
                <SimpleSelect
                  value={filter}
                  onValueChange={setFilter}
                  options={[
                    { value: "all", label: "All types" },
                    ...Object.entries(DOOR_TYPES).map(([value, label]) => ({ value, label })),
                  ]}
                />
              </div>
              <div className="min-h-0 flex-1 basis-0">
                <VirtualList
                  items={shown}
                  itemHeight={64}
                  render={(item) => {
                    const index = items.indexOf(item);
                    return (
                      <button
                        type="button"
                        className={cn("ide-row h-full", index === selected && "active")}
                        onClick={() => setSelected(index)}
                      >
                        <span className="w-full truncate">{item.name}</span>
                        <small>
                          {DOOR_TYPES[item.specialAttribute] || "Unknown"} · {item.specialAttribute}
                        </small>
                      </button>
                    );
                  }}
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-col bg-editor">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-[14px] font-semibold tracking-tight text-bright">
                        {current.name}
                      </div>
                      {hasUnsaved ? (
                        <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-warning">
                          Unsaved
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">
                      Door type and optional flags
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-5">
                  <section className="w-full shrink-0 rounded-lg border border-line-soft bg-panel/40 p-4 sm:p-5">
                    <h3 className="mb-4 text-[13px] font-medium tracking-tight text-muted-foreground">
                      Door type
                    </h3>
                    <div className="max-w-md space-y-4">
                      <div>
                        <Label className="mb-1.5 mt-0 text-[11px] font-normal text-faint">
                          specialAttribute
                        </Label>
                        <SimpleSelect
                          value={current.specialAttribute}
                          onValueChange={setDoorType}
                          options={Object.entries(DOOR_TYPES).map(([value, label]) => ({
                            value,
                            label: `${label} (${value})`,
                          }))}
                        />
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          id="type-use-flags"
                          className="size-5 rounded-[5px] after:-inset-x-2 after:-inset-y-2 [&_[data-slot=checkbox-indicator]>svg]:size-3.5"
                          checked={current.useFlags}
                          onCheckedChange={(value) => setUseFlags(value === true)}
                        />
                        <Label
                          htmlFor="type-use-flags"
                          className="m-0 cursor-pointer text-[13px] font-normal text-bright"
                        >
                          Use flags
                        </Label>
                      </div>

                      <div>
                        <Label className="mb-1.5 mt-0 text-[11px] font-normal text-faint">
                          Flags value
                        </Label>
                        <Input
                          readOnly
                          value={
                            current.useFlags
                              ? (() => {
                                  const preset = ytypDoorFlagsPresetLabel(
                                    Number.parseInt(current.flags, 10) || 0,
                                  );
                                  return preset
                                    ? `${preset} (${current.flags})`
                                    : current.flags;
                                })()
                              : ""
                          }
                          placeholder={current.useFlags ? undefined : "Off"}
                          className="font-mono tabular-nums text-muted-foreground"
                        />
                      </div>

                      <p className="m-0 text-[12px] leading-5 text-faint">
                        {current.useFlags
                          ? "Applies the Normal or Automatic flags preset for this door type. Written on save."
                          : "On save, specialAttribute is updated. Existing flags are left alone."}
                      </p>
                    </div>
                  </section>

                  <YdrPreviewPanel
                    specialAttribute={current.specialAttribute}
                    modelName={current.name}
                    isActive={workspaceActive}
                  />
                </div>
              </div>
            </div>
          </div>

          <UnsavedChangesBar
            open={hasUnsaved}
            saving={saving}
            onReset={resetChanges}
            onSave={() => void saveChanges()}
            description="Save writes this YTYP to disk. Backups go next to the file and under AppData."
          />
        </div>
      )}

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
