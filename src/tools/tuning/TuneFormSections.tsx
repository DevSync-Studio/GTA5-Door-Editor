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
import { CHECK_FIELDS, ROT_DIRS, SCALAR_FIELDS } from "@/domain/constants";
import type { MessageKey } from "@/domain/i18n";
import type { TuningFields, Vec3 } from "@/domain/tuning";
import { useLocale } from "@/hooks/useLocale";
import { FlagTokensInput } from "@/tools/tuning/FlagTokensInput";
import { cn } from "@/lib/utils";

const FIELD_LABEL_KEYS: Record<string, MessageKey> = {
  AutoOpenRadiusModifier: "form.label.radiusModifier",
  AutoOpenRate: "form.label.openRate",
  AutoOpenCosineAngleBetweenThreshold: "form.label.cosineThreshold",
  BreakingImpulse: "form.label.breakingImpulse",
  MassMultiplier: "form.label.massMultiplier",
  WeaponImpulseMultiplier: "form.label.weaponImpulse",
  RotationLimitAngle: "form.label.rotationLimit",
  TorqueAngularVelocityLimit: "form.label.angularVelocityLimit",
  AutoOpenCloseRateTaper: "form.label.closeRateTaper",
  UseAutoOpenTriggerBox: "form.label.useAutoOpenTriggerBox",
  CustomTriggerBox: "form.label.customTriggerBox",
  BreakableByVehicle: "form.label.breakableByVehicle",
  ShouldLatchShut: "form.label.latchShut",
};

const AUTO_SCALARS = SCALAR_FIELDS.slice(0, 3);
const PHYSICS_SCALARS = SCALAR_FIELDS.slice(3);

export type TuningBox = { min: Vec3; max: Vec3 };

function FieldInfo({ text }: { text: string }) {
  const { t } = useLocale();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-faint transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          aria-label={t("form.fieldHelp")}
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

function fieldLabel(
  key: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  const labelKey = FIELD_LABEL_KEYS[key];
  return labelKey ? t(labelKey) : key;
}

function fieldHelp(
  key: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  return t(`form.help.${key}` as MessageKey);
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
  const { t } = useLocale();
  const setOffset = (axis: keyof Vec3, value: string) => {
    onFieldsChange({
      ...fields,
      AutoOpenVolumeOffset: { ...fields.AutoOpenVolumeOffset, [axis]: value },
    });
  };

  return (
    <FormCard title={t("form.section.autoOpenVolume")} className={className}>
      <div className="space-y-3">
        <div>
          <div className="mb-2 flex items-center gap-1">
            <span className="text-[11px] font-normal text-faint">{t("form.offset")}</span>
            <FieldInfo text={fieldHelp("AutoOpenVolumeOffset", t)} />
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
            <FieldCell key={key} label={fieldLabel(key, t)} help={fieldHelp(key, t)}>
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
  const { t } = useLocale();
  return (
    <FormCard title={t("form.section.physics")} className={className}>
      <FieldRow>
        {PHYSICS_SCALARS.map((key) => (
          <FieldCell key={key} label={fieldLabel(key, t)} help={fieldHelp(key, t)}>
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
  const { t } = useLocale();
  return (
    <FormCard title={t("form.section.options")} className={className}>
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
              <span className="min-w-0">{fieldLabel(key, t)}</span>
              <FieldInfo text={fieldHelp(key, t)} />
            </span>
          </label>
        ))}
      </div>
    </FormCard>
  );
}

export function FlagsDirectionSection({ fields, onFieldsChange, className }: SectionProps) {
  const { t } = useLocale();
  return (
    <FormCard
      title={t("form.section.flagsDirection")}
      className={cn("@container col-span-full p-5 sm:p-6 md:min-h-[17.5rem]", className)}
    >
      <div className="flex flex-col gap-4 @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:items-start">
        <FieldCell className="min-w-0" label={t("form.flags")} help={fieldHelp("Flags", t)}>
          <FlagTokensInput
            value={fields.Flags}
            onChange={(next) => onFieldsChange({ ...fields, Flags: next })}
          />
        </FieldCell>
        <FieldCell
          className="min-w-0 @min-[40rem]:pt-0"
          label={t("form.rotationDirection")}
          help={fieldHelp("StdDoorRotDir", t)}
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
  const { t } = useLocale();
  return (
    <FormCard title={t("form.section.triggerBox")} className={className}>
      <div className="mb-3 flex items-center gap-1.5">
        <p className="m-0 text-[11px] leading-4 text-faint">{t("form.triggerBox.hint")}</p>
        <FieldInfo text={fieldHelp("TriggerBoxMinMax", t)} />
      </div>
      <div className="space-y-4">
        {(["min", "max"] as const).map((tag) => (
          <div key={tag}>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-faint">
              {tag === "min" ? t("form.triggerBox.min") : t("form.triggerBox.max")}
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
