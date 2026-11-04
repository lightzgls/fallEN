import { z } from "zod";
import { objectId } from "../../domain/values.js";

export const metadataSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    topic: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000).optional(),
    coverImageAssetId: objectId.optional(),
  })
  .strict();
export const entrySchema = z
  .object({
    wordId: objectId,
    wordVersion: z.number().int().positive(),
    position: z.number().int().nonnegative(),
    focusMeaningId: objectId.optional(),
    example: z.string().trim().min(1).max(1000).optional(),
    exampleTranslation: z.string().trim().min(1).max(1000).optional(),
    imageAssetId: objectId.optional(),
    imageAlt: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .refine(
    (e) => !!e.example === !!e.exampleTranslation,
    "Example and translation must be a pair",
  )
  .refine(
    (e) => !e.imageAssetId || !!e.imageAlt,
    "An image requires alternative text",
  );
export const rowSchema = z
  .object({
    word: z.string().trim().min(1).max(200),
    partOfSpeech: z.string().trim().max(100).optional(),
    focusMeaningId: objectId.optional(),
    example: z.string().trim().min(1).max(1000).optional(),
    exampleTranslation: z.string().trim().min(1).max(1000).optional(),
    position: z.number().int().nonnegative().optional(),
    imageAssetId: objectId.optional(),
    imageAlt: z.string().trim().max(300).optional(),
  })
  .strict();
