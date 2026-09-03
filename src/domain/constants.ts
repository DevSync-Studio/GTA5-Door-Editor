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

export const GITHUB_REPO_URL = "https://github.com/OWNER/GTA5_Door_Editor";

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
    "Offset from the centre of the door where the auto-open volume is placed.",
  Flags: "Optional door-behaviour flags. Separate tokens with spaces.",
  AutoOpenRadiusModifier: "Multiplier for the auto-open volume radius.",
  AutoOpenRate: "How quickly the door auto-opens after a valid check.",
  AutoOpenCosineAngleBetweenThreshold:
    "Unknown GTA behaviour; preserve a known value unless testing.",
  AutoOpenCloseRateTaper:
    "Unknown GTA behaviour; preserve a known value unless testing.",
  UseAutoOpenTriggerBox: "Enables the auto-open feature.",
  CustomTriggerBox: "Uses the custom TriggerBoxMinMax bounds below.",
  TriggerBoxMinMax: "Minimum and maximum bounds for the custom auto-open trigger box.",
  BreakableByVehicle: "Whether a vehicle can break the door.",
  BreakingImpulse: "Physics impulse applied when the door breaks.",
  ShouldLatchShut:
    "Whether a swinging door immediately latches on return to rest.",
  MassMultiplier: "Multiplier for the base door mass.",
  WeaponImpulseMultiplier: "Multiplier for physics impulse received from weapons.",
  RotationLimitAngle: "Maximum rotation angle from the resting position.",
  TorqueAngularVelocityLimit: "Maximum angular velocity allowed for the door.",
  StdDoorRotDir: "Opening direction: both, negative, or positive.",
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
