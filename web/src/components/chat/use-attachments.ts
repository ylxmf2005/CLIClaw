"use client";

import { useState, useCallback, useRef } from "react";
import type { AttachmentFile } from "./attachment-bar";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

export const ACCEPTED_TYPES = [
  ...IMAGE_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function classifyFile(file: File): AttachmentFile["type"] {
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (
    file.type.includes("pdf") ||
    file.type.includes("word") ||
    file.type.includes("document") ||
    file.type.includes("text/")
  ) {
    return "document";
  }
  return "other";
}

function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const attachmentsRef = useRef<AttachmentFile[]>([]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const oversized = fileArray.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setError(
        `File${oversized.length > 1 ? "s" : ""} too large (max 10 MB): ${oversized.map((f) => f.name).join(", ")}`
      );
    }

    const valid = fileArray.filter((f) => f.size <= MAX_FILE_SIZE);
    const newAttachments: AttachmentFile[] = await Promise.all(
      valid.map(async (file) => {
        const type = classifyFile(file);
        const preview = type === "image" ? await createImagePreview(file) : undefined;
        return { id: generateId(), file, preview, type };
      })
    );

    setAttachments((prev) => {
      const next = [...prev, ...newAttachments];
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    attachmentsRef.current = [];
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    attachments,
    attachmentsRef,
    error,
    addFiles,
    removeAttachment,
    clearAttachments,
    clearError,
    IMAGE_TYPES,
  };
}
