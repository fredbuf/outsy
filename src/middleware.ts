import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const secret = process.env.INGEST_SECRET;

  // Fail closed: if the secret is not configured, deny all access.
  if (!secret) {
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const colonIndex = decoded.indexOf(":");
    const password = colonIndex !== -1 ? decoded.slice(colonIndex + 1) : "";

    if (password === secret) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="Admin"`,
    },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
