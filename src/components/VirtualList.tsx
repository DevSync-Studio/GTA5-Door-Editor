import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type VirtualListProps<T> = {
  items: T[];
  itemHeight?: number;
  height?: number;
  className?: string;
  render: (item: T, index: number) => ReactNode;
};

export function VirtualList<T>({
  items,
  itemHeight = 58,
  height,
  className,
  render,
}: VirtualListProps<T>) {
  const [scroll, setScroll] = useState(0);
  const [measured, setMeasured] = useState(height ?? 320);
  const ref = useRef<HTMLDivElement>(null);
  const overscan = 6;
  const viewport = height ?? measured;
  const start = Math.max(0, Math.floor(scroll / itemHeight) - overscan);
  const visible = Math.ceil(Math.max(viewport, 1) / itemHeight) + overscan * 2;
  const end = Math.min(items.length, start + visible);
  const slice = useMemo(() => items.slice(start, end), [items, start, end]);

  useEffect(() => {
    if (height != null) {
      setMeasured(height);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const sync = () => setMeasured(el.clientHeight || 320);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  return (
    <div
      ref={ref}
      className={cn("min-h-0 overflow-auto", height == null && "h-full", className)}
      style={height != null ? { height } : undefined}
      onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${start * itemHeight}px)` }}>
          {slice.map((item, index) => (
            <div key={start + index} style={{ height: itemHeight }}>
              {render(item, start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
