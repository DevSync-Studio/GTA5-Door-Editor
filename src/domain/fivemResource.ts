import vanillaGta5Meta from "@/assets/vanilla/gta5.meta?raw";
import vanillaFxManifest from "@/assets/vanilla/fxmanifest.lua?raw";

/** FiveM resource folder name (no brackets, no path separators). */
export function sanitizeResourceName(raw: string): string {
  const trimmed = raw.trim().replace(/^\[|\]$/g, "");
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "doortuning";
}

/**
 * Point DOOR_TUNING_FILE at this resource.
 * Example: resources:/my_doors/doortuning  (never include [main] etc.)
 */
export function gta5MetaForResource(resourceName: string): string {
  const name = sanitizeResourceName(resourceName);
  return vanillaGta5Meta.replace(
    /resources:\/[^/\s<]+\/doortuning/g,
    `resources:/${name}/doortuning`,
  );
}

export function fxManifestForResource(): string {
  return vanillaFxManifest.endsWith("\n") ? vanillaFxManifest : `${vanillaFxManifest}\n`;
}
