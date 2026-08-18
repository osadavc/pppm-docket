import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`; it runs on the Node.js
 * runtime by default.
 *
 * This check is OPTIMISTIC only — cookie presence is not proof of a valid
 * session, and no role check happens here. It exists to redirect obviously
 * logged-out visitors before a protected shell renders. Real authorization
 * lives in the layout guards, the Server Actions and the query layer.
 *
 * Deny by default: anything not listed as public is treated as internal, so a
 * new page cannot accidentally ship unprotected by being left off a list.
 */
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/careers"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    // Preserve where they were heading so sign-in can return them there.
    if (pathname !== "/") {
      url.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except API routes (better-auth owns /api/auth), Next internals
    // and static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
