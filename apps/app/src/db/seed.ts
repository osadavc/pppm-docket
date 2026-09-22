/**
 * Demo data seeder — a believable hiring scenario for reviews, screenshots
 * and tests.
 *
 *   bun run db:seed            idempotent — skips what already exists
 *   bun run db:seed --reset    truncates every table first
 *
 * Staff accounts go through better-auth's internal adapter (the public
 * sign-up endpoint is closed), exactly as createStaffAccount does. Decisions
 * that have a service (rejections) use it so activity rows and simulated
 * notifications are consistent; the rest are direct inserts in transactions.
 * Every person and address is fictional (@example.com).
 */
import { createLocalAccountIssuer } from "better-auth/db";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";
import type { UserRole } from "./schema/enums";
import { buildCvPdf } from "./seed-pdf";
import { env } from "@/env";
import { logActivity } from "@/lib/activity/log";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth/guards";
import { DEFAULT_STAGES } from "@/lib/domain/default-stages";
import { calculateWeightedScore } from "@/lib/domain/scorecard";
import { rejection } from "@/lib/notifications/templates";
import { COMPANY_NAME } from "@/lib/company";
import { rejectApplicationAs } from "@/lib/services/application-decisions";
import { buildCvPath, uploadCv } from "@/lib/storage/attachments";
import { assertStorageConfigured, BUCKET } from "@/lib/storage/supabase";

const DAY = 86_400_000;
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

type SeedUser = { email: string; name: string; role: UserRole; jobTitle: string; department: string };

export const SEED_USERS: SeedUser[] = [
  { email: "hr@example.com", name: "Nadia Perera", role: "hr", jobTitle: "Talent Acquisition Lead", department: "People" },
  { email: "management@example.com", name: "Rohan Silva", role: "management", jobTitle: "Head of People", department: "People" },
  { email: "interviewone@example.com", name: "Dilhan Fernando", role: "interviewer", jobTitle: "Engineering Lead", department: "Engineering" },
  { email: "interviewtwo@example.com", name: "Sasha Wick", role: "interviewer", jobTitle: "Senior Engineer", department: "Engineering" },
];

/** FK-safe truncate order (children first). */
const TRUNCATE_TABLES = [
  "notifications", "activity_log", "attachments", "scorecard_revision_ratings", "scorecard_revisions",
  "scorecard_ratings", "scorecards", "interview_participants", "interviews", "application_stages",
  "applications", "candidates", "scorecard_criteria", "position_stages", "positions",
  "stage_template_criteria", "stage_template_stages", "stage_template_sets", "rate_limit_buckets",
  "verification", "account", "session", '"user"',
];

const FIRST = ["Amara", "Ben", "Chen", "Dara", "Elif", "Farid", "Grace", "Hugo", "Ines", "Jonah", "Kavya", "Leo", "Mira", "Noor", "Oskar", "Priya", "Quinn", "Ravi", "Sofia", "Tomas", "Uma", "Viktor", "Wren", "Ximena", "Yusuf", "Zara", "Aiden", "Bea", "Cyrus", "Dalia", "Emil", "Freya", "Gideon", "Hana", "Ivo", "Jade", "Kai", "Lena", "Milo", "Nia", "Omar", "Pia", "Rafael", "Sana", "Theo", "Vera"];
const LAST = ["Okafor", "Lindqvist", "Nakamura", "Haddad", "Moreau", "Petrov", "Achebe", "Sørensen", "Castillo", "Mensah", "Bianchi", "Kowalski", "Rahman", "Oyelaran", "Dubois", "Iyer", "Novak", "Tanaka", "Ferreira", "Kaur"];
const TITLES = ["Backend Engineer", "Software Engineer", "Platform Engineer", "Senior Developer", "API Engineer", "Site Reliability Engineer"];
const COMPANIES = ["Northwind", "Lumen Labs", "Brightline", "Harbour Systems", "Quill", "Atlas Freight", "Meridian Health", "Copperleaf"];

