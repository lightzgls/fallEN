import type { Actor } from "../contracts/callable.js";
import type {
  ChatHistoryInput,
  ChatWordsInput,
  StartChatInput,
} from "../contracts/chat/requests.js";
import type { ChatStore, ReplyMemory } from "../contracts/chat/store.js";
import type {
  AcknowledgeTurnCommand,
  EndChatCommand,
  TurnCommand,
} from "../domain/chat-commands.js";
import type { ChatApi } from "../domain/chat.js";
import { startChat } from "./chat/start.js";
import { sendMessage } from "./chat/send.js";
import { acknowledgeTurn } from "./chat/turns.js";
import { endChat } from "./chat/end.js";
import {
  getChatWords,
  getTopics,
  getChatHistory,
  getChatSummary,
} from "./chat/queries.js";

export function createChatService(
  store: ChatStore,
  memory: ReplyMemory,
  api: ChatApi,
) {
  return {
    startChat: (actor: Actor, input: StartChatInput) =>
      startChat(store, actor, input),
    sendMessage: (actor: Actor, input: TurnCommand) =>
      sendMessage(store, memory, api, actor, input),
    acknowledgeTurn: (actor: Actor, input: AcknowledgeTurnCommand) =>
      acknowledgeTurn(store, memory, actor, input),
    endChat: (actor: Actor, input: EndChatCommand) =>
      endChat(store, memory, api, actor, input),
    getChatWords: (actor: Actor, input: ChatWordsInput) =>
      getChatWords(store, actor, input),
    getTopics: (actor: Actor) => getTopics(store, actor),
    getChatHistory: (actor: Actor, input: ChatHistoryInput) =>
      getChatHistory(store, actor, input),
    getChatSummary: (actor: Actor, input: { sessionId: string }) =>
      getChatSummary(store, actor, input),
  };
}
