import { Timestamp } from "firebase-admin/firestore";
import { currentStreak } from "../../domain/backend.js";
import { dayKey, db, fail, type Actor, type Data } from "../../shared/core.js";
import { userRef } from "./references.js";

export const fromTimestamp = (value: unknown): Date => {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
    return new Date(value);
  return fail("INVALID_DATA", "Expected a saved timestamp");
};

export async function learningDays(
  actor: Actor,
  from: string,
  to: string,
): Promise<Data[]> {
  return (
    await db
      .collection(`users/${actor.uid}/learningDays`)
      .where("dayKey", ">=", from)
      .where("dayKey", "<=", to)
      .orderBy("dayKey")
      .get()
  ).docs.map((s) => s.data());
}

export async function statsRead(actor: Actor) {
  const summary = (
    await userRef(actor, "dashboard", "summary").get()
  ).data() ?? {
    learnedCount: 0,
    matchBest: 0,
    listenBest: 0,
    streakAtLastStudyDay: 0,
  };
  return {
    ...summary,
    studyStreak: currentStreak(summary, dayKey()),
    asOfDay: dayKey(),
    fetchedAt: Timestamp.now(),
  };
}
