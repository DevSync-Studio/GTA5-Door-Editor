import { attrOf, blocksOf, textOf } from "@/lib/xml";

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

export const DEFAULT_AUDIO: AudioPreset[] = [
  { name: "24/7 Door", Sounds: "door_swing_glass_and_metal_shop_beep", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Pushed Door", Sounds: "door_swing_exit_wood_no_mech", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Elevator Door", Sounds: "door_sliding_lift_fib", TuningParams: "dtp_fib_elevator_door", MaxOcclusion: 0.7 },
  { name: "Jail Door", Sounds: "hash_0d2cd7d4", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Sliding Door", Sounds: "door_slide_manual", TuningParams: "dtp_sliding_door_interior", MaxOcclusion: 0.7 },
  { name: "Normal Gate", Sounds: "door_garage", TuningParams: "dtp_mp_garage_door", MaxOcclusion: 0.7 },
  { name: "Slide Gate", Sounds: "door_sliding_metal_gate_bars", TuningParams: "dtp_default_sliding_horizontal", MaxOcclusion: 0.7 },
  { name: "Slide Gate 2", Sounds: "door_garage_heavy_slider", TuningParams: "dtp_default_sliding_horizontal", MaxOcclusion: 0.7 },
  { name: "Up-Down Gate", Sounds: "door_garage_ls_customs", TuningParams: "dtp_default_sliding_vertical", MaxOcclusion: 0.7 },
  { name: "Door with a bell", Sounds: "door_swing_glass_and_metal_shop_bell", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Wood Door Swing LC", Sounds: "wood_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Shop Door Swing LC", Sounds: "shop_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Glass Door Swing LC", Sounds: "glass_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Metal Door Swing LC", Sounds: "metal_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Diner Door Swing LC", Sounds: "diner_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Exit Door Swing LC", Sounds: "exit_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Metal Vault Door Swing LC", Sounds: "metal_vault_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Prison Yard Door Swing LC", Sounds: "prison_yard_door", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Corrugated Door Gate Swing LC", Sounds: "corrugated_door_gate", TuningParams: "dtp_default_swing", MaxOcclusion: 0.7 },
  { name: "Door Slide Chainlink LC", Sounds: "chainlink_door_gate", TuningParams: "dtp_chainlink_slide", MaxOcclusion: 0.7 },
  { name: "Chainlink Door Gate Swing LC", Sounds: "chainlink_door_gate", TuningParams: "dtp_chainlink_swing_big", MaxOcclusion: 0.7 },
  { name: "Door Garage LC", Sounds: "door_garage", TuningParams: "dtp_mp_garage_door", MaxOcclusion: 0.7 },
  { name: "Door PayNSpray LC", Sounds: "door_garage_ls_customs", TuningParams: "dtp_default_sliding_vertical", MaxOcclusion: 0.7 },
  { name: "Metal Fence 1", Sounds: "hash_b7e1088b", TuningParams: "hash_001b152f", MaxOcclusion: 0.7 },
  { name: "Metal Fence 2", Sounds: "hash_c5f4bC63", TuningParams: "hash_8c484a48", MaxOcclusion: 0.7 },
  { name: "Metal Light Door", Sounds: "hash_662e5b7d", TuningParams: "hash_7aa46069", MaxOcclusion: 0.7 },
  { name: "Hydraulic Door", Sounds: "hash_d5377a40", TuningParams: "hash_c85140b1", MaxOcclusion: 0.7 },
];

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

/** DoorAudioSettingsLink name: joaat of the door stem (without `d_`). Matches real DAT151 files. */
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
    // Pair DoorAudioSettings (`d_...`) with its DoorAudioSettingsLink name automatically.
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
