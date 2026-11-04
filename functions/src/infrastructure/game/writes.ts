import type { Transaction } from "firebase-admin/firestore";
import type { Actor } from "../../contracts/callable.js";
import type { GameContext, GameReader } from "../../contracts/game/store.js";
import { db } from "../firebase/runtime.js";
import { createLearningWrites } from "../learning/writes.js";
export function createGameWrites(
  actor: Actor,
  tx: Transaction,
): Omit<GameContext, keyof GameReader> {
  const gameRef = (id: string) =>
      db.doc(`users/${actor.uid}/gameSessions/${id}`),
    commandRef = (id: string) => db.doc(`users/${actor.uid}/commands/${id}`),
    personal = createLearningWrites(actor, tx);
  return {
    createGame: (value) => {
      tx.create(gameRef(value.id), value);
    },
    saveGame: (value) => {
      tx.set(gameRef(value.id), value);
    },
    createCommand: (id, value) => {
      tx.create(commandRef(id), value);
    },
    saveCommand: (id, value) => {
      tx.set(commandRef(id), value);
    },
    saveSourceWords: (id, words) => {
      for (const word of words)
        tx.set(gameRef(id).collection("sourceWords").doc(word.wordId), word);
    },
    createRound: (value) => {
      tx.create(
        gameRef(value.sessionId).collection("rounds").doc(value.id),
        value,
      );
    },
    saveRound: (value) => {
      tx.set(
        gameRef(value.sessionId).collection("rounds").doc(value.id),
        value,
      );
    },
    createQuestions: (sessionId, roundId, questions) => {
      for (const q of questions)
        tx.create(
          gameRef(sessionId)
            .collection("rounds")
            .doc(roundId)
            .collection("questions")
            .doc(q.id),
          q,
        );
    },
    saveQuestions: (sessionId, roundId, questions) => {
      for (const q of questions)
        tx.set(
          gameRef(sessionId)
            .collection("rounds")
            .doc(roundId)
            .collection("questions")
            .doc(q.id),
          q,
        );
    },
    saveDay: personal.saveDay,
    saveSummary: personal.saveSummary,
    saveRecentSet: personal.saveRecentSet,
  };
}
