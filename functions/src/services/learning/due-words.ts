import type { Actor } from "../../contracts/callable.js";
import type {
  DueWordsReader,
  DueWordsStore,
} from "../../contracts/learning/store.js";
import { dayKey } from "../../shared/clock.js";
export async function dueWords(reader: DueWordsReader, today: string) {
  const releaseId = await reader.releaseId(),
    plans = await reader.duePlans(today);
  const words = [];
  for (const plan of plans) {
    const membership = await reader.membership(plan.wordId);
    if (!membership?.active) continue;
    const entry = await reader.entry(plan.wordId, releaseId);
    if (!entry?.active) continue;
    const word = await reader.word(plan.wordId, releaseId);
    words.push({
      wordId: plan.wordId,
      word,
      plan,
      membershipVersion: membership.membershipVersion,
    });
  }
  return words;
}
export function getDueWords(store: DueWordsStore, actor: Actor) {
  return store.read(actor, async (reader) => {
    const now = store.now(),
      today = dayKey(now),
      items = await dueWords(reader, today);
    return { items, count: items.length, asOfDay: today, fetchedAt: now };
  });
}
