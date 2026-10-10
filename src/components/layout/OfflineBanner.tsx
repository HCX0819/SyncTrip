"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const getSnapshot = () => navigator.onLine;
// Assume online during SSR and hydration so markup matches.
const getServerSnapshot = () => true;

/** Returns `true` while the browser reports a network connection. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function OfflineBanner() {
  const online = useOnlineStatus();

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div
          id="offline-banner"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            paddingTop: "env(safe-area-inset-top, 0px)",
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "6px 16px",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--text-muted)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--accent)",
                flexShrink: 0,
              }}
            />
            You&apos;re offline — showing saved data
          </div>
        </div>
      )}
    </div>
  );
}
