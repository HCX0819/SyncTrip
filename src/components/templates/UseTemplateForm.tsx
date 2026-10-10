"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "var(--text-muted)",
  marginBottom: "6px",
  letterSpacing: "0.08em",
};

export default function UseTemplateForm({ templateId, templateName }: { templateId: string; templateName: string }) {
  const router = useRouter();
  const [name, setName] = useState(templateName);
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("use_template", {
      p_trip_id: templateId,
      p_name: name.trim(),
      p_start_date: startDate || null,
    });
    if (error || !data) {
      setBusy(false);
      setError(error?.message ?? "Couldn't create a trip from this template.");
      return;
    }
    router.push(`/trips/${data}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card"
      style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}
    >
      <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--text)" }}>Use this template</p>
      <div>
        <label htmlFor="template-trip-name" style={labelStyle}>
          TRIP NAME *
        </label>
        <input
          id="template-trip-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="template-start-date" style={labelStyle}>
          START DATE
        </label>
        <input
          id="template-start-date"
          className="input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      {error && <p style={{ color: "var(--red)", fontSize: "13px" }}>{error}</p>}
      <button
        id="use-template-btn"
        type="submit"
        className="btn btn-primary btn-full"
        disabled={busy || !name.trim()}
      >
        {busy ? "Creating…" : "Create my trip →"}
      </button>
    </form>
  );
}
