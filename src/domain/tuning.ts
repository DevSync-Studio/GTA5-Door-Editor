import {
  attrOf,
  blocksOf,
  insertBeforeClose,
  itemSpanAround,
  removeItemAround,
  setAttr,
  setText,
  textOf,
  validateXml,
} from "@/lib/xml";
import { CHECK_FIELDS, SCALAR_FIELDS } from "./constants";

export type Vec3 = { x: string; y: string; z: string };

export type TuningFields = {
  Flags: string;
  StdDoorRotDir: string;
  AutoOpenRadiusModifier: string;
  AutoOpenRate: string;
  AutoOpenCosineAngleBetweenThreshold: string;
  AutoOpenCloseRateTaper: string;
  UseAutoOpenTriggerBox: string;
  CustomTriggerBox: string;
  BreakableByVehicle: string;
  BreakingImpulse: string;
  ShouldLatchShut: string;
  MassMultiplier: string;
  WeaponImpulseMultiplier: string;
  RotationLimitAngle: string;
  TorqueAngularVelocityLimit: string;
  AutoOpenVolumeOffset: Vec3;
};

export type TuningEntry = {
  name: string;
  fields: TuningFields;
  box: { min: Vec3; max: Vec3 };
};

export type DoorMapping = {
  model: string;
  tuning: string;
};

export type TuningDocument = {
  tunings: TuningEntry[];
  maps: DoorMapping[];
};

function vec3(xml: string, tag: string): Vec3 {
  return {
    x: attrOf(xml, tag, "x"),
    y: attrOf(xml, tag, "y"),
    z: attrOf(xml, tag, "z"),
  };
}

function parseFields(tuningXml: string): TuningFields {
  const fields = {
    Flags: textOf(tuningXml, "Flags"),
    StdDoorRotDir: textOf(tuningXml, "StdDoorRotDir"),
    AutoOpenVolumeOffset: vec3(tuningXml, "AutoOpenVolumeOffset"),
  } as TuningFields;
  for (const key of [...SCALAR_FIELDS, ...CHECK_FIELDS]) {
    fields[key] = attrOf(tuningXml, key, "value");
  }
  return fields;
}

export function parseTuning(xml: string): TuningDocument {
  validateXml(xml, "CDoorTuningFile");
  const tunings: TuningEntry[] = [];
  const maps: DoorMapping[] = [];
  for (const raw of blocksOf(xml, "Item")) {
    if (raw.includes("<Tuning>")) {
      tunings.push({
        name: textOf(raw, "Name"),
        fields: parseFields(raw),
        box: { min: vec3(raw, "min"), max: vec3(raw, "max") },
      });
    } else {
      const model = textOf(raw, "ModelName") || textOf(raw, "Model");
      if (!model) continue;
      maps.push({
        model,
        tuning: textOf(raw, "TuningName") || textOf(raw, "Tune"),
      });
    }
  }
  return { tunings, maps };
}

export function updateTuningValues(
  xml: string,
  name: string,
  change: Partial<TuningFields>,
): string {
  const span = itemSpanAround(xml, `<Name>${name}</Name>`);
  if (!span) throw new Error("Tuning item was not found.");
  let block = span.raw;
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) continue;
    if (key === "AutoOpenVolumeOffset") {
      const offset = value as Vec3;
      for (const axis of ["x", "y", "z"] as const) {
        block = setAttr(block, "AutoOpenVolumeOffset", axis, offset[axis]);
      }
    } else if (key === "Flags" || key === "StdDoorRotDir") {
      block = setText(block, key, String(value));
    } else {
      block = setAttr(block, key, "value", String(value));
    }
  }
  return xml.slice(0, span.start) + block + xml.slice(span.end);
}

export function updateTriggerBox(
  xml: string,
  name: string,
  box: { min: Vec3; max: Vec3 },
): string {
  const span = itemSpanAround(xml, `<Name>${name}</Name>`);
  if (!span) throw new Error("Tuning item was not found.");
  let block = span.raw;
  for (const tag of ["min", "max"] as const) {
    for (const axis of ["x", "y", "z"] as const) {
      block = setAttr(block, tag, axis, box[tag][axis]);
    }
  }
  return xml.slice(0, span.start) + block + xml.slice(span.end);
}

export function newTuningItem(name: string): string {
  return `  <Item>
   <Name>${name}</Name>
   <Tuning>
    <AutoOpenVolumeOffset x="0" y="0" z="0" />
    <Flags />
    <AutoOpenRadiusModifier value="1" />
    <AutoOpenRate value="0.5" />
    <AutoOpenCosineAngleBetweenThreshold value="-1" />
    <AutoOpenCloseRateTaper value="true" />
    <UseAutoOpenTriggerBox value="true" />
    <CustomTriggerBox value="false" />
    <TriggerBoxMinMax>
     <min x="0" y="0" z="0" />
     <max x="0" y="0" z="0" />
    </TriggerBoxMinMax>
    <BreakableByVehicle value="false" />
    <BreakingImpulse value="0" />
    <ShouldLatchShut value="false" />
    <MassMultiplier value="1" />
    <WeaponImpulseMultiplier value="1" />
    <RotationLimitAngle value="0" />
    <TorqueAngularVelocityLimit value="5" />
    <StdDoorRotDir>StdDoorOpenBothDir</StdDoorRotDir>
   </Tuning>
  </Item>`;
}

export function appendTuning(xml: string, raw: string): string {
  return insertBeforeClose(xml, "</NamedTuningArray>", `\n${raw}\n `);
}

