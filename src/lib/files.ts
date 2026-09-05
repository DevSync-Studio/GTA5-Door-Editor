import { invoke } from "@tauri-apps/api/core";

export type NativeFile = {
  path: string;
  name: string;
  text: string;
};

export type OpenedYtyp = NativeFile & {
  format: "xml" | "binary";
  binaryBase64: string | null;
};

export type YtypAttrUpdate = {
  name: string;
  specialAttribute: number;
  flags?: number | null;
};

export type FileFilter = {
  title: string;
  extensions: string[];
};

export async function openTextFile(
  title: string,
  filters: FileFilter[],
): Promise<NativeFile | null> {
  return invoke<NativeFile | null>("open_text_file", { title, filters });
}

export async function readTextFile(path: string): Promise<NativeFile> {
  return invoke<NativeFile>("read_text_file", { path });
}

export async function openYtypFile(
  title: string,
  filters: FileFilter[],
): Promise<OpenedYtyp | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    title,
    multiple: false,
    filters: filters.map((filter) => ({
      name: filter.title,
      extensions: filter.extensions,
    })),
  });
  if (selected == null) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;
  return readYtypFile(path);
}

export async function readYtypFile(path: string): Promise<OpenedYtyp> {
  return invoke<OpenedYtyp>("read_ytyp_file", { path });
}

export async function parseYtypBytes(name: string, bytes: Uint8Array): Promise<OpenedYtyp> {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const dataBase64 = btoa(binary);
  return invoke<OpenedYtyp>("parse_ytyp_bytes", { name, dataBase64 });
}

export type YdrMeshPart = {
  positions: number[];
  uvs: number[];
  indices: number[];
  diffuseName?: string | null;
};

export type PreviewTexture = {
  name: string;
  width: number;
  height: number;
  rgbaBase64: string;
  source: string;
};

export type YdrPreview = {
  name: string;
  nameHash?: number;
  meshes: YdrMeshPart[];
  textures: PreviewTexture[];
  hasEmbeddedTextures: boolean;
  missingDiffuse?: boolean;
  resourceVersion?: number;
  gen9?: boolean;
};

export async function parseYdrMesh(bytes: Uint8Array): Promise<YdrPreview> {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const dataBase64 = btoa(binary);
  return invoke<YdrPreview>("parse_ydr_mesh", { dataBase64 });
}

export async function parseYdrMeshPath(path: string): Promise<YdrPreview> {
  return invoke<YdrPreview>("parse_ydr_mesh_path", { path });
}

export async function parseYtdTextures(bytes: Uint8Array): Promise<PreviewTexture[]> {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const dataBase64 = btoa(binary);
  return invoke<PreviewTexture[]>("parse_ytd_textures", { dataBase64 });
}

export async function parseYtdTexturesPath(path: string): Promise<PreviewTexture[]> {
  return invoke<PreviewTexture[]>("parse_ytd_textures_path", { path });
}

export async function saveYtypBinary(
  path: string,
  binaryBase64: string,
  updates: YtypAttrUpdate[],
): Promise<void> {
  await invoke("save_ytyp_binary", { path, binaryBase64, updates });
}

export async function saveYtypBinaryAs(
  title: string,
  defaultName: string,
  binaryBase64: string,
  updates: YtypAttrUpdate[],
): Promise<NativeFile | null> {
  return invoke<NativeFile | null>("save_ytyp_binary_as", {
    title,
    defaultName,
    binaryBase64,
    updates,
  });
}

export async function saveTextFile(path: string, contents: string): Promise<void> {
  await invoke("save_text_file", { path, contents });
}

export async function saveTextFileAs(
  title: string,
  defaultName: string,
  contents: string,
  filters: FileFilter[],
): Promise<NativeFile | null> {
  return invoke<NativeFile | null>("save_text_file_as", {
    title,
    defaultName,
    contents,
    filters,
  });
}

export type BackupTool = "tuning" | "type" | "audio" | "names" | "merge";

export async function backupExisting(
  path: string,
  tool: BackupTool,
): Promise<string | null> {
  return invoke<string | null>("backup_existing", { path, tool });
}

export async function saveWithBackup(
  path: string,
  contents: string,
  tool: BackupTool,
): Promise<string | null> {
  const backup = await backupExisting(path, tool);
  await saveTextFile(path, contents);
  return backup;
}

export async function pickDirectory(title: string): Promise<string | null> {
  return invoke<string | null>("pick_directory", { title });
}

export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") ? "\\" : "/";
  const trimmed = base.replace(/[\\/]+$/, "");
  return [trimmed, ...parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ""))].join(sep);
}

export function fileNameFromPath(path: string): string {
  return path.replace(/^.*[/\\]/, "") || path;
}

export async function revealInExplorer(path: string): Promise<void> {
  await invoke("reveal_in_explorer", { path });
}

export async function openExternalUrl(url: string): Promise<void> {
  await invoke("open_external_url", { url });
}

export async function loadAudioCatalogText(): Promise<string | null> {
  return invoke<string | null>("load_audio_catalog");
}

export async function saveAudioCatalogText(contents: string): Promise<void> {
  await invoke("save_audio_catalog", { contents });
}
