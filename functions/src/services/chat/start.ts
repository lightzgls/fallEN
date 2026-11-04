import { z } from "zod";
import { type ReferenceWord } from "../../domain/chat.js";
import { chatPath } from "../../infrastructure/chat/references.js";
import {
  type Actor,
  type Data,
  assertActive,
  command,
  commandId,
  dayKey,
  db,
  fail,
  hash,
  id,
  identifier,
  parse,
  requireDoc,
} from "../../shared/core.js";
import { candidates } from "./context.js";

export async function startChat(actor: Actor, raw: unknown): Promise<Data> {
  const req = parse(
    z
      .object({
        wordSetId: identifier,
        scenarioId: identifier,
        allowSupplement: z.boolean(),
        commandId,
      })
      .strict(),
    raw,
  );
  const existing = (
    await db.doc(`users/${actor.uid}/commands/${req.commandId}`).get()
  ).data();
  if (existing) {
    await assertActive(actor);
    if (
      existing.kind !== "startChat" ||
      existing.requestHash !== hash({ kind: "startChat", input: req })
    )
      fail("COMMAND_REUSED");
    return existing.receipt;
  }
  await assertActive(actor);
  const sessionId = id();
  return command(actor, "startChat", req, async (tx, now) => {
    const options = await candidates(actor, req.wordSetId, tx);
    if (options.needsSupplement && !req.allowSupplement)
      fail("SUPPLEMENT_CONFIRMATION_REQUIRED");
    const refs: ReferenceWord[] = options.needsSupplement
      ? options.refs.slice(0, Math.max(5, options.rememberedCount))
      : options.refs.slice(0, options.rememberedCount);
    if (!refs.length) fail("INSUFFICIENT_CHAT_SOURCE");
    const usageRef = db.doc(
      `users/${actor.uid}/aiDailyUsage/${dayKey(now.toDate())}`,
    );
    const [usageDoc, limitDoc, topicDoc, deckDoc] = await tx.getAll(
      usageRef,
      db.doc("config/ai"),
      db.doc(`aiScenarios/${req.scenarioId}`),
      db.doc(`systemDecks/${req.wordSetId}`),
    );
    const topic = requireDoc(topicDoc, "TOPIC_NOT_FOUND"),
      deck = requireDoc(deckDoc, "DECK_NOT_FOUND"),
      limit = requireDoc(limitDoc, "AI_NOT_CONFIGURED");
    if (!topic.active || !deck.active) fail("DECK_UNAVAILABLE");
    if (deck.publishedRevisionId !== options.revisionId) fail("CONFLICT");
    const memories = await tx.getAll(
      ...refs.map((word) =>
        db.doc(`users/${actor.uid}/wordProgress/${word.wordId}`),
      ),
    );
    if (
      !req.allowSupplement &&
      memories.filter((memory) => memory.data()?.lastChoice === "REMEMBERED")
        .length < 5
    )
      fail("SUPPLEMENT_CONFIRMATION_REQUIRED");
    const used = usageDoc.data()?.successfulSessionCount ?? 0;
    if (used >= limit.maxSessionsPerDay) fail("AI_DAILY_LIMIT");
    const chat = {
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
      createdAt: now,
    };
    tx.create(db.doc(chatPath(actor, sessionId)), chat);
    tx.set(usageRef, {
      dayKey: dayKey(now.toDate()),
      successfulSessionCount: used + 1,
    });
    return chat;
  });
}
