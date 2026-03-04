import { Plus, Paperclip } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PlusMenuProps {
  disabled?: boolean;
  onAddFiles: () => void;
}

export function PlusMenu({ disabled, onAddFiles }: PlusMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add content"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuItem onClick={onAddFiles}>
          <Paperclip className="h-4 w-4" />
          Add photos & files
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
