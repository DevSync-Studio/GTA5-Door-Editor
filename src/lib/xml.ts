export function validateXml(xml: string, root: string): void {
  if (!/^\s*<\?xml|^\s*</.test(xml) || !xml.includes(`<${root}`)) {
    const messages: Record<string, string> = {
      CDoorTuningFile: "Not a doortuning XML file.",
      CMapTypes: "Not a YTYP XML file.",
    };
    throw new Error(messages[root] ?? "Invalid XML for this tool.");
  }
}

export function textOf(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match?.[1]?.trim() ?? "";
}

export function attrOf(xml: string, tag: string, name: string): string {
  const match = xml.match(
    new RegExp(`<${tag}\\b[^>]*\\b${name}=["']([^"']*)`),
  );
  return match?.[1] ?? "";
}

export function setAttr(
  xml: string,
  tag: string,
  name: string,
  value: string,
): string {
  return xml.replace(
    new RegExp(`(<${tag}\\b[^>]*\\b${name}=["'])[^"']*(["'][^>]*\\/?>)`),
    `$1${value}$2`,
  );
}

export function setText(xml: string, tag: string, value: string): string {
  const openClose = new RegExp(`(<${tag}\\b[^>]*>)[\\s\\S]*?(</${tag}>)`);
  if (openClose.test(xml)) {
    return xml.replace(openClose, `$1${value}$2`);
  }
  const selfClosing = new RegExp(`<${tag}\\b([^>]*?)\\s*/>`);
  if (selfClosing.test(xml)) {
    return xml.replace(selfClosing, `<${tag}$1>${value}</${tag}>`);
  }
  return xml;
}

export function blocksOf(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "g")) ?? [];
}

export function itemSpanAround(
  xml: string,
  marker: string,
  open = "<Item>",
): { start: number; end: number; raw: string } | null {
  const point = xml.indexOf(marker);
  if (point < 0) return null;
  const start = xml.lastIndexOf(open, point);
  const close = xml.indexOf("</Item>", point);
  if (start < 0 || close < 0) return null;
  const end = close + 7;
  return { start, end, raw: xml.slice(start, end) };
}

export function replaceItemAround(
  xml: string,
  marker: string,
  next: string,
  open = "<Item>",
): string {
  const span = itemSpanAround(xml, marker, open);
  if (!span) throw new Error("Matching XML item was not found.");
  return xml.slice(0, span.start) + next + xml.slice(span.end);
}

export function insertBeforeClose(xml: string, closeTag: string, chunk: string): string {
  const point = xml.indexOf(closeTag);
  if (point < 0) throw new Error(`${closeTag.replace(/[<>/]/g, "")} was not found.`);
  const before = xml.slice(0, point).replace(/\s+$/, "") + "\n";
  const body = chunk.replace(/^[\r\n]+/, "").replace(/\s+$/, "") + "\n";
  return before + body + xml.slice(point);
}

export function removeItemAround(
  xml: string,
  marker: string,
  open = "<Item>",
): string {
  const span = itemSpanAround(xml, marker, open);
  if (!span) throw new Error("Matching XML item was not found.");
  let { start, end } = span;
  if (xml[end] === "\r") end += 1;
  if (xml[end] === "\n") end += 1;
  while (start > 0 && (xml[start - 1] === " " || xml[start - 1] === "\t")) start -= 1;
  if (start > 0 && xml[start - 1] === "\n") {
    start -= 1;
    if (start > 0 && xml[start - 1] === "\r") start -= 1;
  }
  return xml.slice(0, start) + xml.slice(end);
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
