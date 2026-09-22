import "server-only";

// `better-auth/minimal` excludes the built-in database adapters we do not use
// (we bring our own via drizzleAdapter), which keeps the server bundle smaller.
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env";

export const auth = betterAuth({
  appName: "Docket",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // No verification mailer wired yet; sign-in works immediately.
    requireEmailVerification: false,
    /**
     * Accounts are provisioned by management (createStaffAccount) or the
     * seed, both of which go through the internal adapter. The public
     * sign-up endpoint is switched off so nobody can mint an account by
     * visiting a URL.
     */
    disableSignUp: true,
  },

  user: {
    additionalFields: {
      /**
       * Domain role. `input: false` is what stops a self-signup from minting an
       * HR account, role can only be set by the seed script or by Management
       * through /admin/users.
       */
      role: {
        type: "string",
        required: false,
        defaultValue: "interviewer",
        input: false,
      },
      jobTitle: { type: "string", required: false, input: true },
      department: { type: "string", required: false, input: true },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },

  databaseHooks: {
    session: {
      create: {
        /**
         * A deactivated account never gets a session: sign-in is refused here,
         * before any cookie is issued, with a message the form can show. The
         * guards treat an inactive user as signed out for anything that
         * slipped through (an old cookie), so this is the front door and
         * `getSession` is the back.
         */
        before: async (session) => {
          const [row] = await db
            .select({ isActive: schema.user.isActive })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId));
          if (row && !row.isActive) {
            throw new APIError("FORBIDDEN", {
              message: "This account has been deactivated. Contact your administrator.",
              code: "ACCOUNT_DEACTIVATED",
            });
          }
        },
      },
    },
  },

  /**
   * The built-in limiter (3 sign-ins per 10 s) stays on everywhere except
   * the e2e server, which signs several synthetic users in back to back.
   */
  ...(process.env.AUTH_RATE_LIMIT === "off" ? { rateLimit: { enabled: false } } : {}),

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    /**
     * Deliberately OFF. With the cookie cache on, better-auth returns the
     * signed session payload straight from the cookie without reading the
     * database, so a role change would not be visible for up to maxAge.
     * Role changes must take effect on the user’s very next request, so we pay
     * for one session lookup per request instead.
     */
    cookieCache: { enabled: false },
  },

  // Must be last, lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
