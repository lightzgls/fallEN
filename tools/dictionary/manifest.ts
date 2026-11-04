import { z } from "zod";
import { identifier } from "../../functions/src/shared/validation.js";
const meaning = z
  .object({
    id: identifier,
    partOfSpeech: z.string().min(1).max(100),
    text: z.string().min(1).max(1000),
    example: z.string().min(1).max(1000).optional(),
    exampleTranslation: z.string().min(1).max(1000).optional(),
    imageAssetId: identifier.optional(),
    imageAlt: z.string().min(1).max(300).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.example) === Boolean(value.exampleTranslation) &&
      (!value.imageAssetId || Boolean(value.imageAlt)),
  );

const dictionaryRef = z
  .object({
    sourceId: identifier,
    sourceEntryId: z.string().min(1).max(300),
    sourceVersion: z.string().min(1).max(100),
  })
  .strict();

export const manifestSchema = z
  .object({
    releaseId: identifier,
    sources: z
      .array(
        z
          .object({
            sourceId: identifier,
            name: z.string().min(1),
            version: z.string().min(1),
            license: z.string().min(1),
            redistributionAllowed: z.literal(true),
          })
          .strict(),
      )
      .min(1),
    words: z
      .array(
        z
          .object({
            wordId: identifier,
            version: z.number().int().positive(),
            spelling: z.string().min(1).max(200),
            phonetic: z.string().max(200).optional(),
            otherSpellings: z.array(z.string().min(1).max(200)),
            meanings: z.array(meaning).min(1),
            dictionaryRefs: z.array(dictionaryRef).min(1),
            active: z.boolean(),
            listenAllowed: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1),
    connections: z.array(
      z
        .object({
          sourceWordId: identifier,
          sourceWordVersion: z.number().int().positive(),
          sourceMeaningId: identifier,
          targetWordId: identifier,
          targetWordVersion: z.number().int().positive(),
          targetMeaningId: identifier,
          type: z.enum(["SYNONYM", "ANTONYM", "COLLOCATION", "WORD_FAMILY"]),
          dictionaryRefs: z.array(dictionaryRef).min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type DictionaryManifest = z.infer<typeof manifestSchema>;
