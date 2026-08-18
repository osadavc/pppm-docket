import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`; it runs on the Node.js
 * runtime by default.
 *
 * This check is OPTIMISTIC only — cookie presence is not proof of a valid
 * session, and no role check happens here. It exists purely to avoid rendering
 * a protected shell for an obviously-logged-out visitor. Real authorization is
 * in the layout guards, the Server Actions and the query layer.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/positions",
  "/candidates",
  "/applications",
  "/interviews",
  "/agenda",
  "/reports",
  "/settings",
  "/admin",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
