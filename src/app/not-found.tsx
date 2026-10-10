import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — SyncTrip",
};

export default function NotFound() {
  return (
    <main
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
      <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.5 }}>🧭</div>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", marginBottom: "8px" }}>
        Page not found
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px", maxWidth: 320 }}>
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link href="/dashboard" className="btn btn-ghost">
        Go to Dashboard
      </Link>
    </main>
  );
}
