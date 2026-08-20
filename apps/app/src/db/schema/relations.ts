import { relations } from "drizzle-orm";
import { activityLog } from "./activity";
import { applications, applicationStages } from "./applications";
import { attachments } from "./attachments";
import { user } from "./auth";
import { candidates } from "./candidates";
import { interviewParticipants, interviews } from "./interviews";
import { notifications } from "./notifications";
import {
  positionStageInterviewers,
  positionStages,
  scorecardCriteria,
} from "./pipeline";
import { positions } from "./positions";
import { scorecardRatings, scorecards } from "./scorecards";
import {
  stageTemplateCriteria,
  stageTemplateSets,
  stageTemplateStages,
} from "./templates";

export const userDomainRelations = relations(user, ({ many }) => ({
  positionsCreated: many(positions, { relationName: "positionCreatedBy" }),
  positionsManaged: many(positions, { relationName: "positionHiringManager" }),
  interviewParticipations: many(interviewParticipants),
  scorecardsAuthored: many(scorecards),
  activity: many(activityLog),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  hiringManager: one(user, {
    fields: [positions.hiringManagerId],
    references: [user.id],
    relationName: "positionHiringManager",
  }),
  createdBy: one(user, {
    fields: [positions.createdById],
    references: [user.id],
    relationName: "positionCreatedBy",
  }),
  submittedBy: one(user, {
    fields: [positions.submittedById],
    references: [user.id],
    relationName: "positionSubmittedBy",
  }),
  reviewedBy: one(user, {
    fields: [positions.reviewedById],
    references: [user.id],
    relationName: "positionReviewedBy",
  }),
  stages: many(positionStages),
  applications: many(applications),
  attachments: many(attachments),
  activity: many(activityLog),
}));

export const stageTemplateSetsRelations = relations(
  stageTemplateSets,
  ({ one, many }) => ({
    createdBy: one(user, {
      fields: [stageTemplateSets.createdById],
      references: [user.id],
    }),
    stages: many(stageTemplateStages),
  }),
);

export const stageTemplateStagesRelations = relations(
  stageTemplateStages,
  ({ one, many }) => ({
    set: one(stageTemplateSets, {
      fields: [stageTemplateStages.setId],
      references: [stageTemplateSets.id],
    }),
    criteria: many(stageTemplateCriteria),
  }),
);

export const stageTemplateCriteriaRelations = relations(
  stageTemplateCriteria,
  ({ one }) => ({
    stage: one(stageTemplateStages, {
      fields: [stageTemplateCriteria.templateStageId],
      references: [stageTemplateStages.id],
    }),
  }),
);

export const positionStagesRelations = relations(positionStages, ({ one, many }) => ({
  position: one(positions, {
    fields: [positionStages.positionId],
    references: [positions.id],
  }),
  criteria: many(scorecardCriteria),
  applicationStages: many(applicationStages),
  interviewers: many(positionStageInterviewers),
}));

export const positionStageInterviewersRelations = relations(
  positionStageInterviewers,
  ({ one }) => ({
    stage: one(positionStages, {
      fields: [positionStageInterviewers.positionStageId],
      references: [positionStages.id],
    }),
    user: one(user, {
      fields: [positionStageInterviewers.userId],
      references: [user.id],
    }),
  }),
);

export const scorecardCriteriaRelations = relations(
  scorecardCriteria,
  ({ one, many }) => ({
    stage: one(positionStages, {
      fields: [scorecardCriteria.positionStageId],
      references: [positionStages.id],
    }),
    ratings: many(scorecardRatings),
  }),
);

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [candidates.createdById],
    references: [user.id],
    relationName: "candidateCreatedBy",
  }),
  referredBy: one(user, {
    fields: [candidates.referredById],
    references: [user.id],
    relationName: "candidateReferredBy",
  }),
  applications: many(applications),
  attachments: many(attachments),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  candidate: one(candidates, {
    fields: [applications.candidateId],
    references: [candidates.id],
  }),
  position: one(positions, {
    fields: [applications.positionId],
    references: [positions.id],
  }),
  currentStage: one(positionStages, {
    fields: [applications.currentStageId],
    references: [positionStages.id],
  }),
  decisionBy: one(user, {
    fields: [applications.decisionById],
    references: [user.id],
    relationName: "applicationDecisionBy",
  }),
  createdBy: one(user, {
    fields: [applications.createdById],
    references: [user.id],
    relationName: "applicationCreatedBy",
  }),
  stages: many(applicationStages),
  interviews: many(interviews),
  scorecards: many(scorecards),
  attachments: many(attachments),
  activity: many(activityLog),
}));