async function reset() {
  console.log("→ resetting all tables");
  await db.execute(sql.raw(`truncate table ${TRUNCATE_TABLES.join(", ")} restart identity cascade`));
}

async function seedUsers() {
  const ctx = await auth.$context;
  const ids = new Map<string, string>();
  for (const u of SEED_USERS) {
    const existing = await db.query.user.findFirst({ where: eq(schema.user.email, u.email) });
    if (existing) {
      ids.set(u.email, existing.id);
      console.log(`  = ${u.email} (exists)`);
      continue;
    }
    const created = await ctx.internalAdapter.createUser(
      { name: u.name, email: u.email, emailVerified: true, role: u.role, jobTitle: u.jobTitle, department: u.department, isActive: true },
      { method: "admin" },
    );
    if (!created) throw new Error(`Could not create ${u.email}`);
    await ctx.internalAdapter.linkAccount({
      providerId: "credential",
      issuer: createLocalAccountIssuer("credential"),
      accountId: created.id,
      userId: created.id,
      // Demo convenience: every seeded account signs in with its own email as the password.
      password: await ctx.password.hash(u.email),
    });
    ids.set(u.email, created.id);
    console.log(`  + ${u.email} (${u.role})`);
  }
  return ids;
}

type Staff = Record<"hr" | "manager" | "engLead" | "dev1", { id: string; name: string; email: string }>;

function sessionFor(s: { id: string; name: string; email: string }, role: UserRole): SessionUser {
  return { id: s.id, name: s.name, email: s.email, role, isActive: true };
}

/** Copy the default pipeline onto a position, returning stages in order. */
async function createPosition(
  staff: Staff,
  input: Omit<typeof schema.positions.$inferInsert, "createdById"> & { stages?: typeof DEFAULT_STAGES },
) {
  const { stages = DEFAULT_STAGES, ...values } = input;
  return db.transaction(async (tx) => {
    const [position] = await tx
      .insert(schema.positions)
      .values({ createdById: staff.hr.id, ...values })
      .returning({ id: schema.positions.id, title: schema.positions.title, status: schema.positions.status });
    const stageRows = await tx
      .insert(schema.positionStages)
      .values(
        stages.map((s, index) => ({
          positionId: position.id, name: s.name, description: s.description, kind: s.kind,
          requiresScorecard: s.requiresScorecard, minScorecards: s.minScorecards, slaDays: s.slaDays, orderIndex: index,
        })),
      )
      .returning({ id: schema.positionStages.id, name: schema.positionStages.name, orderIndex: schema.positionStages.orderIndex });
    const criteriaRows = stages.flatMap((s, index) =>
      s.criteria.map((c, ci) => ({ positionStageId: stageRows[index]!.id, label: c.label, description: c.description, weight: c.weight, orderIndex: ci })),
    );
    if (criteriaRows.length) await tx.insert(schema.scorecardCriteria).values(criteriaRows);
    await logActivity(tx, {
      actorId: staff.hr.id, action: "position.created", entityType: "position", entityId: position.id, positionId: position.id,
      summary: `${staff.hr.name} created “${position.title}” as a draft`, metadata: { status: "draft" },
    });
    return { ...position, stages: stageRows };
  });
}

async function approvalTrail(staff: Staff, position: { id: string; title: string }, submittedAt: Date, decidedAt: Date | null, approved: boolean, note: string | null) {
  await db.transaction(async (tx) => {
    await logActivity(tx, {
      actorId: staff.hr.id, action: "position.submitted_for_approval", entityType: "position", entityId: position.id, positionId: position.id,
      summary: `${staff.hr.name} submitted “${position.title}” for management approval`, metadata: { from: "draft", to: "pending_approval" },
    });
    await tx.update(schema.activityLog).set({ createdAt: submittedAt }).where(and(eq(schema.activityLog.positionId, position.id), eq(schema.activityLog.action, "position.submitted_for_approval")));
    if (decidedAt) {
      await logActivity(tx, {
        actorId: staff.manager.id, action: approved ? "position.approved" : "position.rejected", entityType: "position", entityId: position.id, positionId: position.id,
        summary: approved
          ? `${staff.manager.name} approved “${position.title}” — it is now open and on the careers board`
          : `${staff.manager.name} rejected “${position.title}” and returned it to draft`,
        metadata: { from: "pending_approval", to: approved ? "open" : "draft", note, submittedById: staff.hr.id },
      });
      await tx.update(schema.activityLog).set({ createdAt: decidedAt }).where(and(eq(schema.activityLog.positionId, position.id), eq(schema.activityLog.action, approved ? "position.approved" : "position.rejected")));
    }
  });
}

