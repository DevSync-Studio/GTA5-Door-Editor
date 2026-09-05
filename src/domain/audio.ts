import { attrOf, blocksOf, textOf } from "@/lib/xml";
import defaultsFile from "./door-audio-settings.defaults.json";

export type AudioPreset = {
  name: string;
  Sounds: string;
  TuningParams: string;
  MaxOcclusion: number | string;
};

export type AudioAssignment = {
  id: string;
  name: string;
  preset: string;
  sounds: string;
  tuningParams: string;
  maxOcclusion: string;
};

export type AudioDoor = {
  id: string;
  label: string;
};

export const DEFAULT_AUDIO: AudioPreset[] = defaultsFile.availableDoorSound;

export function joaat(value: string): string {
  let hash = 0;
  for (const char of value.toLowerCase()) {
    hash += char.charCodeAt(0);
    hash += hash << 10;
    hash ^= hash >>> 6;
  }
  hash += hash << 3;
  hash ^= hash >>> 11;
  hash += hash << 15;
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function doorAudioLinkName(doorName: string): string {
  const name = doorName.trim().toLowerCase();
  const stem = name.startsWith("d_") ? name.slice(2) : name;
  return `dasl_${joaat(stem)}`;
}

export function normalizeDoorName(value: string): string {
  const name = value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return name.startsWith("d_") ? name : `d_${name}`;
}

export function parseAudioCatalog(jsonText: string): AudioPreset[] {
  const data = JSON.parse(jsonText) as unknown;
  const items = Array.isArray(data)
    ? data
    : ((data as { availableDoorSound?: unknown }).availableDoorSound ??
      (data as { entries?: unknown }).entries ??
      (data as { audioSettings?: unknown }).audioSettings);
  if (!Array.isArray(items)) throw new Error("Expected availableDoorSound array.");
  return items.map((item) => {
    const row = item as AudioPreset;
    return {
      name: row.name,
      Sounds: row.Sounds,
      TuningParams: row.TuningParams,
      MaxOcclusion: row.MaxOcclusion,
    };
  });
}

export function validateAudioCatalog(catalog: AudioPreset[]): void {
  if (catalog.length === 0) throw new Error("Catalog must include at least one preset.");
  for (const row of catalog) {
    if (!row.name?.trim() || !String(row.Sounds ?? "").trim() || !String(row.TuningParams ?? "").trim()) {
      throw new Error("Every preset needs name, Sounds, and TuningParams.");
    }
  }
}

export function parseAudioCatalogFile(jsonText: string): AudioPreset[] {
  const catalog = parseAudioCatalog(jsonText);
  validateAudioCatalog(catalog);
  return catalog;
}

export function catalogJson(catalog: AudioPreset[]): string {
  return `${JSON.stringify({ availableDoorSound: catalog }, null, 2)}\n`;
}

export function audioXml(
  assignments: { name: string; sounds: string; tuningParams: string; maxOcclusion: string }[],
): string {
  const items = assignments.flatMap(
    (entry) =>
      `\t\t<Item type="DoorAudioSettings" ntOffset="0">
\t\t\t<Name>${entry.name}</Name>
\t\t\t<Sounds>${entry.sounds}</Sounds>
\t\t\t<TuningParams>${entry.tuningParams}</TuningParams>
\t\t\t<MaxOcclusion value="${entry.maxOcclusion}" />
\t\t</Item>
\t\t<Item type="DoorAudioSettingsLink" ntOffset="0">
\t\t\t<Name>${doorAudioLinkName(entry.name)}</Name>
\t\t\t<Door>${entry.name}</Door>
\t\t</Item>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<Dat151>
\t<Version value="9458585" />
\t<Items>
${items.join("\n")}
\t</Items>
</Dat151>
`;
}

export function nametableBytes(names: string[]): string {
  const out = new Set<string>();
  for (const raw of names.filter(Boolean)) {
    out.add(raw);
    if (/^d_/i.test(raw) && raw.length > 2) {
      out.add(doorAudioLinkName(raw));
    }
  }
  const unique = [...out].sort((a, b) => a.localeCompare(b));
  return unique.length ? `${unique.join("\0")}\0` : "";
}

export function parseNametable(text: string): string[] {
  return text
    .split(/\0|\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseDat151(xml: string): {
  name: string;
  sounds: string;
  tuningParams: string;
  maxOcclusion: string;
}[] {
  if (!/<Dat151[\s>]/i.test(xml)) {
    throw new Error("Expected a DAT151 XML file.");
  }
  const out: {
    name: string;
    sounds: string;
    tuningParams: string;
    maxOcclusion: string;
  }[] = [];
  for (const raw of blocksOf(xml, "Item")) {
    const isSettings =
      /type\s*=\s*["']DoorAudioSettings["']/i.test(raw) ||
      (/DoorAudioSettings/i.test(raw) && !/DoorAudioSettingsLink/i.test(raw));
    if (!isSettings || /DoorAudioSettingsLink/i.test(raw)) continue;
    const name = textOf(raw, "Name").trim();
    if (!name) continue;
    out.push({
      name: normalizeDoorName(name),
      sounds: textOf(raw, "Sounds").trim(),
      tuningParams: textOf(raw, "TuningParams").trim(),
      maxOcclusion: attrOf(raw, "MaxOcclusion", "value").trim() || "0.7",
    });
  }
  if (out.length === 0) {
    throw new Error("No DoorAudioSettings entries found in that DAT151 file.");
  }
  return out;
}

export function matchPresetIndex(
  catalog: AudioPreset[],
  sounds: string,
  tuningParams: string,
  maxOcclusion: string,
): string {
  const idx = catalog.findIndex(
    (item) =>
      item.Sounds === sounds &&
      item.TuningParams === tuningParams &&
      String(item.MaxOcclusion) === String(maxOcclusion),
  );
  if (idx >= 0) return String(idx);
  return "custom";
}
