"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Trip } from "@/lib/types";

export default function JoinTripPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  useEffect(() => {
    async function checkTripAndUser() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to login with return path
        router.push(`/login?next=/join/${tripId}`);
        return;
      }

      // Fetch trip details
      const { data: tripData, error: tripErr } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();

      if (tripErr || !tripData) {
        setError("This trip link is invalid or has expired.");
        setLoading(false);
        return;
      }

      setTrip(tripData as Trip);

      // Check if already a member
      const { data: memberData } = await supabase
        .from("trip_members")
        .select("id")
        .eq("trip_id", tripId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberData) {
        // Already a member, go straight to trip
        router.push(`/trips/${tripId}`);
        return;
      }

      setLoading(false);
    }

    if (tripId) {
      checkTripAndUser();
    }
  }, [tripId, router]);

  async function handleJoin() {
    startTransition(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error: joinErr } = await supabase.from("trip_members").insert({
        trip_id: tripId,
        user_id: user.id,
        role: "member",
      });

      if (joinErr) {
        setError(joinErr.message);
        return;
      }

      router.push(`/trips/${tripId}`);
    });
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          color: "var(--text-muted)",
        }}
      >
        Loading invite…
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "var(--bg)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", marginBottom: "8px" }}>
          Invite Not Found
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px" }}>
          {error ?? "This trip could not be found."}
        </p>
        <button className="btn btn-ghost" onClick={() => router.push("/dashboard")}>
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg)",
      }}
    >
      <div
        className="card animate-fade-up"
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "36px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--accent)",
            marginBottom: "12px",
            fontFamily: "var(--font-serif)",
          }}
        >
          Trip Invitation
        </div>

        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "28px",
            marginBottom: "8px",
          }}
        >
          {trip.name}
        </h1>

        <p style={{ color: "var(--text-muted)", fontSize: "15px", marginBottom: "28px" }}>
          Destination: <span style={{ color: "var(--text)" }}>{trip.destination}</span>
        </p>

        <button
          id="accept-invite-btn"
          className="btn btn-primary btn-full"
          onClick={handleJoin}
          disabled={isPending}
        >
          {isPending ? "Joining Trip…" : "Accept & Join Trip →"}
        </button>
      </div>
    </main>
  );
}
