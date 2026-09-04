import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Move3D, Focus, Pause, Play, RotateCcw, Upload, X } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";
import { useNativePathDrop } from "@/hooks/useNativeDrop";
import { toast } from "@/lib/toast";
import { DOOR_TYPES } from "@/domain/constants";
import {
  getDoorMotionTuning,
  getPreviewTuningVersion,
  namesMatchHashOrString,
  parseHashLabel,
  subscribePreviewTuning,
  type DoorMotionTuning,
} from "@/domain/previewTuning";
import {
  parseYdrMesh,
  parseYdrMeshPath,
  parseYtdTextures,
  parseYtdTexturesPath,
  type PreviewTexture,
  type YdrPreview,
} from "@/lib/files";
import { cn } from "@/lib/utils";

/**
 * GTA door physics pivots on the drawable origin (set in DCC), not the mesh AABB.
 *   7  Normal  - origin at hinge; rotate around up (GTA Z → Three Y)
 *   5  Garage  - origin at bottom center; rotate 90° up around local X
 *   8  Sliding - origin at bottom corner; translate along local X
 *  10  Vert.   - origin at bottom; translate along local up
 *   9/12 Barrier - origin at post; raise arm ~90° around local Z
 */

function isYdrPath(path: string): boolean {
  return /\.ydr$/i.test(path);
}

function isYtdPath(path: string): boolean {
  return /\.ytd$/i.test(path);
}

function fileStem(pathOrName: string): string {
  const base = pathOrName.replace(/^.*[/\\]/, "");
  return base.replace(/\.(ydr|ytd)$/i, "");
}

function matchesYdrName(expected: string, fileLabel: string, previewName?: string): boolean {
  return namesMatchHashOrString(expected, fileStem(fileLabel), previewName);
}

/**
 * YTD dictionaries often use suffixes: `model+hidr.ytd`, `model_hi.ytd`, etc.
 * Accept exact stem or stem + `+` / `_` suffix. Hash archetypes: any .ytd once mesh is up,
 * or YTD stem whose jenk matches the hash label.
 */
function matchesYtdName(expected: string, fileLabel: string, allowAnyIfHash = false): boolean {
  const want = expected.trim();
  if (!want) return false;
  if (parseHashLabel(want) != null) {
    if (allowAnyIfHash) return true;
    return namesMatchHashOrString(want, fileStem(fileLabel));
  }
  const stem = fileStem(fileLabel).toLowerCase();
  const base = want.toLowerCase();
  return stem === base || stem.startsWith(`${base}+`) || stem.startsWith(`${base}_`);
}

function matchesDropName(expected: string, fileLabel: string): boolean {
  if (isYtdPath(fileLabel)) return matchesYtdName(expected, fileLabel, true);
  if (isYdrPath(fileLabel)) return matchesYdrName(expected, fileLabel);
  return false;
}

function openAngleRad(tuning: DoorMotionTuning | null): number {
  const raw = tuning?.rotationLimitAngle ?? 0;
  // doortuning uses 0 as "default"; game doors typically swing ~90°.
  if (!raw || raw <= 0) return Math.PI / 2;
  // Values are usually radians; if someone stored degrees (> 2π), convert.
  return raw > Math.PI * 2 + 0.01 ? (raw * Math.PI) / 180 : raw;
}

function dirSign(tuning: DoorMotionTuning | null, amount: number): number {
  const dir = tuning?.rotDir ?? "pos";
  if (dir === "neg") return -amount;
  if (dir === "both") {
    // Preview positive half-cycle; real both-dir is physics-driven.
    return amount;
  }
  return amount;
}

