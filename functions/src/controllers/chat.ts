import { controller } from "./controller.js";
import {
  empty,
  startChatSchema,
  chatWordsSchema,
  chatHistorySchema,
  turnSchema,
  acknowledgeTurnSchema,
  endChatSchema,
  sessionSchema,
} from "../contracts/chat/requests.js";
import { requireUser } from "../middleware/auth.js";
import type { createChatService } from "../services/chat.js";

export function createChatControllers(
  service: ReturnType<typeof createChatService>,
) {
  return {
    startChat: controller(startChatSchema, service.startChat, requireUser),
    sendMessage: controller(turnSchema, service.sendMessage, requireUser),
    acknowledgeTurn: controller(
      acknowledgeTurnSchema,
      service.acknowledgeTurn,
      requireUser,
    ),
    endChat: controller(endChatSchema, service.endChat, requireUser),
    getChatWords: controller(
      chatWordsSchema,
      service.getChatWords,
      requireUser,
    ),
    getTopics: controller(empty, service.getTopics, requireUser),
    getChatHistory: controller(
      chatHistorySchema,
      service.getChatHistory,
      requireUser,
    ),
    getChatSummary: controller(
      sessionSchema.strict(),
      service.getChatSummary,
      requireUser,
    ),
  };
}
