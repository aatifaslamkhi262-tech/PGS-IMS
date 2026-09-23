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
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
      },
    });
  }

  // 1. Bypass public assets, login pages, seeding scripts, and public ecommerce API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api/public") ||
    pathname === "/api/seed" ||
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

  // 4. Proceed to destination route
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes, except static files and assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