function bytesToPreview(file: File): Promise<YdrPreview> {
  return file.arrayBuffer().then((buf) => parseYdrMesh(new Uint8Array(buf)));
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function mergeTextures(into: PreviewTexture[], extra: PreviewTexture[]): PreviewTexture[] {
  const next = [...into];
  for (const tex of extra) {
    const idx = next.findIndex((t) => t.name.toLowerCase() === tex.name.toLowerCase());
    if (idx >= 0) {
      if (next[idx].source === "embedded" && tex.source === "ytd") next[idx] = tex;
    } else {
      next.push(tex);
    }
  }
  return next;
}

function textureStatus(preview: YdrPreview): string {
  const n = preview.textures.length;
  const gen9 = preview.gen9 ? " · Gen9" : "";
  if (n === 0) {
    return preview.missingDiffuse
      ? `Missing textures - drop .ytd${gen9}`
      : `No textures - drop matching .ytd${gen9}`;
  }
  const emb = preview.hasEmbeddedTextures;
  const ytd = preview.textures.some((t) => t.source === "ytd");
  const miss = preview.missingDiffuse ? " · some missing" : "";
  if (emb && ytd) return `${n} tex · embedded + YTD${gen9}${miss}`;
  if (emb) return `${n} tex · embedded${gen9}${miss}`;
  if (ytd) return `${n} tex · YTD${gen9}${miss}`;
  return `${n} textures${gen9}${miss}`;
}

function doorEase(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

type Extent = {
  min: THREE.Vector3;
  max: THREE.Vector3;
  size: THREE.Vector3;
};

type DoorMotion = {
  short: string;
  apply: (
    pivot: THREE.Object3D,
    amount: number,
    ext: Extent,
    tuning: DoorMotionTuning | null,
  ) => void;
};

function extentAlong(min: number, max: number, preferPositive: boolean): number {
  const pos = Math.max(0, max);
  const neg = Math.max(0, -min);
  if (preferPositive) return pos > 1e-4 ? pos : neg;
  return neg > 1e-4 ? neg : pos;
}

function doorMotionFor(specialAttribute: string): DoorMotion {
  switch (specialAttribute) {
    case "5":
      return {
        short: "Garage · up (origin hinge)",
        apply: (pivot, amount, _ext, tuning) => {
          pivot.position.set(0, 0, 0);
          pivot.rotation.set(-dirSign(tuning, amount) * openAngleRad(tuning), 0, 0);
        },
      };
    case "8":
      return {
        short: "Sliding · +X (origin corner)",
        apply: (pivot, amount, ext, tuning) => {
          const travel = extentAlong(ext.min.x, ext.max.x, (tuning?.rotDir ?? "pos") !== "neg");
          const signed =
            (tuning?.rotDir ?? "pos") === "neg" ? -amount * travel : amount * travel;
          pivot.rotation.set(0, 0, 0);
          pivot.position.set(signed, 0, 0);
        },
      };
    case "10":
      return {
        short: "Sliding vertical · +Y",
        apply: (pivot, amount, ext) => {
          const travel = extentAlong(ext.min.y, ext.max.y, true);
          pivot.rotation.set(0, 0, 0);
          pivot.position.set(0, amount * travel, 0);
        },
      };
    case "9":
    case "12":
      return {
        short: specialAttribute === "12" ? "Rail · raise" : "Barrier · raise",
        apply: (pivot, amount, _ext, tuning) => {
          pivot.position.set(0, 0, 0);
          pivot.rotation.set(0, 0, -dirSign(tuning, amount) * openAngleRad(tuning));
        },
      };
    case "7":
    default:
      return {
        short: "Normal · yaw (origin hinge)",
        apply: (pivot, amount, _ext, tuning) => {
          pivot.position.set(0, 0, 0);
          pivot.rotation.set(0, dirSign(tuning, amount) * openAngleRad(tuning), 0);
        },
      };
  }
}

function cycleAmount(elapsed: number, periodSec: number): number {
  const u = (elapsed % periodSec) / periodSec;
  if (u < 0.08) return 0;
  if (u < 0.5) return doorEase((u - 0.08) / 0.42);
  if (u < 0.58) return 1;
  return doorEase(1 - (u - 0.58) / 0.42);
}

function YdrCanvas({
  preview,
  specialAttribute,
  playing,
  frameNonce,
  motionTuning,
}: {
  preview: YdrPreview;
  specialAttribute: string;
  playing: boolean;
  frameNonce: number;
  motionTuning: DoorMotionTuning | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const attrRef = useRef(specialAttribute);
  const playingRef = useRef(playing);
  const tuningRef = useRef(motionTuning);
  const frameRef = useRef<() => void>(() => undefined);
  attrRef.current = specialAttribute;
  playingRef.current = playing;
  tuningRef.current = motionTuning;

  useEffect(() => {
    frameRef.current();
  }, [frameNonce]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const width = host.clientWidth || 640;
    const height = host.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c10);

    const camera = new THREE.PerspectiveCamera(45, width / Math.max(height, 1), 0.05, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.HemisphereLight(0xdde7ff, 0x1a1c22, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9eb6ff, 0.35);
    fill.position.set(-3, 1, -2);
    scene.add(fill);

    const textureCache = new Map<string, THREE.Texture>();
    const disposeTextures = () => {
      for (const tex of textureCache.values()) tex.dispose();
      textureCache.clear();
    };

    const getMap = (name: string | null | undefined): THREE.Texture | null => {
      let src =
        (name && preview.textures.find((t) => t.name.toLowerCase() === name.toLowerCase())) ||
        (preview.textures.length === 1 ? preview.textures[0] : undefined);
      if (!src) return null;
      const key = src.name.toLowerCase();
      const hit = textureCache.get(key);
      if (hit) return hit;
      try {
        const data = b64ToBytes(src.rgbaBase64);
        const tex = new THREE.DataTexture(data, src.width, src.height, THREE.RGBAFormat);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        textureCache.set(key, tex);
        return tex;
      } catch {
        /* Corrupt / truncated texture payload - skip map, keep untextured mesh. */
        return null;
      }
    };

    const materials: THREE.Material[] = [];
    const pivot = new THREE.Group();
    const mesh = new THREE.Group();

    for (const part of preview.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(part.positions, 3));
      if (part.uvs && part.uvs.length >= (part.positions.length / 3) * 2) {
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(part.uvs, 2));
      }
      geometry.setIndex(part.indices);
      geometry.computeVertexNormals();

      const map = getMap(part.diffuseName);
      const material = map
        ? new THREE.MeshStandardMaterial({
            map,
            metalness: 0.05,
            roughness: 0.85,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xb7c0cc,
            metalness: 0.12,
            roughness: 0.68,
            side: THREE.DoubleSide,
          });
      materials.push(material);
      mesh.add(new THREE.Mesh(geometry, material));
    }

    pivot.add(mesh);
    scene.add(pivot);

    const box = new THREE.Box3().setFromObject(mesh);
    const ext: Extent = {
      min: box.min.clone(),
      max: box.max.clone(),
      size: box.getSize(new THREE.Vector3()),
    };
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(ext.size.x, ext.size.y, ext.size.z, 0.01);
    const fit = maxDim * 2.05;

    const applyFraming = () => {
      camera.position.set(center.x + fit, center.y + fit * 0.7, center.z + fit);
      controls.target.copy(center);
      controls.minDistance = maxDim * 0.35;
      controls.maxDistance = maxDim * 6;
      controls.update();
    };
    applyFraming();
    frameRef.current = applyFraming;

    const grid = new THREE.GridHelper(Math.max(maxDim * 4, 2), 16, 0x343a46, 0x1c2028);
    grid.position.set(center.x, ext.min.y - 0.01, center.z);
    scene.add(grid);

    const axisLen = Math.max(maxDim * 0.18, 0.12);
    scene.add(new THREE.AxesHelper(axisLen));

    const originDot = new THREE.Mesh(
      new THREE.SphereGeometry(axisLen * 0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
    );
    scene.add(originDot);

    const clock = new THREE.Clock();
    let animTime = 0;
    let frozenAmount = 0;
    let frame = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = clock.getDelta();
      const motion = doorMotionFor(attrRef.current);

      if (playingRef.current) {
        animTime += dt;
        frozenAmount = cycleAmount(animTime, 3.6);
      }

      pivot.position.set(0, 0, 0);
      pivot.rotation.set(0, 0, 0);
      motion.apply(pivot, frozenAmount, ext, tuningRef.current);

      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = host.clientWidth || width;
      const h = host.clientHeight || height;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      originDot.geometry.dispose();
      (originDot.material as THREE.Material).dispose();
      for (const mat of materials) mat.dispose();
      disposeTextures();
      mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [preview]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-md border border-white/8 bg-black/45 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/75 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function YdrPreviewPanel({
  modelName,
  specialAttribute,
  isActive = true,
}: {
  modelName: string;
  specialAttribute: string;
  isActive?: boolean;
}) {
  const [preview, setPreview] = useState<YdrPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [frameNonce, setFrameNonce] = useState(0);
  const [tuningEpoch, setTuningEpoch] = useState(getPreviewTuningVersion);
  const inputRef = useRef<HTMLInputElement>(null);
  const depthRef = useRef(0);
  const modelNameRef = useRef(modelName);
  const cacheRef = useRef(new Map<string, YdrPreview | null>());
  modelNameRef.current = modelName;

  useEffect(() => subscribePreviewTuning(() => setTuningEpoch(getPreviewTuningVersion())), []);

  useEffect(() => {
    const cached = cacheRef.current.get(modelName);
    setPreview(cached ?? null);
    setPlaying(true);
    setFrameNonce((n) => n + 1);
    setDragging(false);
    depthRef.current = 0;
  }, [modelName]);

  const motion = doorMotionFor(specialAttribute);
  const typeLabel = DOOR_TYPES[specialAttribute] ?? "Door";
  const displayName = preview?.name || modelName;
  const expectedYdr = `${modelName}.ydr`;
  const expectedYtdHint = `${modelName}.ytd / ${modelName}+hidr.ytd`;
  const canMatchByFilename = parseHashLabel(modelName) == null;
  const motionTuning = getDoorMotionTuning(modelName);
  void tuningEpoch; // re-render when Tuning workspace updates the lookup

  const rejectWrongModel = useCallback((got: string, kind: "ydr" | "ytd") => {
    toast(
      kind === "ydr"
        ? canMatchByFilename
          ? `Wrong YDR - use ${expectedYdr} (got ${got}).`
          : `Wrong YDR - name must match ${modelName}.`
        : `Wrong YTD - use ${modelName}.ytd or ${modelName}+....ytd (got ${got}).`,
      true,
    );
  }, [canMatchByFilename, expectedYdr, modelName]);

  const applyPreview = useCallback((next: YdrPreview) => {
    const key = modelNameRef.current;
    cacheRef.current.set(key, next);
    setPreview(next);
    setPlaying(true);
    setFrameNonce(0);
    const texNote =
      next.textures.length > 0
        ? ` · ${next.textures.length} texture${next.textures.length === 1 ? "" : "s"}`
        : " · no textures (drop .ytd if external)";
    toast(`Loaded ${next.name}${texNote}`, "info");
  }, []);

  const applyYtd = useCallback((extra: PreviewTexture[]) => {
    setPreview((prev) => {
      if (!prev) {
        toast("Import the .ydr first, then the .ytd.", true);
        return prev;
      }
      const textures = mergeTextures(prev.textures, extra);
      const missingDiffuse = prev.meshes.some((m) => {
        const name = m.diffuseName;
        if (!name) return false;
        return !textures.some((t) => t.name.toLowerCase() === name.toLowerCase());
      });
      const next = {
        ...prev,
        textures,
        missingDiffuse,
        hasEmbeddedTextures: prev.hasEmbeddedTextures,
      };
      cacheRef.current.set(modelNameRef.current, next);
      toast(`Loaded ${extra.length} texture${extra.length === 1 ? "" : "s"} from YTD`, "info");
      return next;
    });
  }, []);

  const clearPreview = useCallback(() => {
    cacheRef.current.set(modelNameRef.current, null);
    setPreview(null);
  }, []);

  const loadBrowserFiles = useCallback(
    async (files: File[]) => {
      const list = Array.from(files);
      const ydr = list.find((f) => isYdrPath(f.name));
      const ytds = list.filter((f) => isYtdPath(f.name));
      if (!ydr && ytds.length === 0) {
        toast("Drop a .ydr and/or matching .ytd.", true);
        return;
      }

      setLoading(true);
      try {
        if (ydr) {
          if (!matchesYdrName(modelNameRef.current, ydr.name)) {
            rejectWrongModel(ydr.name, "ydr");
            return;
          }
          const next = await bytesToPreview(ydr);
          if (!matchesYdrName(modelNameRef.current, ydr.name, next.name)) {
            rejectWrongModel(next.name || ydr.name, "ydr");
            return;
          }
          let textures = next.textures;
          for (const ytd of ytds) {
            if (!matchesYtdName(modelNameRef.current, ytd.name, true)) {
              rejectWrongModel(ytd.name, "ytd");
              continue;
            }
            const bytes = new Uint8Array(await ytd.arrayBuffer());
            textures = mergeTextures(textures, await parseYtdTextures(bytes));
          }
          applyPreview({
            ...next,
            textures,
            missingDiffuse: next.meshes.some((m) => {
              const name = m.diffuseName;
              if (!name) return false;
              return !textures.some((t) => t.name.toLowerCase() === name.toLowerCase());
            }),
          });
          return;
        }

        for (const ytd of ytds) {
          if (!matchesYtdName(modelNameRef.current, ytd.name, true)) {
            rejectWrongModel(ytd.name, "ytd");
            continue;
          }
          const bytes = new Uint8Array(await ytd.arrayBuffer());
          applyYtd(await parseYtdTextures(bytes));
        }
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not parse file", true);
      } finally {
        setLoading(false);
      }
    },
    [applyPreview, applyYtd, rejectWrongModel],
  );

  const loadNativePaths = useCallback(
    async (paths: string[]) => {
      const ydr = paths.find(isYdrPath);
      const ytds = paths.filter(isYtdPath);
      if (!ydr && ytds.length === 0) {
        toast("Drop a .ydr and/or matching .ytd.", true);
        return;
      }

      setLoading(true);
      try {
        if (ydr) {
          if (!matchesYdrName(modelNameRef.current, ydr)) {
            rejectWrongModel(fileStem(ydr) + ".ydr", "ydr");
            return;
          }
          const next = await parseYdrMeshPath(ydr);
          if (!matchesYdrName(modelNameRef.current, ydr, next.name)) {
            rejectWrongModel(next.name || fileStem(ydr) + ".ydr", "ydr");
            return;
          }
          let textures = next.textures;
          for (const ytd of ytds) {
            if (!matchesYtdName(modelNameRef.current, ytd, true)) {
              rejectWrongModel(fileStem(ytd) + ".ytd", "ytd");
              continue;
            }
            textures = mergeTextures(textures, await parseYtdTexturesPath(ytd));
          }
          applyPreview({ ...next, textures });
          return;
        }

        for (const ytd of ytds) {
          if (!matchesYtdName(modelNameRef.current, ytd, true)) {
            rejectWrongModel(fileStem(ytd) + ".ytd", "ytd");
            continue;
          }
          applyYtd(await parseYtdTexturesPath(ytd));
        }
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not parse file", true);
      } finally {
        setLoading(false);
      }
    },
    [applyPreview, applyYtd, rejectWrongModel],
  );

  useNativePathDrop({
    enabled: isActive,
    accept: (path) => isYdrPath(path) || isYtdPath(path),
    hoverAccept: (path) =>
      (isYdrPath(path) || isYtdPath(path)) && matchesDropName(modelNameRef.current, path),
    onDrop: (paths) => void loadNativePaths(paths),
    onHover: setDragging,
  });

  return (
    <section
      className={cn(
        "flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border bg-panel/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-[border-color,box-shadow] duration-150",
        dragging
          ? "border-primary shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
          : "border-line-soft",
      )}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line-soft px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="m-0 text-[13px] font-semibold tracking-tight text-bright">Preview</h3>
            {preview ? (
              <span className="truncate font-mono text-[11px] text-faint">{displayName}</span>
            ) : null}
          </div>
          {!preview ? (
            <p className="m-0 mt-0.5 truncate text-[11px] text-faint">
              Only accepts{" "}
              <span className="font-mono text-muted-foreground">{expectedYdr}</span>
              {" + "}
              <span className="font-mono text-muted-foreground">{expectedYtdHint}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {preview ? (
            <div className="mr-1 flex items-center rounded-lg border border-line-soft bg-panel-2/60 p-0.5">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                title={playing ? "Pause" : "Play"}
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? (
                  <Pause className="size-3.5" strokeWidth={1.75} />
                ) : (
                  <Play className="size-3.5" strokeWidth={1.75} />
                )}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                title="Reset camera"
                aria-label="Reset camera"
                onClick={() => setFrameNonce((n) => n + 1)}
              >
                <Focus className="size-3.5" strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                title="Clear model"
                aria-label="Clear model"
                onClick={clearPreview}
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </Button>
            </div>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            className="gap-1.5"
            onClick={() => inputRef.current?.click()}
          >
            {loading ? (
              <RotateCcw className="size-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Upload className="size-3.5" strokeWidth={1.75} />
            )}
            {loading ? "Loading..." : preview ? "Replace" : "Import"}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "relative min-h-[260px] flex-1 overflow-hidden",
          dragging && "ring-2 ring-inset ring-primary/40",
        )}
        onDragEnter={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          depthRef.current += 1;
          setDragging(true);
        }}
        onDragLeave={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          depthRef.current = Math.max(0, depthRef.current - 1);
          if (depthRef.current === 0) setDragging(false);
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          depthRef.current = 0;
          setDragging(false);
          const files = Array.from(event.dataTransfer.files);
          if (files.length > 0) void loadBrowserFiles(files);
        }}
      >
        {preview ? (
          <>
            <YdrCanvas
              preview={preview}
              specialAttribute={specialAttribute}
              playing={playing && isActive}
              frameNonce={frameNonce}
              motionTuning={motionTuning}
            />

            {dragging ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/15 backdrop-blur-[1px]">
                <p className="m-0 rounded-lg border border-primary/40 bg-panel/90 px-4 py-2 text-[13px] font-medium text-primary">
                  Drop {expectedYdr} + {modelName}+hidr.ytd
                </p>
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                <Chip className="border-primary/25 bg-primary/15 text-primary">
                  {typeLabel}
                  <span className="ml-1 opacity-60">({specialAttribute})</span>
                </Chip>
                <Chip>{motion.short}</Chip>
                <Chip>{textureStatus(preview)}</Chip>
                {motionTuning ? (
                  <Chip>
                    Tuning · {motionTuning.tuningName}
                    {motionTuning.rotationLimitAngle > 0
                      ? ` · ${(motionTuning.rotationLimitAngle * (180 / Math.PI)).toFixed(0)}°`
                      : " · 90° def"}
                  </Chip>
                ) : (
                  <Chip>No doortuning linked</Chip>
                )}
                {!playing ? <Chip className="text-warning">Paused</Chip> : null}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3">
              <div className="flex items-center gap-2 rounded-md border border-white/8 bg-black/45 px-2 py-1 text-[10px] text-white/65 backdrop-blur-sm">
                <span className="inline-block size-1.5 rounded-full bg-[#ffcc66]" />
                Origin / hinge
                <span className="mx-0.5 text-white/25">·</span>
                <span className="text-[#ff6b6b]">X</span>
                <span className="text-[#69db7c]">Y</span>
                <span className="text-[#74c0fc]">Z</span>
              </div>
              <div className="rounded-md border border-white/8 bg-black/45 px-2 py-1 text-[10px] text-white/45 backdrop-blur-sm">
                Select both · {expectedYdr} · {modelName}+hidr.ytd
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            className={cn(
              "group flex h-full min-h-[260px] w-full flex-col items-center justify-center gap-4 px-6 text-center transition-colors",
              dragging
                ? "bg-primary/10"
                : "bg-[radial-gradient(ellipse_at_center,rgba(36,40,52,0.55)_0%,transparent_70%)] hover:bg-panel-2/30",
            )}
            onClick={() => inputRef.current?.click()}
          >
            <div
              className={cn(
                "flex size-14 items-center justify-center rounded-2xl border border-dashed transition-colors",
                dragging
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-line-soft bg-panel-2/40 text-faint group-hover:border-white/20 group-hover:text-muted-foreground",
              )}
            >
              <Move3D className="size-6" strokeWidth={1.5} />
            </div>
            <div className="space-y-1.5">
              <p className="m-0 text-[13px] font-medium text-bright">
                {dragging
                  ? `Drop ${expectedYdr} and/or ${modelName}+hidr.ytd`
                  : `Import ${expectedYdr}`}
              </p>
              <p className="m-0 max-w-[340px] text-[11px] leading-relaxed text-faint">
                Multi-select the .ydr and .ytd together, or drop both. Names like{" "}
                {modelName}+hidr.ytd are accepted. Sibling YTDs auto-load from disk.
              </p>
            </div>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".ydr,.ytd"
        multiple
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) void loadBrowserFiles(files);
        }}
      />
    </section>
  );
}
