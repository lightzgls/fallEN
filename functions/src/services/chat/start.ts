import type { Actor } from "../../contracts/callable.js";
import type { StartChatInput } from "../../contracts/chat/requests.js";
import type { ChatSession } from "../../contracts/chat/records.js";
import type { ChatStore } from "../../contracts/chat/store.js";
import { dayKey } from "../../shared/clock.js";
import { fail } from "../../shared/errors.js";
import { hash, id } from "../../shared/values.js";
import { candidates } from "./context.js";

export async function startChat(
  store: Pick<
    ChatStore,
    "startReceipt" | "decodeStartReceipt" | "assertActive" | "startCommand"
  >,
  actor: Actor,
  req: StartChatInput,
) {
  const existing = await store.startReceipt(actor, req.commandId);
  if (existing) {
    await store.assertActive(actor);
    if (
      existing.kind !== "startChat" ||
      existing.requestHash !== hash({ kind: "startChat", input: req })
    )
      fail("COMMAND_REUSED");
    return store.decodeStartReceipt(existing.receipt);
  }
  await store.assertActive(actor);
  const sessionId = id();
  return store.startCommand(actor, req, async (tx) => {
    const options = await candidates(tx, req.wordSetId);
    if (options.needsSupplement && !req.allowSupplement)
      fail("SUPPLEMENT_CONFIRMATION_REQUIRED");
    const refs = options.needsSupplement
      ? options.refs.slice(0, Math.max(5, options.rememberedCount))
      : options.refs.slice(0, options.rememberedCount);
    if (!refs.length) fail("INSUFFICIENT_CHAT_SOURCE");
    const day = dayKey(tx.now);
    const [usage, limit, topic, deck] = await Promise.all([
      tx.usage(day),
      tx.limit(),
      tx.topic(req.scenarioId),
      tx.deck(req.wordSetId),
    ]);
    if (!topic.active || !deck.active) fail("DECK_UNAVAILABLE");
    if (deck.publishedRevisionId !== options.revisionId) fail("CONFLICT");
    const memories = await Promise.all(
      refs.map((word) => tx.memory(word.wordId)),
    );
    if (
      !req.allowSupplement &&
      memories.filter((memory) => memory?.lastChoice === "REMEMBERED").length <
        5
    )
      fail("SUPPLEMENT_CONFIRMATION_REQUIRED");
    const used = usage?.successfulSessionCount ?? 0;
    if (used >= limit.maxSessionsPerDay) fail("AI_DAILY_LIMIT");
    const chat: ChatSession = {
      id: sessionId,
      wordSetId: req.wordSetId,
      wordSetRevisionId: options.revisionId,
      scenarioId: req.scenarioId,
      scenarioSnapshot: topic,
      referenceWordIds: refs.map((word) => word.wordId),
      referenceWords: refs.map(({ wordId, wordVersion, wordOrder }) => ({
        wordId,
        wordVersion,
        wordOrder,
      })),
      status: "ACTIVE",
      completedTurns: 0,
      version: 1,
      createdAt: tx.now,
    };
    tx.createChat(chat);
    tx.saveUsage(day, used + 1);
    return chat;
  });
}
