import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AudioLines,
  Combine,
  DoorOpen,
  ListTree,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  EMPTY_FOOTER_STATE,
  WORKSPACES,
  type WorkspaceFooterState,
  type WorkspaceId,
} from "@/domain/constants";
import { DEFAULT_AUDIO, catalogJson, parseAudioCatalogFile, type AudioAssignment, type AudioDoor, type AudioPreset } from "@/domain/audio";
import { AppStatusBar } from "@/components/AppStatusBar";
import { ConfirmDialog } from "@/components/Dialogs";
import { WindowTitlebar } from "@/components/WindowTitlebar";
import { loadAudioCatalogText, saveAudioCatalogText } from "@/lib/files";
import { toast } from "@/lib/toast";
import { isEditableTarget, runWorkspaceAction } from "@/lib/workspaceActions";
import { cn } from "@/lib/utils";

const TuningView = lazy(() =>
  import("./tools/TuningView").then((module) => ({ default: module.TuningView })),
);
const TypeView = lazy(() =>
  import("./tools/TypeView").then((module) => ({ default: module.TypeView })),
);
const AudioView = lazy(() =>
  import("./tools/AudioView").then((module) => ({ default: module.AudioView })),
);
const NamesView = lazy(() =>
  import("./tools/NamesView").then((module) => ({ default: module.NamesView })),
);
const MergeView = lazy(() =>
  import("./tools/MergeView").then((module) => ({ default: module.MergeView })),
);

const ICONS: Record<WorkspaceId, LucideIcon> = {
  tuning: SlidersHorizontal,
  type: DoorOpen,
  audio: AudioLines,
  names: ListTree,
  merge: Combine,
};

const EMPTY_DIRTY: Record<WorkspaceId, boolean> = {
  tuning: false,
  type: false,
  audio: false,
  names: false,
  merge: false,
};

const EMPTY_FOOTERS: Record<WorkspaceId, WorkspaceFooterState> = {
  tuning: EMPTY_FOOTER_STATE,
  type: EMPTY_FOOTER_STATE,
  audio: EMPTY_FOOTER_STATE,
  names: EMPTY_FOOTER_STATE,
  merge: EMPTY_FOOTER_STATE,
};

type DirtySetter = (dirty: boolean) => void;
type FooterSetter = (state: WorkspaceFooterState) => void;

function sameFooter(a: WorkspaceFooterState, b: WorkspaceFooterState): boolean {
  return (
    a.format === b.format &&
    a.counts === b.counts &&
    a.lastExportAt === b.lastExportAt &&
    a.file?.name === b.file?.name &&
    a.file?.path === b.file?.path &&
    !!a.file === !!b.file
  );
}

const KeepAlivePane = memo(function KeepAlivePane({
  mounted,
  active,
  id,
  children,
}: {
  mounted: boolean;
  active: boolean;
  id: WorkspaceId;
  children: ReactNode;
}) {
  if (!mounted) return null;
  return (
    <div
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !active && "hidden")}
      aria-hidden={!active}
      data-workspace={id}
      inert={!active ? true : undefined}
    >
      {children}
    </div>
  );
});

function WorkspaceFallback() {
  return (
    <div className="grid flex-1 place-items-center text-[12px] text-faint">Loading...</div>
  );
}

