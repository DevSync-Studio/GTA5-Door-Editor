import { isYtypDoorFlagsPreset, ytypDoorFlagsForType } from "@/domain/constants";
import { attrOf, blocksOf, itemSpanAround, setAttr, textOf, validateXml } from "@/lib/xml";

export type Archetype = {
  name: string;
  specialAttribute: string;
  flags: string;
  useFlags: boolean;
};

export function parseYtyp(xml: string): Archetype[] {
  validateXml(xml, "CMapTypes");
  return blocksOf(xml, "Item")
    .filter((raw) => raw.includes("<specialAttribute"))
    .map((raw) => {
      const specialAttribute = attrOf(raw, "specialAttribute", "value");
      const flagsRaw = attrOf(raw, "flags", "value");
      const flagsNum = Number.parseInt(flagsRaw, 10);
      const flags = Number.isFinite(flagsNum) ? String(flagsNum) : "0";
      return {
        name: textOf(raw, "name") || textOf(raw, "assetName"),
        specialAttribute,
        flags,
        useFlags: isYtypDoorFlagsPreset(Number.parseInt(flags, 10) || 0),
      };
    });
}

export function updateSpecialAttribute(xml: string, name: string, value: string): string {
  const span = itemSpanAround(xml, `<name>${name}</name>`, "<Item");
  if (!span) throw new Error("Archetype item was not found.");
  const next = setAttr(span.raw, "specialAttribute", "value", value);
  return xml.slice(0, span.start) + next + xml.slice(span.end);
}

export function updateArchetypeFlags(xml: string, name: string, value: string): string {
  const span = itemSpanAround(xml, `<name>${name}</name>`, "<Item");
  if (!span) throw new Error("Archetype item was not found.");
  let raw = span.raw;
  if (/<flags\b/i.test(raw)) {
    raw = setAttr(raw, "flags", "value", value);
  } else if (/<specialAttribute\b[^>]*\/>/.test(raw)) {
    raw = raw.replace(
      /(<specialAttribute\b[^>]*\/>)/i,
      `$1\n   <flags value="${value}" />`,
    );
  } else {
    throw new Error("Could not write flags for this archetype.");
  }
  return xml.slice(0, span.start) + raw + xml.slice(span.end);
}

export function applyDoorTypeChange(
  xml: string,
  item: Archetype,
  specialAttribute: string,
): { xml: string; item: Archetype } {
  let nextXml = updateSpecialAttribute(xml, item.name, specialAttribute);
  let flags = item.flags;
  let useFlags = item.useFlags;
  if (useFlags) {
    flags = String(ytypDoorFlagsForType(specialAttribute));
    nextXml = updateArchetypeFlags(nextXml, item.name, flags);
  }
  return {
    xml: nextXml,
    item: { ...item, specialAttribute, flags, useFlags },
  };
}

export function applyUseFlagsChange(
  xml: string,
  item: Archetype,
  useFlags: boolean,
  baselineFlags: string,
): { xml: string; item: Archetype } {
  if (useFlags) {
    const flags = String(ytypDoorFlagsForType(item.specialAttribute));
    return {
      xml: updateArchetypeFlags(xml, item.name, flags),
      item: { ...item, useFlags: true, flags },
    };
  }
  return {
    xml: updateArchetypeFlags(xml, item.name, baselineFlags),
    item: { ...item, useFlags: false, flags: baselineFlags },
  };
}
