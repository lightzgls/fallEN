import { z } from "zod";
import type { Transaction } from "firebase-admin/firestore";
import type { Actor } from "../../contracts/callable.js";
import type {
  ChatEndTransaction,
  ChatSourceReader,
  ChatStartTransaction,
  ChatTurnTransaction,
} from "../../contracts/chat/store.js";
import { db } from "../firebase/runtime.js";
import { readDeckSource } from "../dictionary/source-reader.js";
import {
  stored,
  storedChat,
  storedCommand,
  storedScenario,
  storedSummary,
  storedTurn,
} from "./codecs.js";
import { chatPath } from "./refs.js";
import { fail } from "../../shared/errors.js";

const memoryRecord = z.object({ lastChoice: z.string().optional() });
export function sourceReader(actor: Actor, tx?: Transaction): ChatSourceReader {
  return {
    source: (wordSetId) =>
      readDeckSource({ sourceType: "SYSTEM_DECK", wordSetId }, tx),
    async memory(wordId) {
      const ref = db.doc(`users/${actor.uid}/wordProgress/${wordId}`);
      return stored(memoryRecord, await (tx ? tx.get(ref) : ref.get()));
    },
  };
}
export function startContext(
  actor: Actor,
  tx: Transaction,
  now: Date,
): ChatStartTransaction {
  return {
    ...sourceReader(actor, tx),
    now,
    async usage(dayKey) {
      return stored(
        z.object({ successfulSessionCount: z.number().optional() }),
        await tx.get(db.doc(`users/${actor.uid}/aiDailyUsage/${dayKey}`)),
      );
    },
    async limit() {
      return (
        stored(
          z.object({ maxSessionsPerDay: z.number() }),
          await tx.get(db.doc("config/ai")),
        ) ?? fail("AI_NOT_CONFIGURED")
      );
    },
    async topic(scenarioId) {
      return storedScenario(await tx.get(db.doc(`aiScenarios/${scenarioId}`)));
    },
    async deck(wordSetId) {
      return (
        stored(
          z.object({
            active: z.boolean().optional(),
            publishedRevisionId: z.string().optional(),
          }),
          await tx.get(db.doc(`systemDecks/${wordSetId}`)),
        ) ?? fail("DECK_NOT_FOUND")
      );
    },
    createChat(chat) {
      tx.create(db.doc(chatPath(actor, chat.id)), chat);
    },
    saveUsage(dayKey, count) {
      tx.set(db.doc(`users/${actor.uid}/aiDailyUsage/${dayKey}`), {
        dayKey,
        successfulSessionCount: count,
      });
    },
  };
}
export function turnContext(
  actor: Actor,
  tx: Transaction,
  now: Date,
): ChatTurnTransaction {
  const chatRef = (id: string) => db.doc(chatPath(actor, id));
  return {
    now,
    async chat(id) {
      return storedChat(await tx.get(chatRef(id)));
    },
    async turn(id, turnId) {
      return storedTurn(
        await tx.get(chatRef(id).collection("processedTurns").doc(turnId)),
      );
    },
    saveTurn(id, turn) {
      tx.set(chatRef(id).collection("processedTurns").doc(turn.turnId), turn);
    },
    patchTurn(id, turnId, patch) {
      tx.update(chatRef(id).collection("processedTurns").doc(turnId), {
        ...patch,
      });
    },
    patchChat(id, patch) {
      tx.update(chatRef(id), { ...patch });
    },
  };
}
export function endContext(
  actor: Actor,
  tx: Transaction,
  now: Date,
): ChatEndTransaction {
  const chatRef = (id: string) => db.doc(chatPath(actor, id)),
    summaryRef = (id: string) => db.doc(`users/${actor.uid}/aiSummaries/${id}`),
    commandRef = (id: string) => db.doc(`users/${actor.uid}/commands/${id}`);
  return {
    now,
    async chat(id) {
      return storedChat(await tx.get(chatRef(id)));
    },
    async summary(id) {
      return storedSummary(await tx.get(summaryRef(id)));
    },
    async command(id) {
      return storedCommand(await tx.get(commandRef(id)));
    },
    patchChat(id, patch) {
      tx.update(chatRef(id), { ...patch });
    },
    saveCommand(id, command) {
      tx.set(commandRef(id), command);
    },
    completeCommand(id, summary) {
      tx.update(commandRef(id), { status: "SUCCEEDED", receipt: summary });
    },
    createSummary(summary) {
      tx.create(summaryRef(summary.sessionId), summary);
    },
  };
}