let cvStorage: string | null | undefined;
async function maybeUploadCv(candidate: { id: string; fullName: string; email: string; currentTitle: string | null; currentCompany: string | null }, applicationId: string) {
  if (cvStorage === undefined) {
    cvStorage = assertStorageConfigured();
    if (cvStorage) console.warn(`  ! ${cvStorage} — skipping CV uploads`);
  }
  if (cvStorage) return;
  const pdf = buildCvPdf({
    name: candidate.fullName, title: candidate.currentTitle ?? "Engineer", email: candidate.email,
    summary: `${candidate.currentTitle ?? "Engineer"} with several years of experience building reliable services and mentoring colleagues.`,
    skills: ["TypeScript", "PostgreSQL", "Distributed systems", "Observability", "Mentoring"],
    history: [
      `${candidate.currentCompany ?? "Previous employer"} — ${candidate.currentTitle ?? "Engineer"} (3 years)`,
      "Earlier: junior developer, internal tooling and integrations (2 years)",
    ],
  });
  const file = new File([pdf], `${candidate.fullName.replace(/\s+/g, "-").toLowerCase()}-cv.pdf`, { type: "application/pdf" });
  const path = buildCvPath(candidate.id, file);
  const uploaded = await uploadCv(path, file);
  if (!uploaded.ok) {
    console.warn(`  ! CV upload failed for ${candidate.fullName}: ${uploaded.error}`);
    return;
  }
  await db.insert(schema.attachments).values({
    kind: "cv", candidateId: candidate.id, applicationId, bucket: BUCKET, storagePath: path,
    fileName: file.name, mimeType: file.type, sizeBytes: file.size, uploadedById: null,
  });
}

type Placement = { stageIndex: number; daysInStage: number; source: "careers_site" | "referral" | "other"; appliedDaysAgo: number };

