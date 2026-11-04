import type { Transaction } from "firebase-admin/firestore";
import type { Actor } from "../../contracts/callable.js";
import type {
  LearningContext,
  LearningReader,
} from "../../contracts/learning/store.js";
import { sourceKey } from "../../domain/values.js";
import { db } from "../firebase/runtime.js";
export function createLearningWrites(
  actor: Actor,
  tx: Transaction,
): Omit<LearningContext, keyof LearningReader> {
  const ref = (collection: string, key: string) =>
    db.doc(`users/${actor.uid}/${collection}/${key}`);
  return {
    saveMembership: (value) => {
      tx.set(ref("personalWords", value.wordId), value);
    },
    savePlan: (value) => {
      tx.set(ref("srsSchedules", value.wordId), value);
    },
    removePlan: (wordId) => {
      tx.delete(ref("srsSchedules", wordId));
    },
    saveStudy: (value) => {
      tx.set(ref("studySessions", value.id), value);
    },
    updateStudy: (sessionId, changes) => {
      tx.update(ref("studySessions", sessionId), changes);
    },
    saveItems: (sessionId, items) => {
      for (const item of items)
        tx.set(
          ref("studySessions", sessionId).collection("items").doc(item.wordId),
          item,
        );
    },
    savePlace: (value) => {
      tx.set(ref("flashcardPositions", sourceKey(value.source)), value);
    },
    saveMemory: (value) => {
      tx.set(ref("wordProgress", value.wordId), value);
    },
    createRating: (value) => {
      tx.create(ref("assessmentEvents", value.id), value);
    },
    markRated: (sessionId, wordId, eventId) => {
      tx.update(
        ref("studySessions", sessionId).collection("items").doc(wordId),
        { ratedEventId: eventId },
      );
    },
    saveDay: (value) => {
      tx.set(ref("learningDays", value.dayKey), value);
    },
    saveSummary: (value) => {
      tx.set(ref("dashboard", "summary"), value);
    },
    saveRecentSet: (value) => {
      tx.set(ref("deckActivity", value.wordSetId), value);
    },
  };
}
