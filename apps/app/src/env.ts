import { z } from "zod";

/**
 * Validated at import time so a missing variable fails loudly at boot rather than
 * surfacing later as an opaque "undefined is not a valid connection string".
 */
/** Catches a placeholder left in .env.local before it reaches the driver. */
const postgresUrl = (name: string) =>
  z
    .string()
    .min(1, `${name} is required`)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), {
      message: `${name} must start with postgresql://`,
    })
    .refine((v) => !v.includes("<"), {
      message: `${name} still contains a <placeholder> — copy the real string from Supabase -> Connect`,
    })
    .refine((v) => URL.canParse(v), { message: `${name} is not a valid URL` });

const schema = z.object({
  // Database — DATABASE_URL is the transaction pooler (6543, prepare:false);
  // DIRECT_URL is the session pooler (5432) used for DDL, migrations and studio.
  DATABASE_URL: postgresUrl("DATABASE_URL"),
  DIRECT_URL: postgresUrl("DIRECT_URL"),

  // Supabase Storage (CV uploads). The service role key is server-only.
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default("cv"),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),
  BETTER_AUTH_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),

  // Email — optional until Resend is set up; NOTIFICATIONS_ENABLED gates sending.
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Docket <onboarding@resend.dev>"),
  NOTIFICATIONS_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  DEMO_EMAIL_REDIRECT: z.string().optional().default(""),

  // Seed
  SEED_PASSWORD: z.string().default("Password123!"),
});

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  NOTIFICATIONS_ENABLED: process.env.NOTIFICATIONS_ENABLED,
  DEMO_EMAIL_REDIRECT: process.env.DEMO_EMAIL_REDIRECT,
  SEED_PASSWORD: process.env.SEED_PASSWORD,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration. Check apps/app/.env.local:\n${issues}`,
  );
}

export const env = parsed.data;
