"use client";

/** Longest side after shrinking. Plenty for 1080px-wide slides and for the AI to read. */
const MAX_SIDE = 2160;
/** Files at or under this size, and not too large in pixels, are uploaded untouched. */
const KEEP_UNDER_BYTES = 1.5 * 1024 * 1024;
/** Hosting limits each request to roughly 6 MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Phone photos are often 3–12 MB. This shrinks big images in the browser before upload
 * (JPEG, longest side 2160px). GIFs are kept as they are so animations survive.
 */
export async function shrinkForUpload(file: File): Promise<File> {
  if (file.type === "image/gif" || !file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // let the server report it if it isn't a usable image
  }
  const { width, height } = bitmap;
  if (file.size <= KEEP_UNDER_BYTES && Math.max(width, height) <= MAX_SIDE) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff"; // transparent areas become white in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.88, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  return file;
}
