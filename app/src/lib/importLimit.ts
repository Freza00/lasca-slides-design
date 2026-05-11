export function getImportLimitBytes(maxImportMb: number): number | null {
  if (!Number.isFinite(maxImportMb) || maxImportMb <= 0) return null;
  return Math.trunc(maxImportMb * 1024 * 1024);
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
