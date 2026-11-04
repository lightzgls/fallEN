import type { LearningDay, Summary } from "../contracts/learning/records.js";
import { dayKey, addDays } from "../shared/clock.js";
export const emptySummary = (): Summary => ({
  learnedCount: 0,
  matchBest: 0,
  listenBest: 0,
  streakAtLastStudyDay: 0,
});
export function advanceActivity(
  now: Date,
  previousDay: LearningDay | undefined,
  previousSummary: Summary | undefined,
  mode: "FLASHCARD" | "SRS" | "MATCH_MEANINGS" | "LISTEN_AND_TYPE",
  count: number,
  newlyRemembered = 0,
  gameBest?: number,
) {
  const today = dayKey(now),
    summary = previousSummary ?? emptySummary();
  const day: LearningDay = previousDay ?? {
    dayKey: today,
    firstResultAt: now,
    totalCount: 0,
    flashcardCount: 0,
    srsCount: 0,
    matchCount: 0,
    listenCount: 0,
  };
  const nextSummary: Summary = {
    ...summary,
    learnedCount: summary.learnedCount + newlyRemembered,
  };
  let nextDay: LearningDay | undefined;
  if (count > 0) {
    const field = (
      {
        FLASHCARD: "flashcardCount",
        SRS: "srsCount",
        MATCH_MEANINGS: "matchCount",
        LISTEN_AND_TYPE: "listenCount",
      } as const
    )[mode];
    nextDay = {
      ...day,
      totalCount: day.totalCount + count,
      [field]: day[field] + count,
    };
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
    nextSummary[field] = Math.max(summary[field], gameBest);
  }
  return { day: nextDay, summary: nextSummary };
}