/** Create a candidate + application placed at a stage, with prior stages passed. */
async function placeApplication(
  staff: Staff,
  position: { id: string; title: string; stages: Array<{ id: string; name: string; orderIndex: number }> },
  index: number,
  placement: Placement,
) {
  const fullName = `${FIRST[index % FIRST.length]} ${LAST[(index * 7) % LAST.length]}`;
  const email = `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}${index}@example.com`;
  const currentTitle = TITLES[index % TITLES.length]!;
  const currentCompany = COMPANIES[index % COMPANIES.length]!;
  const appliedAt = daysAgo(placement.appliedDaysAgo);
  const fromCareers = placement.source === "careers_site";

  const result = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .insert(schema.candidates)
      .values({
        fullName, email, currentTitle, currentCompany, source: placement.source,
        location: ["Colombo", "Remote", "Kandy", "Galle"][index % 4], phone: `+94 7${String(1000000 + index * 3919).slice(0, 7)}`,
        referredById: placement.source === "referral" ? staff.dev1.id : null,
        createdById: fromCareers ? null : staff.hr.id, createdAt: appliedAt,
      })
      .returning({ id: schema.candidates.id, fullName: schema.candidates.fullName, email: schema.candidates.email, currentTitle: schema.candidates.currentTitle, currentCompany: schema.candidates.currentCompany });
    const current = position.stages[placement.stageIndex]!;
    const [application] = await tx
      .insert(schema.applications)
      .values({
        candidateId: candidate.id, positionId: position.id, currentStageId: current.id, status: "active", appliedAt,
        salaryExpectation: fromCareers ? ["120k–140k", "Open to discussion", "LKR 450k/month", null][index % 4] : null,
        createdById: fromCareers ? null : staff.hr.id,
      })
      .returning({ id: schema.applications.id });
    const entered = daysAgo(placement.daysInStage);
    await tx.insert(schema.applicationStages).values(
      position.stages.map((s) => ({
        applicationId: application.id, positionStageId: s.id, orderIndex: s.orderIndex,
        status: s.orderIndex < placement.stageIndex ? ("passed" as const) : s.orderIndex === placement.stageIndex ? ("in_progress" as const) : ("pending" as const),
        enteredAt: s.orderIndex < placement.stageIndex ? new Date(appliedAt.getTime() + s.orderIndex * 2 * DAY) : s.orderIndex === placement.stageIndex ? entered : null,
        completedAt: s.orderIndex < placement.stageIndex ? new Date(appliedAt.getTime() + (s.orderIndex + 1) * 2 * DAY) : null,
        decidedById: s.orderIndex < placement.stageIndex ? staff.hr.id : null,
      })),
    );
    await logActivity(tx, {
      actorId: fromCareers ? null : staff.hr.id, action: "application.applied", entityType: "application", entityId: application.id,
      applicationId: application.id, positionId: position.id,
      summary: fromCareers
        ? `${fullName} applied to “${position.title}” from the careers site and entered the pipeline at “${position.stages[0]!.name}”`
        : `${fullName} applied to “${position.title}” and entered the pipeline at “${position.stages[0]!.name}”`,
      metadata: { source: placement.source, origin: fromCareers ? "candidate" : "staff", firstStageId: position.stages[0]!.id, firstStageName: position.stages[0]!.name },
    });
    await tx.update(schema.activityLog).set({ createdAt: appliedAt }).where(and(eq(schema.activityLog.applicationId, application.id), eq(schema.activityLog.action, "application.applied")));
    for (const s of position.stages) {
      if (s.orderIndex >= placement.stageIndex || s.orderIndex + 1 > position.stages.length - 1) continue;
      const to = position.stages[s.orderIndex + 1]!;
      await logActivity(tx, {
        actorId: staff.hr.id, action: "application.advanced", entityType: "application", entityId: application.id, applicationId: application.id, positionId: position.id,
        summary: `${staff.hr.name} advanced ${fullName} from “${s.name}” to “${to.name}”`,
        metadata: { fromStageId: s.id, fromStageName: s.name, toStageId: to.id, toStageName: to.name, overridden: false },
      });
    }
    return { candidate, applicationId: application.id, stageRows: position.stages };
  });
  if (fromCareers || index % 3 === 0) await maybeUploadCv(result.candidate, result.applicationId);
  return { ...result, fullName };
}

