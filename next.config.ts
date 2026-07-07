import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Sentry build-time options:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  //
  // Org/project/auth for source-map upload are read from the environment
  // (SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN). When they are absent
  // (local dev, CI) the upload is skipped and the build still succeeds.

  // Only print upload logs when the build fails.
  silent: true,

  // Upload a larger set of source maps for prettier stack traces (increases
  // build time).
  widenClientFileUpload: true,

  // Strip Sentry logger statements from the client bundle to save size.
  disableLogger: true,
});
