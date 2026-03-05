import { cn } from "@/lib/utils";

interface DetailSectionProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DetailSection({ title, action, children, className }: DetailSectionProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between px-0.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h4>
        {action}
      </div>
      <div className="rounded-xl border border-border/60 bg-accent/30 p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}
