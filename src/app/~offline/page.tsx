import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're offline — SyncTrip",
};

// Served by the service worker when a page isn't cached and the network is down.
export default function Offline() {
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
      <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.5 }}>📡</div>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", marginBottom: "8px" }}>
        You&apos;re offline
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px", maxWidth: 320 }}>
        This page hasn&apos;t been saved for offline use yet. Trips you&apos;ve already opened are
        still available — reconnect to load the rest.
      </p>
      <a href="/dashboard" className="btn btn-ghost">
        Go to Dashboard
      </a>
    </main>
  );
}