export function duplicateTuning(xml: string, oldName: string, newName: string): string {
  const span = itemSpanAround(xml, `<Name>${oldName}</Name>`);
  if (!span) throw new Error("Tuning item was not found.");
  const raw = span.raw.replace(`<Name>${oldName}</Name>`, `<Name>${newName}</Name>`);
  return appendTuning(xml, raw);
}

export function renameTuning(xml: string, oldName: string, newName: string): string {
  const span = itemSpanAround(xml, `<Name>${oldName}</Name>`);
  if (!span) throw new Error("Tuning item was not found.");
  const block = span.raw.replace(`<Name>${oldName}</Name>`, `<Name>${newName}</Name>`);
  const next = xml.slice(0, span.start) + block + xml.slice(span.end);
  return next.replaceAll(
    `<TuningName>${oldName}</TuningName>`,
    `<TuningName>${newName}</TuningName>`,
  );
}

export function removeTuning(xml: string, name: string, linkedModels: string[]): string {
  let next = removeItemAround(xml, `<Name>${name}</Name>`);
  for (const model of linkedModels) {
    try {
      next = removeItemAround(next, `<ModelName>${model}</ModelName>`);
    } catch {
      /* mapping already gone */
    }
  }
  return next;
}

export function setDoorMapping(xml: string, model: string, tuning: string): string {
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(
    `(<Item>\\s*<ModelName>${escaped}</ModelName>\\s*<TuningName>)[^<]*(</TuningName>\\s*</Item>)`,
  );
  if (rx.test(xml)) return xml.replace(rx, `$1${tuning}$2`);
  return insertBeforeClose(
    xml,
    "</ModelToTuneMapping>",
    `\n  <Item>\n   <ModelName>${model}</ModelName>\n   <TuningName>${tuning}</TuningName>\n  </Item>\n `,
  );
}

export function renameDoorModel(xml: string, oldModel: string, newModel: string): string {
  const point = xml.indexOf(`<ModelName>${oldModel}</ModelName>`);
  if (point < 0) throw new Error("Door mapping was not found.");
  return (
    xml.slice(0, point) +
    xml
      .slice(point)
      .replace(`<ModelName>${oldModel}</ModelName>`, `<ModelName>${newModel}</ModelName>`)
  );
}

export function removeDoorMapping(xml: string, model: string): string {
  return removeItemAround(xml, `<ModelName>${model}</ModelName>`);
}

export function extractRawItem(xml: string, marker: string): string {
  const span = itemSpanAround(xml, marker);
  if (!span) throw new Error("XML item was not found.");
  return span.raw;
}

export type MergeResult = {
  xml: string;
  addTunings: string[];
  addMaps: { model: string; tuning: string }[];
  conflicts: { model: string; existing: string; incoming: string; source?: string }[];
};

export function mergeTuningFiles(existingXml: string, incomingXml: string): MergeResult {
  const existing = parseTuning(existingXml);
  const incoming = parseTuning(incomingXml);
  const knownT = new Set(existing.tunings.map((t) => t.name));
  const knownM = new Map(existing.maps.map((m) => [m.model, m.tuning]));
  const addTunings = incoming.tunings.filter((t) => !knownT.has(t.name));
  const addMaps = incoming.maps.filter((m) => !knownM.has(m.model));
  const conflicts = incoming.maps
    .filter((m) => knownM.has(m.model) && knownM.get(m.model) !== m.tuning)
    .map((m) => ({
      model: m.model,
      existing: knownM.get(m.model) ?? "",
      incoming: m.tuning,
    }));

  let out = existingXml;
  if (addTunings.length) {
    const chunk =
      "\n  <!-- Merged by GTA5 Door Editor tool -->" +
      addTunings
        .map((t) => `\n  ${extractRawItem(incomingXml, `<Name>${t.name}</Name>`)}`)
        .join("") +
      "\n ";
    out = insertBeforeClose(out, "</NamedTuningArray>", chunk);
  }
  if (addMaps.length) {
    const chunk =
      "\n  <!-- Merged by GTA5 Door Editor tool -->" +
      addMaps
        .map((m) => `\n  ${extractRawItem(incomingXml, `<ModelName>${m.model}</ModelName>`)}`)
        .join("") +
      "\n ";
    out = insertBeforeClose(out, "</ModelToTuneMapping>", chunk);
  }
  return {
    xml: out,
    addTunings: addTunings.map((t) => t.name),
    addMaps,
    conflicts,
  };
}

export function mergeTuningFilesMany(
  existingXml: string,
  incoming: { name: string; text: string }[],
): MergeResult {
  let xml = existingXml;
  const addTunings: string[] = [];
  const addMaps: { model: string; tuning: string }[] = [];
  const conflicts: MergeResult["conflicts"] = [];
  const seenT = new Set<string>();
  const seenM = new Set<string>();

  for (const file of incoming) {
    const step = mergeTuningFiles(xml, file.text);
    xml = step.xml;
    for (const name of step.addTunings) {
      if (seenT.has(name)) continue;
      seenT.add(name);
      addTunings.push(name);
    }
    for (const map of step.addMaps) {
      if (seenM.has(map.model)) continue;
      seenM.add(map.model);
      addMaps.push(map);
    }
    for (const conflict of step.conflicts) {
      conflicts.push({ ...conflict, source: file.name });
    }
  }

  return { xml, addTunings, addMaps, conflicts };
}
