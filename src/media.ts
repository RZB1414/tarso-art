export const MAX_IMAGE_FILE_SIZE = 1.5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_VIDEO_FILE_SIZE = 8 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const MAX_MEDIA_UPLOAD_REQUEST_SIZE = MAX_VIDEO_FILE_SIZE + 256 * 1024;
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES] as const;

export type AllowedMediaMime = (typeof ALLOWED_MEDIA_TYPES)[number];
export type UploadMediaType = "image" | "video";

export function mediaTypeFromMime(type: string): UploadMediaType | undefined {
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) return "image";
  if ((ALLOWED_VIDEO_TYPES as readonly string[]).includes(type)) return "video";
  return undefined;
}

export function maxFileSizeForMedia(type: UploadMediaType): number {
  return type === "video" ? MAX_VIDEO_FILE_SIZE : MAX_IMAGE_FILE_SIZE;
}

export function mediaTypeLabel(type: UploadMediaType): string {
  return type === "video" ? "video" : "imagem";
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Number((bytes / 1024 / 1024).toFixed(1)).toLocaleString("pt-BR")} MB`;
  }

  return `${Math.round(bytes / 1024).toLocaleString("pt-BR")} KB`;
}
