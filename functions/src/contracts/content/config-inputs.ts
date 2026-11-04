import { z } from "zod";
import { empty, objectId, version } from "../../domain/values.js";

export const getSpeechSchema = z.object({ wordId: objectId }).strict();
export type GetSpeechInput = z.output<typeof getSpeechSchema>;
export const saveSpeechSchema = z
  .object({
    wordId: objectId,
    listenAllowed: z.boolean(),
    expectedVersion: version,
    commandId: objectId,
  })
  .strict();
export type SaveSpeechInput = z.output<typeof saveSpeechSchema>;
export const getTopicSchema = z.object({ topicId: objectId }).strict();
export type GetTopicInput = z.output<typeof getTopicSchema>;
export const listTopicsSchema = empty;
export type ListTopicsInput = z.output<typeof listTopicsSchema>;
export const saveTopicSchema = z
  .object({
    topicId: objectId.optional(),
    name: z.string().trim().min(1).max(150),
    context: z.string().trim().min(1).max(2000),
    learnerRole: z.string().trim().min(1).max(300),
    aiRole: z.string().trim().min(1).max(300),
    goal: z.string().trim().min(1).max(1000),
    openingLine: z.string().trim().min(1).max(1000),
    guide: z.string().trim().min(1).max(2000),
    active: z.boolean(),
    expectedVersion: version,
    commandId: objectId,
  })
  .strict();
export type SaveTopicInput = z.output<typeof saveTopicSchema>;
export const getLimitSchema = empty;
export type GetLimitInput = z.output<typeof getLimitSchema>;
export const saveLimitSchema = z
  .object({
    maxSessionsPerDay: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    expectedVersion: version,
    commandId: objectId,
  })
  .strict();
export type SaveLimitInput = z.output<typeof saveLimitSchema>;
