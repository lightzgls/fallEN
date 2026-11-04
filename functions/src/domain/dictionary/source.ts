import { z } from "zod";
import { identifier } from "../../shared/validation.js";
import { type Data } from "../../shared/types.js";

export const sourceSchema = z
  .object({
    sourceType: z.enum(["SYSTEM_DECK", "PERSONAL_VOCABULARY"]),
    wordSetId: identifier.optional(),
    revisionId: identifier.optional(),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.sourceType === "SYSTEM_DECK" && !source.wordSetId)
      ctx.addIssue({ code: "custom", message: "wordSetId required" });
    if (
      source.sourceType === "PERSONAL_VOCABULARY" &&
      (source.wordSetId || source.revisionId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Personal vocabulary has no deck",
      });
  });

export interface SourceWord {
  wordId: string;
  wordVersion: number;
  word: Data;
  entry?: Data;
}

export interface SourceRead {
  source: Data;
  words: SourceWord[];
}
