import type { TemplateSummary } from "@/lib/types";

/** "3 days · 12 places", or just the place count when the template has no days. */
export function templateStats(t: Pick<TemplateSummary, "day_count" | "place_count">) {
  const parts: string[] = [];
  if (t.day_count) parts.push(`${t.day_count} ${t.day_count === 1 ? "day" : "days"}`);
  parts.push(`${t.place_count} ${t.place_count === 1 ? "place" : "places"}`);
  return parts.join(" · ");
}
