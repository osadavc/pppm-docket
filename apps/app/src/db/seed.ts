/**
 * Demo data seeder.
 *
 *   bun run db:seed            idempotent — skips users that already exist
 *   bun run db:seed --reset    truncates every table first
 *
 * Users are created through `auth.api.signUpEmail()` rather than a raw insert:
 * the account password hash must be produced by better-auth's own hasher or
 * nobody can log in. Role is patched afterwards, because `role` is declared
 * with `input: false` and cannot be set at signup.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import { auth } from "@/lib/auth";
import { env } from "@/env";
import * as schema from "./schema";
import type { UserRole } from "./schema/enums";

type SeedUser = {
  email: string;
  name: string;
  role: UserRole;
  jobTitle: string;
  department: string;
};

const USERS: SeedUser[] = [
  {
    email: "hr@docket.test",
    name: "Nadia Perera",
    role: "hr",
    jobTitle: "Talent Acquisition Lead",
    department: "People",
  },
  {
    email: "manager@docket.test",
    name: "Rohan Silva",
    role: "management",
    jobTitle: "Head of People",
    department: "People",
  },
  {
    email: "eng.lead@docket.test",
    name: "Dilhan Fernando",
    role: "interviewer",
    jobTitle: "Engineering Lead",
    department: "Engineering",
  },
  {
    email: "dev1@docket.test",
    name: "Sasha Wick",
    role: "interviewer",
    jobTitle: "Senior Engineer",
    department: "Engineering",
  },
  {
    email: "ops.lead@docket.test",
    name: "Maya Gomez",
    role: "interviewer",
    jobTitle: "Operations Manager",
    department: "Operations",
  },
];

/** FK-safe truncate order (children first). */
const TRUNCATE_TABLES = [
  "notifications",
  "activity_log",
  "attachments",
  "scorecard_ratings",
  "scorecards",
  "interview_participants",
  "interviews",
  "application_stages",
  "applications",
  "candidates",
  "scorecard_criteria",
  "position_stages",
  "positions",
  "stage_template_criteria",
  "stage_template_stages",
  "stage_template_sets",
  "verification",
  "account",
  "session",
  '"user"',
];

async function reset() {
  console.log("→ resetting all tables");
  await db.execute(
    sql.raw(`truncate table ${TRUNCATE_TABLES.join(", ")} restart identity cascade`),
  );
}

async function seedUsers() {
  for (const u of USERS) {
    const existing = await db.query.user.findFirst({
      where: eq(schema.user.email, u.email),
    });

    if (existing) {
      console.log(`  = ${u.email} (exists)`);
      continue;
    }

    await auth.api.signUpEmail({
      body: {
        name: u.name,
        email: u.email,
        password: env.SEED_PASSWORD,
      },
    });

    // role / department are input:false or not part of signup, so patch them.
    await db
      .update(schema.user)
      .set({
        role: u.role,
        jobTitle: u.jobTitle,
        department: u.department,
        emailVerified: true,
        isActive: true,
      })
      .where(eq(schema.user.email, u.email));

    console.log(`  + ${u.email} (${u.role})`);
  }
}

async function main() {
  const shouldReset = process.argv.includes("--reset");
  if (shouldReset) await reset();

  console.log("→ seeding users");
  await seedUsers();

  console.log("\nDemo accounts (password: %s)", env.SEED_PASSWORD);
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(11)} ${u.email.padEnd(24)} ${u.name}`);
  }
  console.log("\nStart at http://localhost:3000/sign-in");
}

await main();
process.exit(0);
