import type { PermissionLevel } from "@/lib/types";

export const PERMISSION_DESCRIPTIONS: Record<PermissionLevel, string> = {
  restricted:
    "Read-only file access. Cannot execute commands or modify files.",
  standard:
    "Can read/write files and run safe commands within workspace.",
  privileged:
    "Full workspace access including shell commands and network.",
  admin:
    "Unrestricted access. Can modify system files and manage other agents.",
};
