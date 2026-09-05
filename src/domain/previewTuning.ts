export type DoorMotionTuning = {
  rotationLimitAngle: number; // radians; 0 = default π/2
  rotDir: "both" | "neg" | "pos";
  tuningName: string;
  autoOpenRate: number;
  angularVelocityLimit: number;
  closeRateTaper: boolean;
};

type TuningSource = {
  maps: { model: string; tuning: string }[];
  tunings: {
    name: string;
    rotationLimitAngle: string;
    stdDoorRotDir: string;
    autoOpenRate: string;
    angularVelocityLimit: string;
    closeRateTaper: string;
  }[];
};

let source: TuningSource | null = null;
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  for (const listener of listeners) listener();
}

export function setPreviewTuningSource(next: TuningSource | null) {
  source = next;
  bump();
}

export function subscribePreviewTuning(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPreviewTuningVersion(): number {
  return version;
}

function parseRotDir(raw: string): DoorMotionTuning["rotDir"] {
  const s = raw.toLowerCase();
  if (s.includes("neg")) return "neg";
  if (s.includes("pos")) return "pos";
  return "both";
}

function parseFinite(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export function getDoorMotionTuning(modelName: string): DoorMotionTuning | null {
  if (!source || !modelName) return null;
  const want = modelName.toLowerCase();
  const map = source.maps.find((m) => m.model.toLowerCase() === want);
  if (!map) return null;
  const tune = source.tunings.find((t) => t.name.toLowerCase() === map.tuning.toLowerCase());
  if (!tune) return null;
  return {
    rotationLimitAngle: parseFinite(tune.rotationLimitAngle, 0),
    rotDir: parseRotDir(tune.stdDoorRotDir || ""),
    tuningName: tune.name,
    autoOpenRate: Math.max(parseFinite(tune.autoOpenRate, 0.5), 0.05),
    angularVelocityLimit: Math.max(parseFinite(tune.angularVelocityLimit, 5), 0.05),
    closeRateTaper: parseBool(tune.closeRateTaper),
  };
}

/** Preview open/close loop seconds. rate 0.5 + ω 5 → 3.6s. */
export function previewCyclePeriodSec(tuning: DoorMotionTuning | null): number {
  const rate = tuning?.autoOpenRate ?? 0.5;
  const angVel = tuning?.angularVelocityLimit ?? 5;
  const period = 3.6 * (0.5 / Math.max(rate, 0.05)) * (5 / Math.max(angVel, 0.05));
  return Math.min(Math.max(period, 1.0), 18);
}

/** CodeWalker JenkHash.GenHash - does not force lowercase. */
export function jenkHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash + input.charCodeAt(i)) >>> 0;
    hash = (hash + ((hash << 10) >>> 0)) >>> 0;
    hash ^= hash >>> 6;
  }
  hash = (hash + ((hash << 3) >>> 0)) >>> 0;
  hash ^= hash >>> 11;
  hash = (hash + ((hash << 15) >>> 0)) >>> 0;
  return hash >>> 0;
}

export function parseHashLabel(name: string): number | null {
  const m = name.trim().match(/^hash[_:]([0-9a-fA-F]+)$/i);
  if (!m) return null;
  return Number.parseInt(m[1], 16) >>> 0;
}

export function namesMatchHashOrString(
  expected: string,
  candidateStem: string,
  previewName?: string,
): boolean {
  const want = expected.trim();
  const stem = candidateStem.trim();
  if (!want || !stem) return false;
  if (want.toLowerCase() === stem.toLowerCase()) return true;
  if (previewName && want.toLowerCase() === previewName.toLowerCase()) return true;

  const hash = parseHashLabel(want);
  if (hash != null) {
    if ((jenkHash(stem) >>> 0) === hash) return true;
    if ((jenkHash(stem.toLowerCase()) >>> 0) === hash) return true;
    if (previewName) {
      if ((jenkHash(previewName) >>> 0) === hash) return true;
      if ((jenkHash(previewName.toLowerCase()) >>> 0) === hash) return true;
    }
  }
  return false;
}
