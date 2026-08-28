import "server-only";

// `better-auth/minimal` excludes the built-in database adapters we do not use
// (we bring our own via drizzleAdapter), which keeps the server bundle smaller.
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { DEACTIVATED_ACCOUNT_ERROR } from "@/lib/auth/errors";

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
  },

  user: {
    additionalFields: {
      /**
       * Domain role. `input: false` is what stops a self-signup from minting an
       * HR account — role can only be set by the seed script or by Management
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

  databaseHooks: {
    session: {
      create: {
        async before(session) {
          const [sessionUser] = await db
            .select({ isActive: schema.user.isActive })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
            .limit(1);

          if (sessionUser?.isActive === false) {
            throw APIError.from("FORBIDDEN", DEACTIVATED_ACCOUNT_ERROR);
          }
        },
      },
    },
  },

  // Must be last — lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
