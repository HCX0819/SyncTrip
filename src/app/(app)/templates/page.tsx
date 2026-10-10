import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { TemplateSummary } from "@/lib/types";
import { templateStats } from "@/lib/templates";

function TemplateCard({ template }: { template: TemplateSummary }) {
  return (
    <Link href={`/templates/${template.id}`} style={{ textDecoration: "none" }}>
      <article className="card trip-card" style={{ overflow: "hidden", cursor: "pointer" }}>
        <div
          style={{
            height: 140,
            background: template.cover_url
              ? `url(${template.cover_url}) center/cover`
              : "linear-gradient(135deg, #e7c9a9 0%, #b85c38 100%)",
          }}
        />
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <h3
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "20px",
              fontWeight: 500,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {template.name}
          </h3>
          <p
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--text-muted)",
              fontSize: "13px",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            <MapPin size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {template.destination}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>{templateStats(template)}</p>
        </div>
      </article>
    </Link>
  );
}

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase.rpc("list_templates");
  const templates = (data ?? []) as TemplateSummary[];

  return (
    <div style={{ minHeight: "100dvh", padding: "60px 20px 120px", maxWidth: 960, margin: "0 auto" }}>
      <Link href="/dashboard" className="btn btn-ghost btn-sm" style={{ marginBottom: "32px" }}>
        ← Back
      </Link>

      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "32px",
          fontWeight: 400,
          marginBottom: "8px",
        }}
      >
        Trip templates
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px" }}>
        Start from a plan other travellers have shared, then make it your own.
      </p>

      {templates.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", padding: "48px 0" }}>
          No templates have been shared yet.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "16px",
          }}
        >
          {templates.map((t) => (
            <div key={t.id} className="animate-fade-up">
              <TemplateCard template={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
