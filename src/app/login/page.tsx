"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Map,
  MapPin,
  LayoutGrid,
  ThumbsUp,
  CalendarDays,
  MapPinned,
  MailCheck,
  AlertCircle,
} from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main
      className="theme-noir"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {/* Left panel — decorative (hidden on mobile) */}
      <div
        className="hidden md:flex"
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(160deg, #17140f 0%, #0a0a0a 65%, #120f0a 100%)",
          borderRight: "1px solid var(--noir-border)",
        }}
      >
        {/* Top highlight line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.35), transparent)",
          }}
        />
        {/* Subtle radial glow */}
        <div
          style={{
            position: "absolute",
            top: "35%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 480,
            height: 480,
            background: "radial-gradient(ellipse, rgba(212,175,55,0.06) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        {/* Map pin watermark */}
        <MapPin
          size={220}
          strokeWidth={0.75}
          color="var(--gold)"
          style={{
            position: "absolute",
            bottom: "60px",
            right: "40px",
            opacity: 0.08,
            transform: "rotate(-15deg)",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px",
          }}
        >
          {/* Logo badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(212,175,55,0.12)",
              border: "1px solid rgba(212,175,55,0.3)",
              backdropFilter: "blur(8px)",
              borderRadius: "99px",
              padding: "6px 16px 6px 8px",
              marginBottom: "32px",
              width: "fit-content",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                background: "var(--gold)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Map size={16} color="#17140f" strokeWidth={2} />
            </div>
            <span style={{ color: "var(--noir-text)", fontSize: "13px", fontWeight: 600, letterSpacing: "0.05em" }}>
              SYNCTRIP
            </span>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(36px, 4vw, 52px)",
              fontWeight: 500,
              lineHeight: 1.1,
              color: "var(--noir-text)",
              marginBottom: "20px",
            }}
          >
            Plan together,
            <br />
            <span style={{ color: "var(--gold-soft)" }}>travel better.</span>
          </h1>
          <p style={{ color: "var(--noir-text-muted)", fontSize: "15px", maxWidth: 320, lineHeight: 1.6 }}>
            Save places from anywhere. Vote on favourites. Build the perfect trip — together.
          </p>

          {/* Feature list */}
          <div style={{ marginTop: "40px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { Icon: LayoutGrid, label: "Visual moodboard of saved places" },
              { Icon: ThumbsUp, label: "Yaay / Naay voting — no arguments" },
              { Icon: CalendarDays, label: "Drag-to-day itinerary builder" },
              { Icon: MapPinned, label: "Map view of every pin" },
            ].map((f) => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    background: "rgba(212,175,55,0.12)",
                    border: "1px solid rgba(212,175,55,0.25)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <f.Icon size={14} color="var(--gold)" strokeWidth={2} />
                </span>
                <span style={{ color: "var(--noir-text-muted)", fontSize: "14px" }}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 40px",
          borderLeft: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {/* Mobile logo */}
        <div
          className="md:hidden"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "40px",
          }}
        >
          <Map size={22} color="var(--gold)" />
          <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--gold)", letterSpacing: "0.04em" }}>
            SYNCTRIP
          </span>
        </div>

        {!sent ? (
          <>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "24px",
                fontWeight: 500,
                marginBottom: "6px",
                color: "var(--text)",
              }}
            >
              Sign in to SyncTrip
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px" }}>
              No password needed — we&apos;ll email you a magic link.
            </p>

            <form onSubmit={handleMagicLink} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                id="email-input"
                className="input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
              {error && (
                <p style={{ color: "var(--red)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <AlertCircle size={14} /> {error}
                </p>
              )}
              <button
                id="magic-link-btn"
                className="btn btn-primary btn-full"
                type="submit"
                disabled={loading}
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                margin: "24px 0",
              }}
            >
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>or</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>

            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                width: "100%",
                padding: "11px 24px",
                background: "var(--surface)",
                border: "1.5px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--text)",
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
                transition: "box-shadow 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--surface)";
                e.currentTarget.style.boxShadow = "var(--shadow-sm)";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <p
              style={{
                marginTop: "24px",
                fontSize: "12px",
                color: "var(--text-light)",
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </>
        ) : (
          <div className="animate-fade-up" style={{ textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--blue-light)",
                border: "1px solid var(--blue)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <MailCheck size={28} color="var(--gold)" />
            </div>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "22px",
                fontWeight: 500,
                marginBottom: "10px",
                color: "var(--text)",
              }}
            >
              Check your inbox
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>
              We sent a magic link to{" "}
              <strong style={{ color: "var(--text)" }}>{email}</strong>. Click it to sign in.
            </p>
            <button
              className="btn btn-flat btn-sm"
              style={{ marginTop: "32px" }}
              onClick={() => setSent(false)}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
