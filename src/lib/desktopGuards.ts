export function installDesktopWebviewGuards() {
  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key;
    const lower = key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;

    if (key === "F5" || (mod && lower === "r")) {
      event.preventDefault();
      return;
    }

    if (mod && (lower === "p" || lower === "u" || lower === "f")) {
      event.preventDefault();
      return;
    }

    if (!import.meta.env.DEV) {
      if (key === "F12") {
        event.preventDefault();
        return;
      }
      if (mod && event.shiftKey && (lower === "i" || lower === "j" || lower === "c")) {
        event.preventDefault();
      }
    }
  };

  document.addEventListener("contextmenu", onContextMenu, true);
  window.addEventListener("keydown", onKeyDown, true);
}
