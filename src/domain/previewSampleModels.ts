const sampleUrls = import.meta.glob("../assets/preview-doors/*/*.{ydr,ytd,yft}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type PreviewSampleUrls = {
  meshUrl: string;
  ytdUrl?: string;
};

function parseAssetKey(key: string): { attr: string; file: string } | null {
  const normalized = key.replace(/\\/g, "/");
  const match = normalized.match(/preview-doors\/(\d+)\/([^/]+)$/i);
  if (!match) return null;
  return { attr: match[1], file: match[2] };
}

export function getPreviewSampleUrls(specialAttribute: string): PreviewSampleUrls | null {
  const attr = specialAttribute.trim();
  if (!attr) return null;

  let meshUrl: string | undefined;
  let ytdUrl: string | undefined;

  for (const [key, url] of Object.entries(sampleUrls)) {
    const parsed = parseAssetKey(key);
    if (!parsed || parsed.attr !== attr) continue;
    if (/\.(ydr|yft)$/i.test(parsed.file)) meshUrl = url;
    else if (/\.ytd$/i.test(parsed.file)) ytdUrl = url;
  }

  return meshUrl ? { meshUrl, ytdUrl } : null;
}

export function hasPreviewSample(specialAttribute: string): boolean {
  return getPreviewSampleUrls(specialAttribute) != null;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load sample (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadPreviewSampleBytes(
  specialAttribute: string,
): Promise<{ mesh: Uint8Array; ytd?: Uint8Array } | null> {
  const urls = getPreviewSampleUrls(specialAttribute);
  if (!urls) return null;
  const mesh = await fetchBytes(urls.meshUrl);
  const ytd = urls.ytdUrl ? await fetchBytes(urls.ytdUrl) : undefined;
  return { mesh, ytd };
}
