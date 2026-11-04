import { type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import {
  type ChatPrompt,
  type ReferenceWord,
  contextSchema,
  validateContextOrder,
} from "../../domain/chat.js";
import { chatPath } from "../../infrastructure/chat/references.js";
import { type Actor, type Data, db, fail, hash } from "../../shared/core.js";
import { readDeckSource, readWordVersion } from "../dictionary.js";

export async function promptFor(
  chat: Data,
  context: z.infer<typeof contextSchema>,
  message?: string,
): Promise<ChatPrompt> {
  const words: ReferenceWord[] = [];
  for (const ref of chat.referenceWords) {
    const word = await readWordVersion(ref.wordId, ref.wordVersion);
    words.push({
      ...ref,
      spelling: word.spelling,
      otherSpellings: word.otherSpellings ?? [],
    });
  }
  return { scenario: chat.scenarioSnapshot, words, context, message };
}

export async function deliveredContext(
  actor: Actor,
  sessionId: string,
  context: z.infer<typeof contextSchema>,
): Promise<void> {
  const delivered = await db
    .collection(`${chatPath(actor, sessionId)}/processedTurns`)
    .where("status", "==", "DELIVERED")
    .orderBy("turnOrder")
    .get();
  if (
    !validateContextOrder(
      context,
      delivered.docs.map((doc) => doc.id),
    )
  )
    fail("CONTEXT_INVALID");
  for (let index = 0; index < delivered.docs.length; index++)
    if (
      delivered.docs[index].data().learnerHash !==
        hash(context.pairs[index].learner) ||
      delivered.docs[index].data().replyHash !==
        hash(context.pairs[index].assistant)
    )
      fail("CONTEXT_INVALID");
}

export async function candidates(
  actor: Actor,
  wordSetId: string,
  tx?: Transaction,
): Promise<Data> {
  const source = await readDeckSource(
    { sourceType: "SYSTEM_DECK", wordSetId },
    tx,
  );
  const remembered: ReferenceWord[] = [],
    other: ReferenceWord[] = [];
  for (const item of source.words) {
    const memoryRef = db.doc(`users/${actor.uid}/wordProgress/${item.wordId}`);
    const memory = (await (tx ? tx.get(memoryRef) : memoryRef.get())).data();
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
    revisionId: source.source.revisionId,
    refs: [...remembered, ...other].map((word, index) => ({
      ...word,
      wordOrder: index,
    })),
    rememberedCount: remembered.length,
    needsSupplement: remembered.length < 5,
  };
}