export const applicationStagesRelations = relations(
  applicationStages,
  ({ one, many }) => ({
    application: one(applications, {
      fields: [applicationStages.applicationId],
      references: [applications.id],
    }),
    positionStage: one(positionStages, {
      fields: [applicationStages.positionStageId],
      references: [positionStages.id],
    }),
    decidedBy: one(user, {
      fields: [applicationStages.decidedById],
      references: [user.id],
    }),
    interviews: many(interviews),
    scorecards: many(scorecards),
  }),
);

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  application: one(applications, {
    fields: [interviews.applicationId],
    references: [applications.id],
  }),
  applicationStage: one(applicationStages, {
    fields: [interviews.applicationStageId],
    references: [applicationStages.id],
  }),
  createdBy: one(user, {
    fields: [interviews.createdById],
    references: [user.id],
  }),
  participants: many(interviewParticipants),
  scorecards: many(scorecards),
}));

export const interviewParticipantsRelations = relations(
  interviewParticipants,
  ({ one }) => ({
    interview: one(interviews, {
      fields: [interviewParticipants.interviewId],
      references: [interviews.id],
    }),
    user: one(user, {
      fields: [interviewParticipants.userId],
      references: [user.id],
    }),
  }),
);

export const scorecardsRelations = relations(scorecards, ({ one, many }) => ({
  application: one(applications, {
    fields: [scorecards.applicationId],
    references: [applications.id],
  }),
  applicationStage: one(applicationStages, {
    fields: [scorecards.applicationStageId],
    references: [applicationStages.id],
  }),
  interview: one(interviews, {
    fields: [scorecards.interviewId],
    references: [interviews.id],
  }),
  author: one(user, {
    fields: [scorecards.authorId],
    references: [user.id],
  }),
  ratings: many(scorecardRatings),
}));

export const scorecardRatingsRelations = relations(scorecardRatings, ({ one }) => ({
  scorecard: one(scorecards, {
    fields: [scorecardRatings.scorecardId],
    references: [scorecards.id],
  }),
  criterion: one(scorecardCriteria, {
    fields: [scorecardRatings.criterionId],
    references: [scorecardCriteria.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  candidate: one(candidates, {
    fields: [attachments.candidateId],
    references: [candidates.id],
  }),
  application: one(applications, {
    fields: [attachments.applicationId],
    references: [applications.id],
  }),
  position: one(positions, {
    fields: [attachments.positionId],
    references: [positions.id],
  }),
  uploadedBy: one(user, {
    fields: [attachments.uploadedById],
    references: [user.id],
  }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  actor: one(user, {
    fields: [activityLog.actorId],
    references: [user.id],
  }),
  application: one(applications, {
    fields: [activityLog.applicationId],
    references: [applications.id],
  }),
  position: one(positions, {
    fields: [activityLog.positionId],
    references: [positions.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipientUser: one(user, {
    fields: [notifications.recipientUserId],
    references: [user.id],
  }),
  recipientCandidate: one(candidates, {
    fields: [notifications.recipientCandidateId],
    references: [candidates.id],
  }),
  interview: one(interviews, {
    fields: [notifications.interviewId],
    references: [interviews.id],
  }),
  application: one(applications, {
    fields: [notifications.applicationId],
    references: [applications.id],
  }),
}));
