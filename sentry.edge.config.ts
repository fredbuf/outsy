// This file configures the initialization of Sentry for edge features
// (middleware, edge routes, and so on).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // No-op (SDK disabled) when the DSN env var is not set, e.g. locally or in CI.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 1,

  debug: false,
});
