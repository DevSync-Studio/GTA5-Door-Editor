import type { ComponentProps, ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CHECK_FIELDS, ROT_DIRS, SCALAR_FIELDS, TUNE_HELP } from "@/domain/constants";
import type { TuningFields, Vec3 } from "@/domain/tuning";
import { FlagTokensInput } from "@/tools/tuning/FlagTokensInput";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  AutoOpenRadiusModifier: "Radius modifier",
  AutoOpenRate: "Open rate",
  AutoOpenCosineAngleBetweenThreshold: "Cosine threshold",
  BreakingImpulse: "Breaking impulse",
  MassMultiplier: "Mass multiplier",
  WeaponImpulseMultiplier: "Weapon impulse",
  RotationLimitAngle: "Rotation limit",
  TorqueAngularVelocityLimit: "Angular velocity limit",
  AutoOpenCloseRateTaper: "Close rate taper",
  UseAutoOpenTriggerBox: "Use auto-open trigger box",
  CustomTriggerBox: "Custom trigger box",
  BreakableByVehicle: "Breakable by vehicle",
  ShouldLatchShut: "Latch shut",
};

const AUTO_SCALARS = SCALAR_FIELDS.slice(0, 3);
const PHYSICS_SCALARS = SCALAR_FIELDS.slice(3);

export type TuningBox = { min: Vec3; max: Vec3 };

function FieldInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-faint transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          aria-label="Field help"
          onClick={(event) => event.preventDefault()}
        >
          <CircleHelp className="size-3.5" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[17rem] px-2.5 py-2 text-left text-[11px] leading-4 font-normal normal-case tracking-normal"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

interface FormCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

function FormCard({ title, children, className }: FormCardProps) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col rounded-lg border border-line-soft bg-panel/40 p-4",
        className,
      )}
    >
      <h3 className="mb-3.5 shrink-0 text-[13px] font-medium tracking-tight text-muted-foreground">
        {title}
      </h3>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

interface FieldCellProps {
  label: string;
  help?: string;
  children: ReactNode;
  className?: string;
}

function FieldCell({ label, help, children, className }: FieldCellProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-center gap-1">
        <Label className="m-0 text-[11px] font-normal text-faint">{label}</Label>
        {help ? <FieldInfo text={help} /> : null}
      </div>
      {children}
    </div>
  );
}

function NumInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(
        "h-8 font-mono text-[12px] tabular-nums",
        props.className,
      )}
    />
  );
}

function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SectionProps {
  fields: TuningFields;
  onFieldsChange: (next: TuningFields) => void;
  className?: string;
}

interface TriggerBoxSectionProps {
  box: TuningBox;
  onBoxChange: (next: TuningBox) => void;
  className?: string;
}

export function AutoOpenVolumeSection({ fields, onFieldsChange, className }: SectionProps) {
  const setOffset = (axis: keyof Vec3, value: string) => {
    onFieldsChange({
      ...fields,
      AutoOpenVolumeOffset: { ...fields.AutoOpenVolumeOffset, [axis]: value },
    });
  };

  return (
    <FormCard title="Auto-open volume" className={className}>
      <div className="space-y-3">
        <div>
          <div className="mb-2 flex items-center gap-1">
            <span className="text-[11px] font-normal text-faint">Offset</span>
            <FieldInfo text={TUNE_HELP.AutoOpenVolumeOffset} />
          </div>
          <FieldRow className="grid-cols-3">
            {(["x", "y", "z"] as const).map((axis) => (
              <FieldCell key={axis} label={axis.toUpperCase()}>
                <NumInput
                  value={fields.AutoOpenVolumeOffset[axis]}
                  onChange={(event) => setOffset(axis, event.target.value)}
                />
              </FieldCell>
            ))}
          </FieldRow>
        </div>
        <FieldRow>
          {AUTO_SCALARS.map((key) => (
            <FieldCell key={key} label={FIELD_LABELS[key] ?? key} help={TUNE_HELP[key]}>
              <NumInput
                value={fields[key]}
                onChange={(event) =>
                  onFieldsChange({ ...fields, [key]: event.target.value })
                }
              />
            </FieldCell>
          ))}
        </FieldRow>
      </div>
    </FormCard>
  );
}

