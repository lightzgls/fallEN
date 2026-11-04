import { z } from "zod";
import { objectId, sourceSchema, version } from "../../domain/values.js";

export const ttsSchema = z
  .object({
    locale: z.enum(["en-GB", "en-US"]),
    engineId: z.string().min(1).max(200),
    voiceName: z.string().min(1).max(200),
    rate: z.number().min(0.25).max(2),
  })
  .strict();

export const startSchema = z
  .object({
    mode: z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
    source: sourceSchema,
    commandId: objectId,
    ttsConfig: ttsSchema.optional(),
  })
  .strict();

export const rawAnswer = z
  .object({
    questionId: objectId,
    selectedMeaningId: objectId.optional(),
    typedAnswer: z.string().max(300).optional(),
  })
  .strict();

export const firstAnswer = z
  .object({
    answer: rawAnswer,
    firstOrder: z.number().int().positive(),
    hintLevel: z.number().int().min(0).max(3),
  })
  .strict();

export const gameCommandSchema = z.object({
  sessionId: objectId,
  expectedGameVersion: version,
  commandId: objectId,
});

export const createRoundSchema = gameCommandSchema
  .extend({ ttsConfig: ttsSchema.optional() })
  .strict();
export const saveRoundSchema = gameCommandSchema
  .extend({
    roundId: objectId,
    firstAnswers: z.array(firstAnswer).max(5),
    completionAnswers: z.array(rawAnswer).max(5),
    finishReason: z.enum(["COMPLETED", "STOP_AND_SAVE", "SKIPPED"]),
  })
  .strict();
export const endGameSchema = gameCommandSchema
  .extend({ cancelledRoundId: objectId.optional() })
  .strict();
export const eligibleSourceSchema = z
  .object({
    mode: z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
    source: sourceSchema,
  })
  .strict();
export type TtsConfig = z.infer<typeof ttsSchema>;
export type StartGameInput = z.infer<typeof startSchema>;
export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type SaveRoundInput = z.infer<typeof saveRoundSchema>;
export type EndGameInput = z.infer<typeof endGameSchema>;
export type EligibleSourceInput = z.infer<typeof eligibleSourceSchema>;
export type RawAnswer = z.infer<typeof rawAnswer>;
