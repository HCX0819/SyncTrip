"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

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
      <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", marginBottom: "8px" }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px", maxWidth: 320 }}>
        An unexpected error occurred. Please try again — if it keeps happening, reload the app.
      </p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-ghost">
          Go to Dashboard
        </Link>
      </div>
      {error.digest && (
        <p style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "24px" }}>
          Error reference: {error.digest}
        </p>
      )}
    </main>
  );
}
