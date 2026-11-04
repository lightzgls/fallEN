import { z } from "zod";
import { objectId, version } from "../../domain/values.js";

export const categorySchema = z.enum([
  "MEANING",
  "EXAMPLE_TRANSLATION",
  "IMAGE",
  "PRONUNCIATION",
  "OTHER",
]);

export const statusSchema = z.enum([
  "OPEN",
  "IN_REVIEW",
  "WAITING_RELEASE",
  "RESOLVED",
  "REJECTED",
]);

export const gameTargetSchema = z
  .object({ sessionId: objectId, roundId: objectId, questionId: objectId })
  .strict();

export const targetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("WORD"),
      wordId: objectId,
      wordVersion: z.number().int().positive(),
      releaseId: objectId.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_WORD"),
      wordSetId: objectId,
      revisionId: objectId,
      wordId: objectId,
      meaningId: objectId.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SPEECH"),
      wordId: objectId,
      speechVersion: version,
      gameRef: gameTargetSchema.optional(),
    })
    .strict(),
]);

export const resolutionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("DECK_REVISION"),
      wordSetId: objectId,
      revisionId: objectId,
    })
    .strict(),
  z
    .object({
      kind: z.literal("SPEECH"),
      wordId: objectId,
      speechVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ kind: z.literal("DICTIONARY_RELEASE"), releaseId: objectId })
    .strict(),
]);

export type Target = z.infer<typeof targetSchema>;

export type Resolution = z.infer<typeof resolutionSchema>;

export type Category = z.infer<typeof categorySchema>;
