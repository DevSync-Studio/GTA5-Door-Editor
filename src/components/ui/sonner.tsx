"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { BadgeInfo, Download, OctagonAlert, SaveCheck } from "lucide-react";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-right"
      expand
      visibleToasts={3}
      closeButton
      gap={8}
      offset={42}
      duration={4000}
      icons={{
        success: <SaveCheck className="size-4 text-success" strokeWidth={1.75} />,
        info: <BadgeInfo className="size-4 text-blue" strokeWidth={1.75} />,
        warning: <OctagonAlert className="size-4 text-warning" strokeWidth={1.75} />,
        error: <OctagonAlert className="size-4 text-destructive" strokeWidth={1.75} />,
        loading: <Download className="size-4 text-blue" strokeWidth={1.75} />,
      }}
      style={
        {
          "--normal-bg": "color-mix(in oklch, var(--panel) 97%, black)",
          "--normal-text": "var(--bright)",
          "--normal-border": "var(--line-soft)",
          "--border-radius": "6px",
          "--error-bg": "color-mix(in oklch, var(--panel) 97%, black)",
          "--error-text": "var(--bright)",
          "--error-border": "var(--line-soft)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "app-toast",
          title: "app-toast-title",
          closeButton: "app-toast-close",
          icon: "app-toast-icon",
        },
      }}
      {...props}
    />
  );
}
