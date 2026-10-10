import Link from "next/link";

export default function TripNotFound() {
  return (
    <div
      className="tab-content"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.5 }}>🗺️</div>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", marginBottom: "8px" }}>
        Trip not found
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px", maxWidth: 320 }}>
        Trip not found or you&apos;re not a member of it. Ask a trip member for a fresh invite link.
      </p>
      <Link href="/dashboard" className="btn btn-ghost">
        Back to Dashboard
      </Link>
    </div>
  );
}
