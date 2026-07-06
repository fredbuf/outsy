"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// Reports otherwise-unhandled render errors to Sentry, then shows Next.js's
// default error page — same appearance as before this boundary existed.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* `statusCode` is required by NextError's props but unused when the
            status is unknown; 0 renders the generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
