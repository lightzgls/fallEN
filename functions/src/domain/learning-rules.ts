export const reviewDays = [1, 3, 7, 14, 30] as const;

export function reviewLevel(level: number, remembered: boolean): number {
  if (!Number.isInteger(level) || level < 1 || level > 5)
    throw new RangeError("Review level must be 1–5");
  return Math.max(1, Math.min(5, level + (remembered ? 1 : -1)));
}

export function addCalendarDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function currentStreak(
  summary: { lastStudyDayKey?: string; streakAtLastStudyDay?: number },
  today: string,
): number {
  return summary.lastStudyDayKey === today ||
    summary.lastStudyDayKey === addCalendarDays(today, -1)
    ? (summary.streakAtLastStudyDay ?? 0)
    : 0;
}
