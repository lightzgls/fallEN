import { z } from "zod";
import { hash } from "../shared/core.js";
export { reviewDays, reviewLevel, currentStreak } from "./learning-rules.js";
export { normalizeAnswer } from "./game-rules.js";

export const objectId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const version = z.number().int().nonnegative();
export const empty = z.object({}).strict();
export const sourceSchema = z
  .object({
    sourceType: z.enum(["SYSTEM_DECK", "PERSONAL_VOCABULARY"]),
    wordSetId: objectId.optional(),
    revisionId: objectId.optional(),
  })
  .strict()
  .refine(
    (s) =>
      s.sourceType === "SYSTEM_DECK"
        ? !!s.wordSetId
        : !s.wordSetId && !s.revisionId,
    "A system source needs a deck; a personal source has no deck/revision",
  );
export type Source = z.infer<typeof sourceSchema>;
export const sourceKey = (source: Source) =>
  source.sourceType === "SYSTEM_DECK" ? `deck_${source.wordSetId}` : "personal";
export const stableId = (uid: string, kind: string, commandId: string) =>
  hash({ uid, kind, commandId }).slice(0, 32);
