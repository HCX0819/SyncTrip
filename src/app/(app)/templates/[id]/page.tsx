import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { TemplateDetail } from "@/lib/types";
import { templateStats } from "@/lib/templates";
import UseTemplateForm from "@/components/templates/UseTemplateForm";

type TemplatePlace = TemplateDetail["places"][number];

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  marginBottom: "10px",
};

function PlaceRow({ place }: { place: TemplatePlace }) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px" }}>
      {place.photo_url && (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-sm)",
            backgroundImage: `url(${place.photo_url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h4
            style={{
              fontSize: "15px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {place.title}
          </h4>
          <span
            className={`badge-${place.category}`}
            style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "99px", flexShrink: 0 }}
          >
            {place.category}
          </span>
        </div>
        {place.address && (
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
              marginTop: "2px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {place.address}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Null for private trips; an error for ids that aren't uuids.
  const { data, error } = await supabase.rpc("get_template", { p_id: id });
  if (error || !data) notFound();
  const template = data as TemplateDetail;

  const days = new Map<number, TemplatePlace[]>();
  const unscheduled: TemplatePlace[] = [];
  for (const place of template.places) {
    if (place.day_index == null) {
      unscheduled.push(place);
    } else {
      days.set(place.day_index, [...(days.get(place.day_index) ?? []), place]);
    }
  }
  const dayEntries = [...days.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div style={{ minHeight: "100dvh", padding: "60px 20px 120px", maxWidth: 640, margin: "0 auto" }}>
      <Link href="/templates" className="btn btn-ghost btn-sm" style={{ marginBottom: "24px" }}>
        ← Templates
      </Link>

      {template.cover_url && (
        <div
          style={{
            height: 180,
            borderRadius: "var(--radius-sm)",
            background: `url(${template.cover_url}) center/cover`,
            marginBottom: "20px",
          }}
        />
      )}

      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "30px",
          fontWeight: 400,
          marginBottom: "6px",
        }}
      >
        {template.name}
      </h1>
      <p
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: "var(--text-muted)",
          fontSize: "14px",
          marginBottom: "4px",
        }}
      >
        <MapPin size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
        {template.destination}
      </p>
      <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "28px" }}>
        {templateStats(template)}
      </p>

      <div style={{ marginBottom: "32px" }}>
        <UseTemplateForm templateId={template.id} templateName={template.name} />
      </div>

      {dayEntries.map(([day, places]) => (
        <section key={day} style={{ marginBottom: "24px" }}>
          <p style={sectionTitleStyle}>DAY {day}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {places.map((p, i) => (
              <PlaceRow key={i} place={p} />
            ))}
          </div>
        </section>
      ))}

      {unscheduled.length > 0 && (
        <section style={{ marginBottom: "24px" }}>
          <p style={sectionTitleStyle}>{dayEntries.length > 0 ? "MORE IDEAS" : "PLACES"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {unscheduled.map((p, i) => (
              <PlaceRow key={i} place={p} />
            ))}
          </div>
        </section>
      )}

      {template.places.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>This template has no places yet.</p>
      )}
    </div>
  );
}
