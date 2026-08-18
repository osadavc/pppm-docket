import "server-only";

// `better-auth/minimal` excludes the built-in database adapters we do not use
// (we bring our own via drizzleAdapter), which keeps the server bundle smaller.
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
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
    // Keeps `session.user.role` available without a DB round-trip per request.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // Must be last — lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
