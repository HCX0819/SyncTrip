"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Replaces the root layout when it errors, so it must render its own
// <html>/<body> and can't rely on globals.css being loaded.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          boxSizing: "border-box",
          background: "#faf6ef",
          color: "#202124",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <title>Something went wrong — SyncTrip</title>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "24px", fontWeight: 500, margin: "0 0 8px" }}>
          Something went wrong
        </h1>
        <p style={{ color: "#5f6368", fontSize: "14px", margin: "0 0 24px", maxWidth: 320 }}>
          SyncTrip hit an unexpected error. Please try again.
        </p>
        <button
          onClick={() => retry()}
          style={{
            padding: "11px 24px",
            border: "none",
            borderRadius: "10px",
            background: "#b85c38",
            color: "#fffdf9",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {error.digest && (
          <p style={{ color: "#5f6368", fontSize: "11px", marginTop: "24px" }}>
            Error reference: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
