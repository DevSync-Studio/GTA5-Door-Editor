export const WORKSPACES = [
  {
    id: "tuning",
    short: "Tuning",
    title: "Doortuning",
    description: "NamedTuningArray definitions and model mappings",
  },
  {
    id: "type",
    short: "Type",
    title: "Door Type",
    description: "Binary or XML YTYP specialAttribute",
  },
  {
    id: "audio",
    short: "Audio",
    title: "Door Audio",
    description: "DAT151 REL door audio",
  },
  {
    id: "names",
    short: "Names",
    title: "Nametable",
    description: "Create and export .nametable files",
  },
  {
    id: "merge",
    short: "Merge",
    title: "Merger",
    description: "Union-merge missing YMT entries",
  },
] as const;

export type WorkspaceId = (typeof WORKSPACES)[number]["id"];

export const GITHUB_REPO_URL = "https://github.com/DevSync-Studio/GTA5-Door-Editor";

export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.1.0";

export type ImportedFileInfo = {
  name: string;
  path: string | null;
};

export type WorkspaceFooterState = {
  file: ImportedFileInfo | null;
  format: string | null;
  counts: string | null;
  lastExportAt: number | null;
};

export const EMPTY_FOOTER_STATE: WorkspaceFooterState = {
  file: null,
  format: null,
  counts: null,
  lastExportAt: null,
};

export const DOOR_TYPES: Record<string, string> = {
  "7": "Normal Door",
  "5": "Garage Door",
  "8": "Sliding Door",
  "10": "Sliding Vertical Door",
  "9": "Barrier Door",
  "12": "Rail Crossing Barrier Door",
};

export const YTYP_DOOR_FLAGS_NORMAL = 67_239_936;
export const YTYP_DOOR_FLAGS_AUTOMATIC = 604_110_848;

export function ytypDoorFlagsForType(specialAttribute: string): number {
  switch (specialAttribute) {
    case "5":
    case "8":
    case "9":
    case "10":
    case "12":
      return YTYP_DOOR_FLAGS_AUTOMATIC;
    default:
      return YTYP_DOOR_FLAGS_NORMAL;
  }
}

export function isYtypDoorFlagsPreset(flags: number): boolean {
  return flags === YTYP_DOOR_FLAGS_NORMAL || flags === YTYP_DOOR_FLAGS_AUTOMATIC;
}

export function ytypDoorFlagsPresetLabel(flags: number): string | null {
  if (flags === YTYP_DOOR_FLAGS_NORMAL) return "Normal";
  if (flags === YTYP_DOOR_FLAGS_AUTOMATIC) return "Automatic";
  return null;
}

export const SCALAR_FIELDS = [
  "AutoOpenRadiusModifier",
  "AutoOpenRate",
  "AutoOpenCosineAngleBetweenThreshold",
  "BreakingImpulse",
  "MassMultiplier",
  "WeaponImpulseMultiplier",
  "RotationLimitAngle",
  "TorqueAngularVelocityLimit",
] as const;

export const CHECK_FIELDS = [
  "AutoOpenCloseRateTaper",
  "UseAutoOpenTriggerBox",
  "CustomTriggerBox",
  "BreakableByVehicle",
  "ShouldLatchShut",
] as const;

export const TUNE_HELP: Record<string, string> = {
  AutoOpenVolumeOffset:
    "Offset from the door centre where the auto-open detection volume is placed (local X/Y/Z).",
  Flags:
    "Optional behaviour tokens (space-separated), e.g. AutoOpensForAllVehicles, AutoOpensForLawEnforcement, DontCloseWhenTouched, DelayDoorClosingForPlayer.",
  AutoOpenRadiusModifier:
    "Scales the radius of the auto-open volume used to detect players/vehicles.",
  AutoOpenRate:
    "How fast the door auto-opens once a valid open check succeeds. Higher = faster.",
  AutoOpenCosineAngleBetweenThreshold:
    "Engine threshold for auto-open angle checks. Vanilla often uses -1; exact meaning is undocumented.",
  AutoOpenCloseRateTaper:
    "When enabled, vanilla auto doors often taper the close motion. Exact curve is undocumented.",
  UseAutoOpenTriggerBox:
    "Use the auto-open trigger box path for this tuning (checks the volume / custom box).",
  CustomTriggerBox:
    "Use the custom Trigger box min/max below instead of the default auto-open volume size.",
  TriggerBoxMinMax:
    "Local-space min/max corners of the custom auto-open trigger box (only used when Custom trigger box is on).",
  BreakableByVehicle:
    "If enabled, a vehicle can break the door (and its auto-open behaviour) with enough impulse.",
  BreakingImpulse:
    "Physics impulse magnitude applied when the door breaks. 0 keeps default / none.",
  ShouldLatchShut:
    "If enabled, a swinging door latches shut immediately when it returns to the resting position.",
  MassMultiplier:
    "Multiplies the door's base mass for physics. Lower feels lighter; higher feels heavier.",
  WeaponImpulseMultiplier:
    "Multiplies how strongly weapon hits push the door.",
  RotationLimitAngle:
    "Max angle from the resting pose the door may rotate (radians). 0 usually means use the game default (~90°).",
  TorqueAngularVelocityLimit:
    "Caps how fast the door can spin (angular velocity). Higher allows snappier motion.",
  StdDoorRotDir:
    "Which way a swinging door may open: both directions, negative only, or positive only.",
};

export const ROT_DIRS = [
  "StdDoorOpenBothDir",
  "StdDoorOpenNegDir",
  "StdDoorOpenPosDir",
] as const;

export const DOOR_FLAG_SUGGESTIONS = [
  "AutoOpensForAllVehicles",
  "AutoOpensForLawEnforcement",
  "AutoOpensForMPPlayerPedsOnly",
  "AutoOpensForMPVehicleWithPedsOnly",
  "AutoOpensForSPPlayerPedsOnly",
  "AutoOpensForSPVehicleWithPedsOnly",
  "DelayDoorClosingForPlayer",
  "DontCloseWhenTouched",
  "IgnoreOpenDoorTaskEdgeLerp",
] as const;

export type DoorFlagSuggestion = (typeof DOOR_FLAG_SUGGESTIONS)[number];
