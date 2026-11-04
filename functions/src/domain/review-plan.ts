import { addDays, dayKey } from "../shared/clock.js";

export function newPlan(wordId: string, cycleId: string, now: Date) {
  return {
    wordId,
    cycleId,
    level: 1,
    dueDate: addDays(dayKey(now), 1),
    version: 1,
  };
}
