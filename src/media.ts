export const MAX_IMAGE_FILE_SIZE = 1.5 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_REQUEST_SIZE = MAX_IMAGE_FILE_SIZE + 128 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Number((bytes / 1024 / 1024).toFixed(1)).toLocaleString("pt-BR")} MB`;
  }

  return `${Math.round(bytes / 1024).toLocaleString("pt-BR")} KB`;
}
