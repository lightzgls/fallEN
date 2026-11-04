import type { Actor } from "../../contracts/callable.js";
import type { ChatSession } from "../../contracts/chat/records.js";
import type {
  ChatSourceReader,
  ChatStore,
} from "../../contracts/chat/store.js";
import {
  type ChatContext,
  type ChatPrompt,
  type ReferenceWord,
  validateContextOrder,
} from "../../domain/chat.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";

export async function promptFor(
  store: ChatStore,
  chat: ChatSession,
  context: ChatContext,
  message?: string,
): Promise<ChatPrompt> {
  const words: ReferenceWord[] = [];
  for (const ref of chat.referenceWords) {
    const word = await store.wordVersion(ref.wordId, ref.wordVersion);
    words.push({
      ...ref,
      spelling: word.spelling,
      otherSpellings: word.otherSpellings ?? [],
    });
  }
  return { scenario: chat.scenarioSnapshot, words, context, message };
}
export async function deliveredContext(
  store: ChatStore,
  actor: Actor,
  sessionId: string,
  context: ChatContext,
): Promise<void> {
  const delivered = await store.delivered(actor, sessionId);
  if (
    !validateContextOrder(
      context,
      delivered.map((turn) => turn.turnId),
    )
  )
    fail("CONTEXT_INVALID");
  for (let index = 0; index < delivered.length; index++)
    if (
      delivered[index].learnerHash !== hash(context.pairs[index].learner) ||
      delivered[index].replyHash !== hash(context.pairs[index].assistant)
    )
      fail("CONTEXT_INVALID");
}
export async function candidates(reader: ChatSourceReader, wordSetId: string) {
  const source = await reader.source(wordSetId),
    remembered: ReferenceWord[] = [],
    other: ReferenceWord[] = [];
  for (const item of source.words) {
    const memory = await reader.memory(item.wordId);
    const word = {
      wordId: item.wordId,
      wordVersion: item.wordVersion,
      wordOrder: 0,
      spelling: item.word.spelling,
      otherSpellings: item.word.otherSpellings ?? [],
    };
    (memory?.lastChoice === "REMEMBERED" ? remembered : other).push(word);
  }
  return {
    revisionId: String(source.source.revisionId),
    refs: [...remembered, ...other].map((word, index) => ({
      ...word,
      wordOrder: index,
    })),
    rememberedCount: remembered.length,
    needsSupplement: remembered.length < 5,
  };
}