async function submitScorecard(
  application: { applicationId: string },
  stage: { id: string },
  author: { id: string },
  values: { recommendation: "strong_no" | "no" | "yes" | "strong_yes"; ratings: number[]; strengths: string; concerns?: string; submittedDaysAgo: number },
  revise?: { ratings: number[]; strengths: string; daysAgo: number },
) {
  const [appStage] = await db
    .select({ id: schema.applicationStages.id })
    .from(schema.applicationStages)
    .where(and(eq(schema.applicationStages.applicationId, application.applicationId), eq(schema.applicationStages.positionStageId, stage.id)));
  const criteria = await db
    .select({ id: schema.scorecardCriteria.id, label: schema.scorecardCriteria.label, weight: schema.scorecardCriteria.weight })
    .from(schema.scorecardCriteria)
    .where(eq(schema.scorecardCriteria.positionStageId, stage.id))
    .orderBy(schema.scorecardCriteria.orderIndex);
  const rated = (ratings: number[]) => criteria.map((c, i) => ({ criterionId: c.id, rating: ratings[i] ?? ratings[0]!, comment: null as string | null, criterionLabel: c.label, criterionWeight: c.weight }));
  const score = (ratings: number[]) => {
    const s = calculateWeightedScore(criteria, rated(ratings).map((r) => ({ criterionId: r.criterionId, rating: r.rating })));
    return s === null ? null : s.toFixed(2);
  };
  const submittedAt = daysAgo(values.submittedDaysAgo);

  await db.transaction(async (tx) => {
    const [card] = await tx
      .insert(schema.scorecards)
      .values({
        applicationId: application.applicationId, applicationStageId: appStage!.id, authorId: author.id, status: "submitted",
        recommendation: values.recommendation, overallScore: score(revise?.ratings ?? values.ratings),
        strengths: revise?.strengths ?? values.strengths, concerns: values.concerns ?? null, submittedAt, revisionCount: revise ? 2 : 1,
      })
      .returning({ id: schema.scorecards.id });
    const finalRatings = rated(revise?.ratings ?? values.ratings);
    if (finalRatings.length) await tx.insert(schema.scorecardRatings).values(finalRatings.map((r) => ({ scorecardId: card!.id, ...r })));
    const [rev1] = await tx
      .insert(schema.scorecardRevisions)
      .values({ scorecardId: card!.id, revisionNumber: 1, authorId: author.id, recommendation: values.recommendation, overallScore: score(values.ratings), strengths: values.strengths, concerns: values.concerns ?? null, createdAt: submittedAt })
      .returning({ id: schema.scorecardRevisions.id });
    if (criteria.length) await tx.insert(schema.scorecardRevisionRatings).values(rated(values.ratings).map((r) => ({ revisionId: rev1!.id, ...r, createdAt: submittedAt })));
    await logActivity(tx, {
      actorId: author.id, action: "scorecard.submitted", entityType: "scorecard", entityId: card!.id, applicationId: application.applicationId, positionId: null,
      summary: `submitted feedback`, metadata: { applicationStageId: appStage!.id, stageId: stage.id },
    });
    if (revise) {
      const revisedAt = daysAgo(revise.daysAgo);
      const [rev2] = await tx
        .insert(schema.scorecardRevisions)
        .values({ scorecardId: card!.id, revisionNumber: 2, authorId: author.id, recommendation: values.recommendation, overallScore: score(revise.ratings), strengths: revise.strengths, concerns: values.concerns ?? null, createdAt: revisedAt })
        .returning({ id: schema.scorecardRevisions.id });
      if (criteria.length) await tx.insert(schema.scorecardRevisionRatings).values(rated(revise.ratings).map((r) => ({ revisionId: rev2!.id, ...r, createdAt: revisedAt })));
      await logActivity(tx, {
        actorId: author.id, action: "scorecard.updated", entityType: "scorecard", entityId: card!.id, applicationId: application.applicationId, positionId: null,
        summary: `revised feedback`, metadata: {
          applicationStageId: appStage!.id, stageId: stage.id, revisionNumber: 2,
          previous: { recommendation: values.recommendation, overallScore: score(values.ratings), strengths: values.strengths },
          current: { recommendation: values.recommendation, overallScore: score(revise.ratings), strengths: revise.strengths },
        },
      });
    }
  });
}

