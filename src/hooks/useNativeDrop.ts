import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { readTextFile, type NativeFile } from "@/lib/files";

type Reader<T extends NativeFile> = (path: string) => Promise<T>;

type DragDropKind = "enter" | "over" | "leave" | "drop";

type DragDropPayload = {
  type: DragDropKind;
  paths: string[];
};

function subscribeNativeDragDrop(
  onEvent: (payload: DragDropPayload) => void,
): Promise<() => void> {
  return (async () => {
    if (!isTauri()) return () => undefined;
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    return getCurrentWebview().onDragDropEvent((event) => {
      const kind = event.payload.type;
      const paths = "paths" in event.payload ? event.payload.paths : [];
      onEvent({ type: kind, paths });
    });
  })();
}

export function useNativeDragHighlight(enabled: boolean, onActive: (active: boolean) => void) {
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;

  useEffect(() => {
    if (!enabled) {
      onActiveRef.current(false);
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void subscribeNativeDragDrop((payload) => {
      if (payload.type === "enter" || payload.type === "over") {
        onActiveRef.current(true);
      } else {
        onActiveRef.current(false);
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* Not in a Tauri webview - HTML5 drag handlers still apply. */
      });

    return () => {
      cancelled = true;
      unlisten?.();
      onActiveRef.current(false);
    };
  }, [enabled]);
}

// OS drops are webview-global; busyRef blocks StrictMode dual listeners.
export function useNativeDrop<T extends NativeFile = NativeFile>(
  onFile: (file: T) => void,
  reader?: Reader<T>,
  enabled = true,
) {
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;
  const readerRef = useRef(reader);
  readerRef.current = reader;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void subscribeNativeDragDrop(async (payload) => {
      if (payload.type !== "drop") return;
      if (busyRef.current) return;
      const path = payload.paths[0];
      if (!path) return;
      busyRef.current = true;
      try {
        const read = readerRef.current ?? ((p: string) => readTextFile(p) as Promise<T>);
        onFileRef.current(await read(path));
      } catch {
        /* Workspace parser / load handler shows its own toast. */
      } finally {
        window.setTimeout(() => {
          busyRef.current = false;
        }, 400);
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* Not inside a Tauri webview yet - import buttons still work. */
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);
}

export function useNativePathDrop({
  enabled,
  accept,
  hoverAccept,
  onDrop,
  onHover,
}: {
  enabled: boolean;
  accept?: (path: string) => boolean;
  hoverAccept?: (path: string) => boolean;
  onDrop: (paths: string[]) => void;
  onHover?: (active: boolean) => void;
}) {
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  const hoverAcceptRef = useRef(hoverAccept);
  hoverAcceptRef.current = hoverAccept;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  useEffect(() => {
    if (!enabled) {
      onHoverRef.current?.(false);
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const filterPaths = (paths: string[], forHover: boolean) => {
      const check = forHover
        ? (hoverAcceptRef.current ?? acceptRef.current)
        : acceptRef.current;
      return check ? paths.filter(check) : paths;
    };

    void subscribeNativeDragDrop((payload) => {
      if (payload.type === "enter" || payload.type === "over") {
        const hit = filterPaths(payload.paths, true);
        onHoverRef.current?.(hit.length > 0);
        return;
      }
      if (payload.type === "leave") {
        onHoverRef.current?.(false);
        return;
      }
      if (payload.type === "drop") {
        onHoverRef.current?.(false);
        const paths = filterPaths(payload.paths, false);
        if (paths.length > 0) onDropRef.current(paths);
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* Browser / unavailable - HTML5 drop still used where wired. */
      });

    return () => {
      cancelled = true;
      unlisten?.();
      onHoverRef.current?.(false);
    };
  }, [enabled]);
}
