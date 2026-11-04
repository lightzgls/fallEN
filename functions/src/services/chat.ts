import { type Actor } from "../shared/types.js";
import { type ChatApi } from "../domain/chat.js";
import { startChat } from "./chat/start.js";
import { sendMessage } from "./chat/send.js";
import { acknowledgeTurn } from "./chat/ack.js";
import { endChat } from "./chat/end.js";
import {
  getChatWords,
  getTopics,
  getChatHistory,
  getChatSummary,
} from "./chat/queries.js";
export function createChatHandlers(
  api: ChatApi,
): Record<string, (actor: Actor, input: unknown) => Promise<unknown>> {
  return {
    startChat: startChat,
    sendMessage: (actor, input) => sendMessage(actor, input, api),
    acknowledgeTurn: acknowledgeTurn,
    endChat: (actor, input) => endChat(actor, input, api),
    getChatWords: getChatWords,
    getTopics: getTopics,
    getChatHistory: getChatHistory,
    getChatSummary: getChatSummary,
  };
}
