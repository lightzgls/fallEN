import { z } from "zod";
import { empty, identifier, commandId } from "../../shared/validation.js";
export { empty };
export {
  turnSchema,
  acknowledgeTurnSchema,
  endChatSchema,
  sessionSchema,
} from "../../domain/chat-commands.js";
export const startChatSchema = z
  .object({
    wordSetId: identifier,
    scenarioId: identifier,
    allowSupplement: z.boolean(),
    commandId,
  })
  .strict();
export const chatWordsSchema = z.object({ wordSetId: identifier }).strict();
export const chatHistorySchema = z
  .object({ cursor: z.string().max(4096).optional() })
  .strict();
export type StartChatInput = z.output<typeof startChatSchema>;
export type ChatWordsInput = z.output<typeof chatWordsSchema>;
export type ChatHistoryInput = z.output<typeof chatHistorySchema>;
