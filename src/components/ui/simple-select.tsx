import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  size = "default",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<string | Option>;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
}) {
  const items = React.useMemo(
    () =>
      options.map((option) =>
        typeof option === "string" ? { value: option, label: option } : option,
      ),
    [options],
  );

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger size={size} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
