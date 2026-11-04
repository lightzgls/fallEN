import { z } from "zod";
import { sourceSchema } from "../../domain/values.js";
import { ttsSchema } from "./inputs.js";
export const sourceWordRecord = z
  .object({
    wordId: z.string(),
    wordVersion: z.number(),
    position: z.number(),
    focusMeaningId: z.string().optional(),
  })
  .passthrough();
export const speechRecord = z
  .object({
    provider: z.string().optional(),
    text: z.string().optional(),
    listenAllowed: z.boolean(),
    version: z.number(),
  })
  .passthrough();
export const gameRecord = z
  .object({
    id: z.string(),
    mode: z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
    source: sourceSchema,
    status: z.string(),
    currentStreak: z.number(),
    bestStreak: z.number(),
    version: z.number(),
    nextRoundOrder: z.number(),
    sourceCount: z.number(),
    sourceHash: z.string(),
    sourceManifest: z.array(sourceWordRecord).optional(),
    commandId: z.string(),
    ttsConfig: ttsSchema.optional(),
    createdAt: z.date(),
    currentRoundId: z.string().optional(),
    endedAt: z.date().optional(),
  })
  .passthrough();
export const wordCopyRecord = z
  .object({
    wordId: z.string(),
    version: z.number(),
    spelling: z.string(),
    otherSpellings: z.array(z.string()),
    meaningId: z.string(),
    meaning: z.string(),
    partOfSpeech: z.string(),
    text: z.string().optional(),
    speechVersion: z.number().optional(),
    listenAllowed: z.boolean().optional(),
    locale: z.string().optional(),
    engineId: z.string().optional(),
    voiceName: z.string().optional(),
    rate: z.number().optional(),
  })
  .passthrough();
export const questionRecord = z
  .object({
    id: z.string(),
    wordId: z.string(),
    wordVersion: z.number(),
    wordCopy: wordCopyRecord,
    hintLevel: z.number(),
    firstResult: z.enum(["CORRECT", "INCORRECT", "UNANSWERED"]).optional(),
    firstOrder: z.number().optional(),
  })
  .passthrough();
export const roundRecord = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    order: z.number(),
    status: z.string(),
    wordIds: z.array(z.string()),
    createdAt: z.date(),
    savedAt: z.date().optional(),
    finishReason: z.string().optional(),
  })
  .passthrough();
export const commandRecord = z
  .object({
    kind: z.string(),
    requestHash: z.string(),
    status: z.string(),
    receipt: z.unknown().optional(),
    progress: z.unknown().optional(),
    error: z.object({ code: z.string() }).passthrough().optional(),
    createdAt: z.date().optional(),
  })
  .passthrough();
export type Game = z.infer<typeof gameRecord>;
export type SourceWord = z.infer<typeof sourceWordRecord>;
export type Speech = z.infer<typeof speechRecord>;
export type Question = z.infer<typeof questionRecord>;
export type Round = z.infer<typeof roundRecord>;
export type Command = z.infer<typeof commandRecord>;
