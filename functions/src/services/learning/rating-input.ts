import { z } from "zod";
import { objectId, version } from "../../domain/backend.js";
export const ratingSchema = z
  .object({
    sessionId: objectId,
    wordId: objectId,
    choice: z.enum(["REMEMBERED", "NOT_REMEMBERED"]),
    eventId: objectId,
    expectedMemoryVersion: version,
    expectedPlaceVersion: version.optional(),
    expectedPlanVersion: version.optional(),
    cycleId: objectId.optional(),
    membershipVersion: version.optional(),
  })
  .strict();
export type RatingCommand = z.infer<typeof ratingSchema>;