export function PhysicsSection({ fields, onFieldsChange, className }: SectionProps) {
  return (
    <FormCard title="Physics" className={className}>
      <FieldRow>
        {PHYSICS_SCALARS.map((key) => (
          <FieldCell key={key} label={FIELD_LABELS[key] ?? key} help={TUNE_HELP[key]}>
            <NumInput
              value={fields[key]}
              onChange={(event) =>
                onFieldsChange({ ...fields, [key]: event.target.value })
              }
            />
          </FieldCell>
        ))}
      </FieldRow>
    </FormCard>
  );
}

export function OptionsSection({ fields, onFieldsChange, className }: SectionProps) {
  return (
    <FormCard title="Options" className={className}>
      <div className="grid h-full grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2">
        {CHECK_FIELDS.map((key) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[13px] text-foreground transition-colors hover:bg-hover"
          >
            <Checkbox
              className="size-5 rounded-[5px] after:-inset-x-2 after:-inset-y-2 [&_[data-slot=checkbox-indicator]>svg]:size-3.5"
              checked={fields[key] === "true"}
              onCheckedChange={(checked) =>
                onFieldsChange({
                  ...fields,
                  [key]: String(checked === true),
                })
              }
            />
            <span className="flex min-w-0 flex-1 items-center gap-1.5 leading-snug">
              <span className="min-w-0">{FIELD_LABELS[key] ?? key}</span>
              {TUNE_HELP[key] ? <FieldInfo text={TUNE_HELP[key]} /> : null}
            </span>
          </label>
        ))}
      </div>
    </FormCard>
  );
}

export function FlagsDirectionSection({ fields, onFieldsChange, className }: SectionProps) {
  return (
    <FormCard
      title="Flags & direction"
      className={cn("@container col-span-full p-5 sm:p-6 md:min-h-[17.5rem]", className)}
    >
      <div className="flex flex-col gap-4 @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:items-start">
        <FieldCell className="min-w-0" label="Flags" help={TUNE_HELP.Flags}>
          <FlagTokensInput
            value={fields.Flags}
            onChange={(next) => onFieldsChange({ ...fields, Flags: next })}
          />
        </FieldCell>
        <FieldCell
          className="min-w-0 @min-[40rem]:pt-0"
          label="Rotation direction"
          help={TUNE_HELP.StdDoorRotDir}
        >
          <SimpleSelect
            value={fields.StdDoorRotDir}
            onValueChange={(value) =>
              onFieldsChange({ ...fields, StdDoorRotDir: value })
            }
            options={[...ROT_DIRS]}
            className="h-11 w-full data-[size=default]:h-11"
          />
        </FieldCell>
      </div>
    </FormCard>
  );
}

export function TriggerBoxSection({ box, onBoxChange, className }: TriggerBoxSectionProps) {
  return (
    <FormCard title="Trigger box" className={className}>
      <div className="mb-3 flex items-center gap-1.5">
        <p className="m-0 text-[11px] leading-4 text-faint">Custom auto-open bounds</p>
        <FieldInfo text={TUNE_HELP.TriggerBoxMinMax} />
      </div>
      <div className="space-y-4">
        {(["min", "max"] as const).map((tag) => (
          <div key={tag}>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-faint">
              {tag === "min" ? "Minimum" : "Maximum"}
            </div>
            <FieldRow className="grid-cols-3">
              {(["x", "y", "z"] as const).map((axis) => (
                <FieldCell key={`${tag}-${axis}`} label={axis.toUpperCase()}>
                  <NumInput
                    value={box[tag][axis]}
                    onChange={(event) =>
                      onBoxChange({
                        ...box,
                        [tag]: { ...box[tag], [axis]: event.target.value },
                      })
                    }
                  />
                </FieldCell>
              ))}
            </FieldRow>
          </div>
        ))}
      </div>
    </FormCard>
  );
}
