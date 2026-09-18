import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 24px",
        background: "radial-gradient(ellipse at 50% 20%, #17140f 0%, #0a0a0a 70%)",
        position: "relative",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "14px",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          SyncTrip
        </p>
        <Link href="/login" className="btn btn-ghost btn-sm">
          Sign In
        </Link>
      </header>

      <div style={{ maxWidth: 640, margin: "64px auto", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(38px, 6vw, 68px)",
            lineHeight: 1.08,
            marginBottom: "24px",
            fontWeight: 300,
          }}
        >
          Group travel, <br />
          <em style={{ fontStyle: "italic", color: "var(--accent)" }}>without the discord.</em>
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "17px",
            lineHeight: 1.6,
            maxWidth: 460,
            margin: "0 auto 36px",
          }}
        >
          Turn chaotic group chats into a single visual moodboard. Save places from TikTok &
          Instagram, vote with zero drama, and build the perfect day-by-day itinerary.
        </p>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
          <Link href="/login" className="btn btn-primary" style={{ padding: "14px 32px" }}>
            Start Planning →
          </Link>
        </div>
      </div>

      <footer
        style={{
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "12px",
          letterSpacing: "0.05em",
        }}
      >
        Luxury B&W Collaborative Travel PWA
      </footer>
    </main>
  );
}
