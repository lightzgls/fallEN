import { defineSecret } from "firebase-functions/params";
import type { ChatApi } from "../domain/chat.js";
import { createChatService } from "../services/chat.js";
import { createChatControllers } from "../controllers/chat.js";
import { chatStore } from "../infrastructure/chat/store.js";
import { replyMemory } from "../infrastructure/ai/reply-cache.js";
import { GeminiChatApi } from "../infrastructure/ai/gemini.js";
import { callable } from "../handlers/callable.js";

export function createChatHandlers(api: ChatApi) {
  return createChatControllers(createChatService(chatStore, replyMemory, api));
}
const geminiKey = defineSecret("GEMINI_API_KEY");
const handlers = createChatHandlers(
  new GeminiChatApi({
    apiKey: () => geminiKey.value(),
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  }),
);
export const getChatWords = callable("getChatWords", handlers.getChatWords);
export const getTopics = callable("getTopics", handlers.getTopics);
export const startChat = callable("startChat", handlers.startChat);
export const sendMessage = callable("sendMessage", handlers.sendMessage, {
  secrets: [geminiKey],
});
export const acknowledgeTurn = callable(
  "acknowledgeTurn",
  handlers.acknowledgeTurn,
);
export const endChat = callable("endChat", handlers.endChat, {
  secrets: [geminiKey],
});
export const getChatHistory = callable(
  "getChatHistory",
  handlers.getChatHistory,
);
export const getChatSummary = callable(
  "getChatSummary",
  handlers.getChatSummary,
);
