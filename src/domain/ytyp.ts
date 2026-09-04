import { attrOf, blocksOf, itemSpanAround, setAttr, textOf, validateXml } from "@/lib/xml";

export type Archetype = {
  name: string;
  specialAttribute: string;
};

export function parseYtyp(xml: string): Archetype[] {
  validateXml(xml, "CMapTypes");
  return blocksOf(xml, "Item")
    .filter((raw) => raw.includes("<specialAttribute"))
    .map((raw) => ({
      name: textOf(raw, "name") || textOf(raw, "assetName"),
      specialAttribute: attrOf(raw, "specialAttribute", "value"),
    }));
}

export function updateSpecialAttribute(xml: string, name: string, value: string): string {
  const span = itemSpanAround(xml, `<name>${name}</name>`, "<Item");
  if (!span) throw new Error("Archetype item was not found.");
  const next = setAttr(span.raw, "specialAttribute", "value", value);
  return xml.slice(0, span.start) + next + xml.slice(span.end);
}
