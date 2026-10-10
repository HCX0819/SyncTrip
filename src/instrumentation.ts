import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Reports errors from Server Components, Route Handlers, Server Actions and proxy.
// Sentry drops events when it was never initialised (no DSN), so this is safe without config.
export const onRequestError = Sentry.captureRequestError;
