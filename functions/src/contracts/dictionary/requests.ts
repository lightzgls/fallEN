import { z } from "zod";
import { sourceSchema } from "../../domain/dictionary/source.js";
import { empty, identifier } from "../../shared/validation.js";

export { empty };
export const findWordsSchema = z
  .object({
    query: z.string().trim().min(1).max(100),
    partOfSpeech: z.string().trim().min(1).max(100).optional(),
    cursor: z.string().max(4096).optional(),
    releaseId: identifier.optional(),
    pageSize: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const wordSchema = z
  .object({ wordId: identifier, releaseId: identifier.optional() })
  .strict();
export const wordVersionSchema = z
  .object({
    wordId: identifier,
    wordVersion: z.number().int().positive(),
    releaseId: identifier.optional(),
  })
  .strict();
export const connectionsSchema = z
  .object({
    wordId: identifier,
    wordVersion: z.number().int().positive(),
    releaseId: identifier,
    type: z.enum(["SYNONYM", "ANTONYM", "COLLOCATION", "WORD_FAMILY"]),
  })
  .strict();
export const studySourceSchema = z.object({ source: sourceSchema }).strict();
export type FindWordsInput = z.output<typeof findWordsSchema>;
export type WordInput = z.output<typeof wordSchema>;
export type WordVersionInput = z.output<typeof wordVersionSchema>;
export type ConnectionsInput = z.output<typeof connectionsSchema>;
export type StudySourceInput = z.output<typeof studySourceSchema>;
