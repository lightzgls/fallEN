import { z } from "zod";
import { empty, objectId, sourceSchema, version } from "../../domain/values.js";
export { empty };
export const wordCommand = z.object({ wordId: objectId, commandId: objectId });
export const saveWordSchema = wordCommand
  .extend({
    source: z.enum(["DICTIONARY", "FLASHCARD", "EXTERNAL_LOOKUP", "SHARE"]),
    expectedMembershipVersion: version.optional(),
    studyId: objectId.optional(),
    releaseId: objectId.optional(),
  })
  .strict();
export const removeWordSchema = wordCommand
  .extend({ expectedMembershipVersion: version })
  .strict();
export const savedPageSchema = z
  .object({
    cursor: z.string().max(1024).optional(),
    pageSize: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export const startStudySchema = z
  .object({
    source: sourceSchema,
    startMode: z.enum(["START_OVER", "CONTINUE", "FROM_WORD"]),
    startWordId: objectId.optional(),
    commandId: objectId,
  })
  .strict();
export const startReviewSchema = z.object({ commandId: objectId }).strict();
export const endStudySchema = z
  .object({ sessionId: objectId, commandId: objectId })
  .strict();
export const studySourceSchema = z.object({ source: sourceSchema }).strict();
export const ratingContextSchema = z
  .object({ sessionId: objectId, wordId: objectId })
  .strict();
export const ratingSchema = z
  .object({
    sessionId: objectId,
    wordId: objectId,
    choice: z.enum(["REMEMBERED", "NOT_REMEMBERED"]),
    eventId: objectId,
    expectedMemoryVersion: version,
    expectedPlaceVersion: version.optional(),
    expectedPlanVersion: version.optional(),
    cycleId: objectId.optional(),
    membershipVersion: version.optional(),
  })
  .strict();
export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid date",
  );
export const dateRangeSchema = z
  .object({ from: isoDay, to: isoDay })
  .strict()
  .refine(
    (v) =>
      v.from <= v.to &&
      (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 365,
    "Date range must be at most 366 days",
  );
export const dayActivitySchema = z.object({ dayKey: isoDay }).strict();
export const recentSetsSchema = z
  .object({ cursor: z.string().max(1024).optional() })
  .strict();
export type SaveWordInput = z.infer<typeof saveWordSchema>;
export type RemoveWordInput = z.infer<typeof removeWordSchema>;
export type SavedPageInput = z.infer<typeof savedPageSchema>;
export type StartStudyInput = z.infer<typeof startStudySchema>;
export type StartReviewInput = z.infer<typeof startReviewSchema>;
export type EndStudyInput = z.infer<typeof endStudySchema>;
export type SourceInput = z.infer<typeof studySourceSchema>;
export type RatingContextInput = z.infer<typeof ratingContextSchema>;
export type RatingInput = z.infer<typeof ratingSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type DayActivityInput = z.infer<typeof dayActivitySchema>;
export type RecentSetsInput = z.infer<typeof recentSetsSchema>;
