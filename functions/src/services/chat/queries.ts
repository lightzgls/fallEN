import type { Actor } from "../../contracts/callable.js";
import type { ChatStore } from "../../contracts/chat/store.js";
import type {
  ChatHistoryInput,
  ChatWordsInput,
} from "../../contracts/chat/requests.js";
import { cursorDecode, cursorEncode } from "../../shared/values.js";
import { fail } from "../../shared/errors.js";
import { candidates } from "./context.js";

export async function getChatWords(
  store: ChatStore,
  actor: Actor,
  input: ChatWordsInput,
) {
  await store.assertActive(actor);
  return candidates(store.sourceReader(actor), input.wordSetId);
}
export async function getTopics(store: ChatStore, actor: Actor) {
  await store.assertActive(actor);
  return { items: await store.topics() };
}
export async function getChatSummary(
  store: ChatStore,
  actor: Actor,
  input: { sessionId: string },
) {
  await store.assertActive(actor);
  return (await store.summary(actor, input.sessionId)) ?? fail("NOT_FOUND");
}
export async function getChatHistory(
  store: ChatStore,
  actor: Actor,
  input: ChatHistoryInput,
) {
  await store.assertActive(actor);
  const cursor = input.cursor ? cursorDecode(input.cursor) : undefined;
  if (
    cursor &&
    (cursor.uid !== actor.uid ||
      typeof cursor.time !== "number" ||
      !Number.isFinite(cursor.time) ||
      typeof cursor.id !== "string")
  )
    fail("VALIDATION_FAILED");
  const page = await store.history(
      actor,
      cursor ? { time: new Date(cursor.time), id: cursor.id } : undefined,
    ),
    last = page.items[19];
  return {
    items: page.items,
    cursor:
      page.hasMore && last
        ? cursorEncode({
            uid: actor.uid,
            time: last.endedAt.getTime(),
            id: last.id,
          })
        : undefined,
  };
}
