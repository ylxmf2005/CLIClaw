import { cn } from "@/lib/utils";

interface FieldGroupProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldGroup({ label, children, className }: FieldGroupProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
