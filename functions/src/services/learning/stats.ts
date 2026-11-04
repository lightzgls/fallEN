import type { Actor } from "../../contracts/callable.js";
import type {
  DateRangeInput,
  DayActivityInput,
  RecentSetsInput,
} from "../../contracts/learning/inputs.js";
import type {
  StatisticsReader,
  StatisticsStore,
} from "../../contracts/learning/store.js";
import { emptySummary } from "../../domain/learning-activity.js";
import { currentStreak } from "../../domain/learning-rules.js";
import { dayKey, addDays } from "../../shared/clock.js";
import { fail } from "../../shared/errors.js";
import { dueWords } from "./due-words.js";
async function statsRead(ctx: StatisticsReader, now: Date) {
  const summary = (await ctx.summary()) ?? emptySummary();
  return {
    ...summary,
    studyStreak: currentStreak(summary, dayKey(now)),
    asOfDay: dayKey(now),
    fetchedAt: now,
  };
}
export function getStats(store: StatisticsStore, actor: Actor) {
  return store.read(actor, (ctx) => statsRead(ctx, store.now()));
}
export function getDashboard(store: StatisticsStore, actor: Actor) {
  return store.read(actor, async (ctx) => {
    const now = store.now();
    const [stats, due, today, recentSets] = await Promise.all([
      statsRead(ctx, now),
      dueWords(ctx, dayKey(now)),
      ctx.day(dayKey(now)),
      ctx.recentDashboard(),
    ]);
    return { ...stats, dueCount: due.length, today: today ?? null, recentSets };
  });
}
export function getLearningDays(
  store: StatisticsStore,
  actor: Actor,
  req: DateRangeInput,
) {
  return store.read(actor, async (ctx) => ({
    items: await ctx.days(req.from, req.to),
  }));
}
export function getHeatmap(
  store: StatisticsStore,
  actor: Actor,
  req: DateRangeInput,
) {
  return store.read(actor, async (ctx) => {
    const days = new Map(
        (await ctx.days(req.from, req.to)).map((d) => [d.dayKey, d]),
      ),
      items = [];
    for (let d = req.from; d <= req.to; d = addDays(d, 1))
      items.push({
        dayKey: d,
        totalCount: days.get(d)?.totalCount ?? 0,
        intensity: Math.min(4, Math.ceil((days.get(d)?.totalCount ?? 0) / 5)),
      });
    return { items };
  });
}
export function getDayActivity(
  store: StatisticsStore,
  actor: Actor,
  req: DayActivityInput,
) {
  return store.read(actor, async (ctx) => (await ctx.day(req.dayKey)) ?? null);
}
export function getChart(
  store: StatisticsStore,
  actor: Actor,
  req: DateRangeInput,
) {
  return store.read(actor, async (ctx) => {
    const words = await ctx.rememberedMemories(),
      counts = new Map<string, number>();
    let cumulative = 0;
    for (const word of words) {
      if (!word.firstRememberedAt)
        fail("INVALID_DATA", "Expected a saved timestamp");
      const d = dayKey(word.firstRememberedAt);
      if (d < req.from) cumulative++;
      else counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const items = [];
    for (let d = req.from; d <= req.to; d = addDays(d, 1)) {
      cumulative += counts.get(d) ?? 0;
      items.push({ dayKey: d, learnedCount: cumulative });
    }
    return { items };
  });
}
export function getRecentSets(
  store: StatisticsStore,
  actor: Actor,
  req: RecentSetsInput,
) {
  return store.read(actor, (ctx) => ctx.recentPage(req.cursor));
}
