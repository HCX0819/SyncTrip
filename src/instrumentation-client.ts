// Runs in the browser before the app becomes interactive.
// No-op when NEXT_PUBLIC_SENTRY_DSN is unset (local dev / CI).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    // Sentry v11 replaced `sendDefaultPii` with `dataCollection`. Equivalent of
    // sendDefaultPii: false — never send user info, cookies, headers (incl. IPs),
    // request bodies, query strings, DB parameters or local variables.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
