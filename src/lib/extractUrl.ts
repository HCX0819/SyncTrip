// Shared text often wraps the link ("Check this out! https://vm.tiktok.com/…"),
// so pull out the first http(s) URL. Returns null when there isn't one.
export function extractUrl(text: string | null | undefined): string | null {
  const match = text?.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  // Trailing punctuation is almost always sentence text, not part of the link.
  const candidate = match[0].replace(/[),.!?;:]+$/, "");
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}
