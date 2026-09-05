import { useEffect, useRef } from "react";
import type { WorkspaceId } from "@/domain/constants";

export type WorkspaceAction = "export" | "unload";

type Handlers = Partial<Record<WorkspaceAction, () => void | Promise<void>>>;

const registry = new Map<WorkspaceId, Handlers>();

export function useWorkspaceActions(
  id: WorkspaceId,
  enabled: boolean,
  handlers: Handlers,
) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const entry: Handlers = {
      export: () => ref.current.export?.(),
      unload: () => ref.current.unload?.(),
    };
    registry.set(id, entry);
    return () => {
      if (registry.get(id) === entry) registry.delete(id);
    };
  }, [id, enabled]);
}

export function runWorkspaceAction(id: WorkspaceId, action: WorkspaceAction) {
  void registry.get(id)?.[action]?.();
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
