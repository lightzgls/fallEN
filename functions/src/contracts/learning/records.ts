import { z } from "zod";
import { sourceSchema } from "../../domain/values.js";
export const membershipRecord = z
  .object({
    wordId: z.string(),
    active: z.boolean(),
    membershipVersion: z.number(),
    addedAt: z.date(),
    removedAt: z.date().optional(),
    source: z.string().optional(),
    sourceWordSetId: z.string().optional(),
    sourceRevisionId: z.string().optional(),
  })
  .passthrough();
export const planRecord = z
  .object({
    wordId: z.string(),
    cycleId: z.string(),
    level: z.number(),
    dueDate: z.string(),
    version: z.number(),
  })
  .passthrough();
export const memoryRecord = z
  .object({
    wordId: z.string(),
    version: z.number(),
    everRemembered: z.boolean(),
    lastChoice: z.enum(["REMEMBERED", "NOT_REMEMBERED"]).optional(),
    lastRatedAt: z.date().optional(),
    firstRememberedAt: z.date().optional(),
  })
  .passthrough();
export const itemRecord = z
  .object({
    wordId: z.string(),
    wordVersion: z.number(),
    position: z.number(),
    cycleId: z.string().optional(),
    planVersion: z.number().optional(),
    membershipVersion: z.number().optional(),
    ratedEventId: z.string().optional(),
  })
  .passthrough();
export const studyRecord = z
  .object({
    id: z.string(),
    mode: z.enum(["FLASHCARD", "SRS"]),
    source: sourceSchema,
    startWordId: z.string(),
    plannedCardCount: z.number(),
    plannedWords: z.array(
      z.object({ wordId: z.string(), wordVersion: z.number() }),
    ),
    status: z.string(),
    startedAt: z.date(),
    endedAt: z.date().optional(),
    placeVersion: z.number().optional(),
  })
  .passthrough();
export const placeRecord = z
  .object({
    source: sourceSchema,
    nextWordId: z.string().nullable().optional(),
    completed: z.boolean(),
    updatedAt: z.date(),
    version: z.number(),
  })
  .passthrough();
export const ratingRecord = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    wordId: z.string(),
    mode: z.enum(["FLASHCARD", "SRS"]),
    choice: z.enum(["REMEMBERED", "NOT_REMEMBERED"]),
    savedAt: z.date(),
    dayKey: z.string(),
    previousLevel: z.number().optional(),
    level: z.number().optional(),
  })
  .passthrough();
export const dayRecord = z
  .object({
    dayKey: z.string(),
    firstResultAt: z.date(),
    totalCount: z.number(),
    flashcardCount: z.number(),
    srsCount: z.number(),
    matchCount: z.number(),
    listenCount: z.number(),
  })
  .passthrough();
export const summaryRecord = z
  .object({
    learnedCount: z.number(),
    matchBest: z.number(),
    listenBest: z.number(),
    streakAtLastStudyDay: z.number(),
    lastStudyDayKey: z.string().optional(),
  })
  .passthrough();
export const recentSetRecord = z
  .object({
    id: z.string().optional(),
    wordSetId: z.string(),
    lastActivityAt: z.date(),
  })
  .passthrough();
export type Membership = z.infer<typeof membershipRecord>;
export type ReviewPlan = z.infer<typeof planRecord>;
export type Memory = z.infer<typeof memoryRecord>;
export type StudyItem = z.infer<typeof itemRecord>;
export type Study = z.infer<typeof studyRecord>;
export type Place = z.infer<typeof placeRecord>;
export type Rating = z.infer<typeof ratingRecord>;
export type LearningDay = z.infer<typeof dayRecord>;
export type Summary = z.infer<typeof summaryRecord>;
export type RecentSet = z.infer<typeof recentSetRecord>;
