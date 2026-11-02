import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Handle OPTIONS Preflight CORS Requests for /api/public
  if (request.method === "OPTIONS" && pathname.startsWith("/api/public")) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-idempotency-key",
      },
    });
  }

  // 1. Bypass public assets, static files, login pages, and public ecommerce API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/card/") ||
    pathname.endsWith(".html") ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf|eot)$/i.test(pathname) ||
    pathname.startsWith("/api/public") ||
    pathname === "/api/auth/login" ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  // 2. Extract and verify session cookie
  const sessionCookie = request.cookies.get("pgs_session")?.value;
  const verifiedSession = sessionCookie ? await verifyToken(sessionCookie) : null;

  // 3. Block access if unauthenticated
  if (!verifiedSession) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { success: false, error: "Unauthenticated. Please log in." },
        { status: 401 }
      );
    }
    // Redirect web requests to login page
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Enforce strict route lock for Gate Guard / Security role (Kiosk screen only)
  if (verifiedSession.role === "Guard" || verifiedSession.role === "Security") {
    if (pathname.startsWith("/api")) {
      const allowedGuardApis = [
        "/api/auth/",
        "/api/hr/kiosk",
        "/api/locations",
      ];
      const isAllowedApi = allowedGuardApis.some((prefix) =>
        pathname.startsWith(prefix)
      );
      if (!isAllowedApi) {
        return NextResponse.json(
          {
            success: false,
            error: "Access Denied. Gate Guard account is restricted to Kiosk operations only.",
          },
          { status: 403 }
        );
      }
      return NextResponse.next();
    }

    if (pathname !== "/guard/kiosk") {
      const kioskUrl = new URL("/guard/kiosk", request.url);
      return NextResponse.redirect(kioskUrl);
    }
  }

  // 5. Proceed to destination route
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes, except static files, assets and images
    "/((?!_next/static|_next/image|favicon.ico|card/|card-preview|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)",
  ],
};
