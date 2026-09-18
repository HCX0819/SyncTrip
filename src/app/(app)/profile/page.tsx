"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? null);
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div
      className="tab-content"
      style={{
        minHeight: "100dvh",
        padding: "60px 24px var(--tab-height)",
        maxWidth: "500px",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "28px",
          fontWeight: 400,
          marginBottom: "24px",
        }}
      >
        Account
      </h1>

      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "var(--surface-2)",
              border: "1px solid var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              color: "var(--accent)",
            }}
          >
            {email ? email[0].toUpperCase() : "👤"}
          </div>
          <div>
            <p style={{ fontSize: "16px", fontWeight: 500 }}>
              {loading ? "Loading…" : email ?? "Signed in User"}
            </p>
            <p style={{ fontSize: "12px", color: "var(--accent)", marginTop: "2px" }}>
              SyncTrip Explorer
            </p>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <button
            id="sign-out-btn"
            className="btn btn-danger btn-full"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
        SyncTrip v1.0 • Built with luxury B&W design
      </div>
    </div>
  );
}
