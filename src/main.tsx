import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { installDesktopWebviewGuards } from "@/lib/desktopGuards";
import { initLocale } from "@/domain/i18n";
import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");
installDesktopWebviewGuards();

/**
 * Keep <Toaster /> outside StrictMode.
 * Sonner + StrictMode remount can register two toaster roots in dev and show every toast twice.
 */
void initLocale().then(() => {
  createRoot(document.getElementById("root")!).render(
    <>
      <StrictMode>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </StrictMode>
      <Toaster />
    </>,
  );
});
