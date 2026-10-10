import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
    ],
  },
};

export default withSentryConfig(
  withPWA({
    dest: "public",
    disable: process.env.NODE_ENV === "development",
    register: true,
    fallbacks: { document: "/~offline" },
  })(nextConfig),
  {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    // Only upload source maps when a token is available (e.g. Vercel production builds).
    sourcemaps: {
      disable: !process.env.SENTRY_AUTH_TOKEN,
    },
    widenClientFileUpload: true,
  }
);
