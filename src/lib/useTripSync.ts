"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

// Keeps a trip page in step with other members' changes without Supabase
// Realtime: syncs when the tab becomes visible or regains focus, and polls
// every 30s while it's visible. Skips while offline or while `paused` (e.g.
// mid-drag or with a modal open) so the screen isn't swapped under the user.
// Returns a counter that increments on every sync, for children that load
// their own data (pass it as a prop and reload when it changes).
export function useTripSync(sync: () => void, { paused = false }: { paused?: boolean } = {}) {
  const [tick, setTick] = useState(0);
  const syncRef = useRef(sync);
  const pausedRef = useRef(paused);

  useEffect(() => {
    syncRef.current = sync;
    pausedRef.current = paused;
  });

  useEffect(() => {
    let last = Date.now();

    function run() {
      if (document.visibilityState !== "visible" || !navigator.onLine || pausedRef.current) return;
      // Focus and visibilitychange often fire together; don't sync twice.
      if (Date.now() - last < 2_000) return;
      last = Date.now();
      syncRef.current();
      setTick((t) => t + 1);
    }

    const interval = setInterval(run, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
    };
  }, []);

  return tick;
}
