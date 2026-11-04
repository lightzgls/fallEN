import { type Transaction, type Timestamp } from "firebase-admin/firestore";
import { db, dayKey, addDays, type Data } from "../shared/core.js";

/** Read before any transaction writes. The caller stages these read models with its unique source event. */
export async function readActivity(
  tx: Transaction,
  uid: string,
  now: Timestamp,
) {
  const today = dayKey(now.toDate());
  const dayRef = db.doc(`users/${uid}/learningDays/${today}`);
  const summaryRef = db.doc(`users/${uid}/dashboard/summary`);
  const [daySnapshot, summarySnapshot] = await tx.getAll(dayRef, summaryRef);
  const summary = summarySnapshot.data() ?? {
    learnedCount: 0,
    matchBest: 0,
    listenBest: 0,
    streakAtLastStudyDay: 0,
  };
  const day = daySnapshot.data() ?? {
    dayKey: today,
    firstResultAt: now,
    totalCount: 0,
    flashcardCount: 0,
    srsCount: 0,
    matchCount: 0,
    listenCount: 0,
  };
  return { dayRef, summaryRef, day, summary, today };
}

export function stageActivity(
  tx: Transaction,
  activity: Awaited<ReturnType<typeof readActivity>>,
  mode: "FLASHCARD" | "SRS" | "MATCH_MEANINGS" | "LISTEN_AND_TYPE",
  count: number,
  newlyRemembered = 0,
  gameBest?: number,
) {
  const { summary, day, today, dayRef, summaryRef } = activity;
  const nextSummary: Data = {
    ...summary,
    learnedCount: (summary.learnedCount ?? 0) + newlyRemembered,
  };
  if (count > 0) {
    const field = {
      FLASHCARD: "flashcardCount",
      SRS: "srsCount",
      MATCH_MEANINGS: "matchCount",
      LISTEN_AND_TYPE: "listenCount",
    }[mode];
    tx.set(dayRef, {
      ...day,
      totalCount: day.totalCount + count,
      [field]: day[field] + count,
    });
    const last = summary.lastStudyDayKey;
    nextSummary.streakAtLastStudyDay =
      last === today
        ? summary.streakAtLastStudyDay
        : last === addDays(today, -1)
          ? summary.streakAtLastStudyDay + 1
          : 1;
    nextSummary.lastStudyDayKey = today;
  }
  if (gameBest !== undefined) {
    const field = mode === "MATCH_MEANINGS" ? "matchBest" : "listenBest";
    nextSummary[field] = Math.max(summary[field] ?? 0, gameBest);
  }
  tx.set(summaryRef, nextSummary);
}