export default function App() {
  const [view, setView] = useState<WorkspaceId>("tuning");
  const [visited, setVisited] = useState(() => new Set<WorkspaceId>(["tuning"]));
  const [dirty, setDirty] = useState(EMPTY_DIRTY);
  const [footers, setFooters] = useState(EMPTY_FOOTERS);
  const [doors, setDoors] = useState<AudioDoor[]>([]);
  const [assignments, setAssignments] = useState<AudioAssignment[]>([]);
  const [catalog, setCatalog] = useState<AudioPreset[]>(DEFAULT_AUDIO);
  const [nametable, setNametable] = useState<string[]>([]);
  const catalogTouchedRef = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const text = await loadAudioCatalogText();
        if (cancelled || catalogTouchedRef.current) return;

        if (text == null) {
          await saveAudioCatalogText(catalogJson(DEFAULT_AUDIO));
          return;
        }

        try {
          setCatalog(parseAudioCatalogFile(text));
        } catch {
          toast("Saved audio presets were invalid - restoring defaults.", true);
          setCatalog(DEFAULT_AUDIO);
          await saveAudioCatalogText(catalogJson(DEFAULT_AUDIO));
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistCatalog = useCallback((next: AudioPreset[]) => {
    catalogTouchedRef.current = true;
    setCatalog(next);
    if (!isTauri()) return;
    void saveAudioCatalogText(catalogJson(next)).catch((error) => {
      toast(error instanceof Error ? error.message : "Could not save audio presets.", true);
    });
  }, []);

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(view)) return prev;
      const next = new Set(prev);
      next.add(view);
      return next;
    });
  }, [view]);

  const dirtySetters = useMemo(() => {
    const make = (id: WorkspaceId): DirtySetter => (value) => {
      setDirty((current) => (current[id] === value ? current : { ...current, [id]: value }));
    };
    return {
      tuning: make("tuning"),
      type: make("type"),
      audio: make("audio"),
      names: make("names"),
      merge: make("merge"),
    } satisfies Record<WorkspaceId, DirtySetter>;
  }, []);

  const footerSetters = useMemo(() => {
    const make = (id: WorkspaceId): FooterSetter => (state) => {
      setFooters((current) => {
        if (sameFooter(current[id], state)) return current;
        return { ...current, [id]: state };
      });
    };
    return {
      tuning: make("tuning"),
      type: make("type"),
      audio: make("audio"),
      names: make("names"),
      merge: make("merge"),
    } satisfies Record<WorkspaceId, FooterSetter>;
  }, []);

  const mountedTuning = visited.has("tuning");
  const mountedType = visited.has("type");
  const mountedAudio = visited.has("audio");
  const mountedNames = visited.has("names");
  const mountedMerge = visited.has("merge");

  const selectView = useCallback((id: WorkspaceId) => setView(id), []);

  const anyDirty = useMemo(() => Object.values(dirty).some(Boolean), [dirty]);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const allowCloseRef = useRef(false);
  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;

  const forceClose = useCallback(() => {
    allowCloseRef.current = true;
    setCloseConfirm(false);
    if (isTauri()) {
      void getCurrentWindow().destroy();
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (allowCloseRef.current || !anyDirtyRef.current) return;
        event.preventDefault();
        setCloseConfirm(true);
      })
      .then((fn) => {
        if (!active) {
          fn();
          return;
        }
        unlisten = fn;
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!anyDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const digit = event.key;
      if (digit >= "1" && digit <= "5") {
        const index = Number(digit) - 1;
        const tool = WORKSPACES[index];
        if (tool) {
          event.preventDefault();
          selectView(tool.id);
        }
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        runWorkspaceAction(view, "export");
        return;
      }
      if (key === "w") {
        event.preventDefault();
        runWorkspaceAction(view, "unload");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectView, view]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <WindowTitlebar />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar/90 backdrop-blur-sm">
          <div className="px-4 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            Tools
          </div>
          <nav className="flex-1 space-y-1 overflow-auto px-2.5 pb-3" aria-label="Tools">
            {WORKSPACES.map((item) => {
              const Icon = ICONS[item.id];
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.description}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_25%,transparent)]"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                  )}
                  onClick={() => selectView(item.id)}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-opacity",
                      isActive ? "bg-primary opacity-100" : "opacity-0",
                    )}
                  />
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-faint group-hover:text-muted-foreground",
                    )}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.short}</span>
                  {dirty[item.id] ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-warning"
                      title="Unsaved changes"
                      aria-label="Unsaved changes"
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <KeepAlivePane id="tuning" mounted={mountedTuning} active={view === "tuning"}>
            <Suspense fallback={<WorkspaceFallback />}>
              <TuningView
                onDirty={dirtySetters.tuning}
                onFooter={footerSetters.tuning}
                isActive={view === "tuning"}
              />
            </Suspense>
          </KeepAlivePane>
          <KeepAlivePane id="type" mounted={mountedType} active={view === "type"}>
            <Suspense fallback={<WorkspaceFallback />}>
              <TypeView
                onDirty={dirtySetters.type}
                onFooter={footerSetters.type}
                isActive={view === "type"}
              />
            </Suspense>
          </KeepAlivePane>
          <KeepAlivePane id="audio" mounted={mountedAudio} active={view === "audio"}>
            <Suspense fallback={<WorkspaceFallback />}>
              <AudioView
                onDirty={dirtySetters.audio}
                onFooter={footerSetters.audio}
                isActive={view === "audio"}
                doors={doors}
                assignments={assignments}
                catalog={catalog}
                onDoors={setDoors}
                onAssignments={setAssignments}
                onCatalog={persistCatalog}
              />
            </Suspense>
          </KeepAlivePane>
          <KeepAlivePane id="names" mounted={mountedNames} active={view === "names"}>
            <Suspense fallback={<WorkspaceFallback />}>
              <NamesView
                onDirty={dirtySetters.names}
                onFooter={footerSetters.names}
                isActive={view === "names"}
                names={nametable}
                onNames={setNametable}
                audioDoorNames={assignments.map((row) => row.name).filter(Boolean)}
              />
            </Suspense>
          </KeepAlivePane>
          <KeepAlivePane id="merge" mounted={mountedMerge} active={view === "merge"}>
            <Suspense fallback={<WorkspaceFallback />}>
              <MergeView
                onDirty={dirtySetters.merge}
                onFooter={footerSetters.merge}
                isActive={view === "merge"}
              />
            </Suspense>
          </KeepAlivePane>
        </div>
      </div>

      <AppStatusBar footer={footers[view]} unsaved={dirty[view]} />

      <ConfirmDialog
        open={closeConfirm}
        title="Unsaved changes"
        body="One or more tools still have unsaved work. Close anyway and lose those edits?"
        danger
        onCancel={() => setCloseConfirm(false)}
        onConfirm={forceClose}
      />
    </div>
  );
}
