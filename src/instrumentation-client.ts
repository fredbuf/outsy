// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their
// browser. https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // No-op (SDK disabled) when the DSN env var is not set, e.g. locally or in CI.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of transactions for tracing. Lower this in production if
  // volume becomes a cost concern.
  tracesSampleRate: 1,

  // Log SDK information to the console while setting up. Keep false in prod.
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
