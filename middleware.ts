import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protegge tutto sotto /admin
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const pass = process.env.ADMIN_PASSWORD || "";
  const auth = req.headers.get("authorization") || "";

  if (!pass) return new NextResponse("ADMIN_PASSWORD missing", { status: 500 });

  // Basic Auth: admin:<password>
  const expected = "Basic " + Buffer.from(`admin:${pass}`).toString("base64");

  if (auth === expected) return NextResponse.next();

  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LedVelvet Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
