import { FileText, File, X } from "lucide-react";

export interface AttachmentFile {
  id: string;
  file: File;
  preview?: string; // data URL for images
  type: "image" | "document" | "other";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentBar({
  attachments,
  onRemove,
}: {
  attachments: AttachmentFile[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mb-2 flex gap-2 overflow-x-auto rounded-lg border border-border bg-background/50 p-2">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="group relative flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
        >
          {att.type === "image" && att.preview ? (
            <img
              src={att.preview}
              alt={att.file.name}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-accent">
              {att.type === "document" ? (
                <FileText className="h-5 w-5 text-muted-foreground" />
              ) : (
                <File className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          )}

          <div className="flex max-w-[120px] flex-col">
            <span className="truncate text-xs font-medium text-foreground">{att.file.name}</span>
            <span className="text-[10px] text-muted-foreground">{formatFileSize(att.file.size)}</span>
          </div>

          <button
            type="button"
            onClick={() => onRemove(att.id)}
            aria-label={`Remove ${att.file.name}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border text-muted-foreground opacity-0 transition-opacity hover:bg-rose-alert hover:text-white group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
