import { z } from "zod";
import { commandId, identifier, version } from "../shared/validation.js";
import { contextSchema } from "./chat.js";

export const sessionSchema = z.object({ sessionId: identifier });

export const turnSchema = sessionSchema
  .extend({
    turnId: identifier,
    expectedVersion: version,
    message: z.string().trim().min(1).max(2000),
    context: contextSchema,
  })
  .strict();

export const acknowledgeTurnSchema = sessionSchema
  .extend({ turnId: identifier, expectedVersion: version })
  .strict();
export const endChatSchema = sessionSchema
  .extend({
    expectedVersion: version,
    commandId,
    context: contextSchema.optional(),
  })
  .strict();
export type TurnCommand = z.infer<typeof turnSchema>;
export type AcknowledgeTurnCommand = z.infer<typeof acknowledgeTurnSchema>;
export type EndChatCommand = z.infer<typeof endChatSchema>;