async function seedScenario(staff: Staff) {
  if (await db.query.positions.findFirst({ where: eq(schema.positions.title, "Senior Backend Engineer") })) {
    console.log("  = scenario already seeded (Senior Backend Engineer exists) — skipping");
    return;
  }
  const hrSession = sessionFor(staff.hr, "hr");

  // 1. Open position with a busy pipeline.
  const open = await createPosition(staff, {
    title: "Senior Backend Engineer", department: "Engineering", location: "Colombo · hybrid", description:
      "Own the services behind our hiring products: PostgreSQL, TypeScript, and the operational care that keeps them boring. You will pair with product, mentor two engineers and lead the reliability roadmap.",
    requirements: "5+ years building production services; deep PostgreSQL; comfortable owning on-call.",
    salaryMin: 150000, salaryMax: 190000, openings: 2, status: "open", hiringManagerId: staff.engLead.id,
    applicationDeadline: daysAgo(-21), submittedById: staff.hr.id, submittedAt: daysAgo(30), lastReviewDecision: "approved",
    reviewedById: staff.manager.id, reviewedAt: daysAgo(29), reviewNote: "Headcount confirmed for Q4.", openedAt: daysAgo(29), createdAt: daysAgo(32),
  });
  await approvalTrail(staff, open, daysAgo(30), daysAgo(29), true, "Headcount confirmed for Q4.");
  const [, phone, team, hm] = open.stages;
  await db.insert(schema.positionStageInterviewers).values([
    { positionStageId: phone!.id, userId: staff.engLead.id },
    { positionStageId: team!.id, userId: staff.engLead.id },
    { positionStageId: team!.id, userId: staff.dev1.id },
    { positionStageId: hm!.id, userId: staff.engLead.id },
  ]);
  await db.transaction((tx) => logActivity(tx, {
    actorId: staff.manager.id, action: "position.stage_panel_changed", entityType: "position", entityId: open.id, positionId: open.id,
    summary: `${staff.manager.name} set the panels for “${open.title}”`, metadata: {},
  }));

  // ~40 applications: 20 at review (fresh to stalled), 10 phone screen, 6 team interview, 2 HM, 2 offer.
  const placements: Placement[] = [];
  const sources: Placement["source"][] = ["careers_site", "referral", "other", "careers_site"];
  for (let i = 0; i < 20; i += 1) placements.push({ stageIndex: 0, daysInStage: [0, 1, 1, 3, 4, 7, 9, 12][i % 8]!, source: sources[i % 4]!, appliedDaysAgo: [0, 1, 1, 3, 4, 7, 9, 12][i % 8]! });
  for (let i = 0; i < 10; i += 1) placements.push({ stageIndex: 1, daysInStage: [1, 2, 5, 8][i % 4]!, source: sources[(i + 1) % 4]!, appliedDaysAgo: 10 + i });
  for (let i = 0; i < 6; i += 1) placements.push({ stageIndex: 2, daysInStage: [1, 3, 6][i % 3]!, source: sources[(i + 2) % 4]!, appliedDaysAgo: 18 + i });
  placements.push({ stageIndex: 3, daysInStage: 2, source: "referral", appliedDaysAgo: 24 }, { stageIndex: 3, daysInStage: 7, source: "careers_site", appliedDaysAgo: 25 });
  placements.push({ stageIndex: 4, daysInStage: 1, source: "referral", appliedDaysAgo: 27 }, { stageIndex: 4, daysInStage: 4, source: "careers_site", appliedDaysAgo: 28 });

  const apps: Array<Awaited<ReturnType<typeof placeApplication>> & { placement: Placement }> = [];
  for (const [i, placement] of placements.entries()) {
    apps.push({ ...(await placeApplication(staff, open, i, placement)), placement });
  }
  console.log(`  + ${apps.length} applications on “${open.title}”`);

  // Feedback. Phone screen (1 needed): most have the lead's card, a few not.
  const atPhone = apps.filter((a) => a.placement.stageIndex === 1);
  for (const [i, a] of atPhone.entries()) {
    if (i % 3 === 2) continue; // gate still blocked for these
    await submitScorecard(a, phone!, staff.engLead, {
      recommendation: (["yes", "strong_yes", "no"] as const)[i % 3]!, ratings: [[4, 4, 3], [5, 4, 5], [2, 3, 2]][i % 3]!,
      strengths: "Clear communicator with directly relevant service experience.", concerns: i % 3 === 2 ? "Thin on PostgreSQL depth." : undefined, submittedDaysAgo: Math.max(0, a.placement.daysInStage - 1),
    }, i === 0 ? { ratings: [4, 5, 3], strengths: "Clear communicator; on reflection their platform work is stronger than I first credited.", daysAgo: Math.max(0, a.placement.daysInStage - 2) } : undefined);
  }
  // Team interview needs 2: one candidate has both, the rest are deliberately gate-blocked with only one.
  const atTeam = apps.filter((a) => a.placement.stageIndex === 2);
  for (const [i, a] of atTeam.entries()) {
    await submitScorecard(a, team!, staff.engLead, { recommendation: i === 1 ? "no" : "yes", ratings: [4, 3, 4], strengths: "Broke the design problem down well and reasoned about trade-offs.", submittedDaysAgo: 1 });
    if (i === 0) await submitScorecard(a, team!, staff.dev1, { recommendation: "strong_yes", ratings: [5, 4, 5], strengths: "Best pairing session this quarter.", submittedDaysAgo: 0 });
  }
  // Earlier stages of the far-along candidates carry their historic feedback too.
  for (const a of apps.filter((x) => x.placement.stageIndex >= 3)) {
    await submitScorecard(a, phone!, staff.engLead, { recommendation: "strong_yes", ratings: [5, 5, 4], strengths: "Outstanding fit on paper and on the phone.", submittedDaysAgo: a.placement.appliedDaysAgo - 4 });
    await submitScorecard(a, team!, staff.engLead, { recommendation: "yes", ratings: [4, 4, 4], strengths: "Solid across the board.", submittedDaysAgo: a.placement.appliedDaysAgo - 9 });
    await submitScorecard(a, team!, staff.dev1, { recommendation: "yes", ratings: [4, 5, 3], strengths: "Great craft; a little quiet.", submittedDaysAgo: a.placement.appliedDaysAgo - 9 });
  }
  console.log("  + scorecards (one revised, team-interview gate blocked for most)");

  // ~8 rejections across reasons, through the real decision service (half emailed → simulated notifications).
  const reasons = ["insufficient_experience", "skills_mismatch", "failed_assessment", "communication_concerns", "salary_expectations", "right_to_work_or_location", "stronger_candidate_selected", "other"] as const;
  const notes = ["Two years short of the essential experience.", "Strong front-end profile; this is a backend role.", "Did not pass the take-home review.", "Struggled to explain past work concretely.", "Expectation 40% above the band.", "No right to work; visa sponsorship unavailable.", "Excellent, but two stronger finalists.", "Withdrew after the phone screen — logging as a rejection to close the loop."];
  const toReject = apps.filter((a) => a.placement.stageIndex <= 1).slice(-8);
  for (const [i, a] of toReject.entries()) {
    const template = rejection({ candidateName: a.fullName, positionTitle: open.title, companyName: COMPANY_NAME });
    const result = await rejectApplicationAs(hrSession, {
      applicationId: a.applicationId, reason: reasons[i]!, note: notes[i], notification: i % 2 === 0 ? template : undefined,
    });
    if (!result.ok) throw new Error(`Seed rejection failed: ${result.error}`);
  }
  console.log(`  + ${toReject.length} rejections (${Math.ceil(toReject.length / 2)} with simulated emails)`);

  // 2. Awaiting approval.
  const pending = await createPosition(staff, {
    title: "Operations Coordinator", department: "Operations", location: "Colombo", description: "Keep the office, vendors and onboarding running like clockwork.",
    requirements: "2+ years in operations or office management.", openings: 1, status: "pending_approval", hiringManagerId: staff.dev1.id,
    applicationDeadline: daysAgo(-30), submittedById: staff.hr.id, submittedAt: daysAgo(2), createdAt: daysAgo(5),
  });
  await approvalTrail(staff, pending, daysAgo(2), null, false, null);

  // 3. Draft, previously sent back once.
  const draft = await createPosition(staff, {
    title: "Product Designer", department: "Product", location: "Remote", description: "Own discovery and interaction design for the hiring products.",
    openings: 1, status: "draft", hiringManagerId: staff.manager.id, submittedById: staff.hr.id, submittedAt: daysAgo(8),
    lastReviewDecision: "rejected", reviewedById: staff.manager.id, reviewedAt: daysAgo(7), reviewNote: "Add a salary band and a deadline before we advertise.", createdAt: daysAgo(9),
  });
  await approvalTrail(staff, draft, daysAgo(8), daysAgo(7), false, "Add a salary band and a deadline before we advertise.");

  // 4. Filled, with measurable time to fill.
  const filled = await createPosition(staff, {
    title: "Customer Support Lead", department: "Support", location: "Colombo", description: "Lead a team of six support specialists.",
    openings: 1, status: "open", hiringManagerId: staff.dev1.id, applicationDeadline: daysAgo(20), submittedById: staff.hr.id, submittedAt: daysAgo(62),
    lastReviewDecision: "approved", reviewedById: staff.manager.id, reviewedAt: daysAgo(61), openedAt: daysAgo(60), createdAt: daysAgo(65),
  });
  await approvalTrail(staff, filled, daysAgo(62), daysAgo(61), true, null);
  const filledApps = [];
  for (let i = 0; i < 6; i += 1) {
    filledApps.push(await placeApplication(staff, filled, 100 + i, { stageIndex: i === 0 ? 4 : 1, daysInStage: 15, source: sources[i % 4]!, appliedDaysAgo: 50 - i }));
  }
  const hiredApp = filledApps[0]!;
  await db.transaction(async (tx) => {
    await tx.update(schema.applications).set({ status: "hired", decisionAt: daysAgo(12), decisionById: staff.hr.id }).where(eq(schema.applications.id, hiredApp.applicationId));
    await tx.update(schema.applicationStages).set({ status: "passed", completedAt: daysAgo(12) }).where(and(eq(schema.applicationStages.applicationId, hiredApp.applicationId), eq(schema.applicationStages.positionStageId, filled.stages[4]!.id)));
    await logActivity(tx, {
      actorId: staff.hr.id, action: "application.hired", entityType: "application", entityId: hiredApp.applicationId, applicationId: hiredApp.applicationId, positionId: filled.id,
      summary: `${staff.hr.name} hired ${hiredApp.fullName} for “${filled.title}” (1 of 1 opening filled)`, metadata: { hiredCount: 1, openings: 1 },
    });
  });
  for (const [i, a] of filledApps.slice(1).entries()) {
    const result = await rejectApplicationAs(hrSession, { applicationId: a.applicationId, reason: "stronger_candidate_selected", note: "Filled by a stronger finalist.", notification: i === 0 ? rejection({ candidateName: a.fullName, positionTitle: filled.title, companyName: COMPANY_NAME }) : undefined });
    if (!result.ok) throw new Error(`Seed rejection failed: ${result.error}`);
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.positions).set({ status: "filled", closedAt: daysAgo(10), closureNote: "Hired; team fully staffed." }).where(eq(schema.positions.id, filled.id));
    await logActivity(tx, {
      actorId: staff.hr.id, action: "position.filled", entityType: "position", entityId: filled.id, positionId: filled.id,
      summary: `${staff.hr.name} marked “${filled.title}” filled`, metadata: { from: "open", to: "filled", note: "Hired; team fully staffed." },
    });
  });
  console.log("  + pending, draft and filled positions");
}

async function main() {
  if (process.argv.includes("--reset")) await reset();

  console.log("→ seeding users");
  const ids = await seedUsers();
  const by = (email: string) => {
    const u = SEED_USERS.find((s) => s.email === email)!;
    return { id: ids.get(email)!, name: u.name, email };
  };
  const staff: Staff = {
    hr: by("hr@example.com"), manager: by("management@example.com"),
    engLead: by("interviewone@example.com"), dev1: by("interviewtwo@example.com"),
  };

  console.log("→ seeding hiring scenario");
  await seedScenario(staff);

  console.log("\nDemo accounts (password = email)");
  for (const u of SEED_USERS) console.log(`  ${u.role.padEnd(11)} ${u.email.padEnd(24)} ${u.name}`);
  console.log(`\nStart at ${env.NEXT_PUBLIC_APP_URL}/sign-in`);
}

await main();
process.exit(0);
