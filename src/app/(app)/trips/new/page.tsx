"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewTripPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    destination: "",
    start_date: "",
    end_date: "",
  });
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Create trip
      const { data: trip, error: tripErr } = await supabase
        .from("trips")
        .insert({
          name: form.name,
          destination: form.destination,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (tripErr || !trip) {
        setError(tripErr?.message ?? "Failed to create trip");
        return;
      }

      // Add creator as owner
      await supabase.from("trip_members").insert({
        trip_id: trip.id,
        user_id: user.id,
        role: "owner",
      });

      router.push(`/trips/${trip.id}`);
    });
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: "60px 24px 120px",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      {/* Back */}
      <button
        id="back-btn"
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: "32px" }}
        onClick={() => router.back()}
      >
        ← Back
      </button>

      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "32px",
          fontWeight: 400,
          marginBottom: "8px",
        }}
      >
        New trip
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "40px" }}>
        Give your adventure a name and tell us where you&apos;re headed.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "20px" }}
      >
        <div>
          <label
            htmlFor="trip-name"
            style={{ display: "block", fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.05em" }}
          >
            TRIP NAME
          </label>
          <input
            id="trip-name"
            className="input"
            name="name"
            placeholder="e.g. Tokyo Summer '26"
            value={form.name}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label
            htmlFor="destination"
            style={{ display: "block", fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.05em" }}
          >
            DESTINATION
          </label>
          <input
            id="destination"
            className="input"
            name="destination"
            placeholder="e.g. Tokyo, Japan"
            value={form.destination}
            onChange={handleChange}
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label
              htmlFor="start-date"
              style={{ display: "block", fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.05em" }}
            >
              FROM
            </label>
            <input
              id="start-date"
              className="input"
              type="date"
              name="start_date"
              value={form.start_date}
              onChange={handleChange}
              style={{ colorScheme: "dark" }}
            />
          </div>
          <div>
            <label
              htmlFor="end-date"
              style={{ display: "block", fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.05em" }}
            >
              TO
            </label>
            <input
              id="end-date"
              className="input"
              type="date"
              name="end_date"
              value={form.end_date}
              onChange={handleChange}
              min={form.start_date}
              style={{ colorScheme: "dark" }}
            />
          </div>
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px" }}>{error}</p>
        )}

        <button
          id="create-trip-btn"
          className="btn btn-primary btn-full"
          type="submit"
          disabled={isPending}
          style={{ marginTop: "8px" }}
        >
          {isPending ? "Creating…" : "Create trip →"}
        </button>
      </form>
    </div>
  );
}
