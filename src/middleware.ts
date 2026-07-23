import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  // Lascia passare asset e file “pubblici” necessari
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/robots.txt")) return true;
  if (pathname.startsWith("/sitemap")) return true;
  if (pathname.startsWith("/manifest")) return true;
  if (pathname.startsWith("/icons")) return true;
  if (pathname.startsWith("/images")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER || "";
  const pass = process.env.BASIC_AUTH_PASS || "";

  // Se non impostate, non blocchiamo nulla (comodo per “andare live”)
  if (!user || !pass) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Non bloccare file statici
  if (isPublicPath(pathname)) return NextResponse.next();

  // bloccate con token temporaneo le API quelle private: 

  if (pathname.startsWith("/api") && !pathname.startsWith("/api/admin")) {
  return NextResponse.next();
  }

  // Il test Wallyfor usa la sessione NextAuth e verifica ADMIN_EMAILS
  // direttamente nell'endpoint. La vecchia Basic Auth del middleware
  // impedirebbe alla richiesta autenticata dalla home di raggiungerlo.
  if (pathname === "/api/admin/wallyfor/pending-test") {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="LedVelvet Staging"',
      },
    });
  }

  const b64 = auth.split(" ")[1] || "";
  let decoded = "";
  try {
    decoded = atob(b64);
  } catch {
    return new NextResponse("Bad auth header", { status: 401 });
  }

  const [u, p] = decoded.split(":");

  if (u === user && p === pass) return NextResponse.next();

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="LedVelvet Staging"',
    },
  });
}

export const config = {
  // Applica a tutto, esclusi asset gestiti da isPublicPath
  matcher: ["/:path*"],
};
