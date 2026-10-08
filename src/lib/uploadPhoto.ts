import type { createClient } from "@/lib/supabase/client";

// Must match file_size_limit on the "photos" bucket (migration 005).
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;

// Phone photos are often 3–10 MB; resize to a sensible display size and
// re-encode as JPEG. Falls back to the original when the browser can't
// decode the format (e.g. HEIC outside Safari) or compression doesn't help.
async function compressImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha; keep transparent PNGs from turning black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadTripPhoto(
  supabase: ReturnType<typeof createClient>,
  tripId: string,
  file: File
): Promise<string> {
  const blob = await compressImage(file);
  if (blob.size > MAX_BYTES) throw new Error("Photo is too large (max 5 MB).");

  const ext = blob === file ? (file.name.split(".").pop() ?? "jpg") : "jpg";
  const path = `places/${tripId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("photos")
    .upload(path, blob, { contentType: blob.type || file.type });
  if (error) throw error;

  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}
