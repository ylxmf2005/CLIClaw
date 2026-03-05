import { cn } from "@/lib/utils";

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  truncate?: boolean;
  className?: string;
}

export function InfoRow({ label, value, mono, truncate, className }: InfoRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-xs", className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-medium text-foreground",
          mono && "font-mono text-[11px]",
          truncate && "truncate"
        )}
        title={truncate && typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
