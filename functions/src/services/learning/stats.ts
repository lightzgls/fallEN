import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { empty } from "../../domain/values.js";
import {
  decodeCursor,
  encodeCursor,
} from "../../infrastructure/learning/pagination.js";
import { dataWithId, userRef } from "../../infrastructure/learning/refs.js";
import {
  fromTimestamp,
  learningDays,
  statsRead,
} from "../../infrastructure/learning/stats-reader.js";
import {
  addDays,
  assertActive,
  dayKey,
  db,
  parse,
  type Actor,
} from "../../shared/core.js";
import { dueWords } from "./due-words.js";

export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid date",
  );

export const dateRangeSchema = z
  .object({ from: isoDay, to: isoDay })
  .strict()
  .refine(
    (v) =>
      v.from <= v.to &&
      (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 365,
    "Date range must be at most 366 days",
  );

export async function getStats(actor: Actor, input: unknown) {
  parse(empty, input);
  await assertActive(actor);
  return statsRead(actor);
}

export async function getDashboard(actor: Actor, input: unknown) {
  parse(empty, input);
  await assertActive(actor);
  const [stats, due, today, recent] = await Promise.all([
    statsRead(actor),
    dueWords(actor),
    userRef(actor, "learningDays", dayKey()).get(),
    db
      .collection(`users/${actor.uid}/deckActivity`)
      .orderBy("lastActivityAt", "desc")
      .limit(10)
      .get(),
  ]);
  return {
    ...stats,
    dueCount: due.length,
    today: today.data() ?? null,
    recentSets: recent.docs.map(dataWithId),
  };
}

export async function getLearningDays(actor: Actor, input: unknown) {
  const req = parse(dateRangeSchema, input);
  await assertActive(actor);
  return { items: await learningDays(actor, req.from, req.to) };
}

export async function getHeatmap(actor: Actor, input: unknown) {
  const req = parse(dateRangeSchema, input);
  await assertActive(actor);
  const days = new Map(
    (await learningDays(actor, req.from, req.to)).map((d) => [d.dayKey, d]),
  );
  const items = [];
  for (let d = req.from; d <= req.to; d = addDays(d, 1))
    items.push({
      dayKey: d,
      totalCount: days.get(d)?.totalCount ?? 0,
      intensity: Math.min(4, Math.ceil((days.get(d)?.totalCount ?? 0) / 5)),
    });
  return { items };
}

export async function getDayActivity(actor: Actor, input: unknown) {
  const req = parse(z.object({ dayKey: isoDay }).strict(), input);
  await assertActive(actor);
  return (
    (await userRef(actor, "learningDays", req.dayKey).get()).data() ?? null
  );
}

export async function getChart(actor: Actor, input: unknown) {
  const req = parse(dateRangeSchema, input);
  await assertActive(actor);
  const words = await db
    .collection(`users/${actor.uid}/wordProgress`)
    .where("everRemembered", "==", true)
    .get();
  const counts = new Map<string, number>();
  let cumulative = 0;
  for (const word of words.docs) {
    const d = dayKey(fromTimestamp(word.data().firstRememberedAt));
    if (d < req.from) cumulative++;
    else counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const items = [];
  for (let d = req.from; d <= req.to; d = addDays(d, 1)) {
    cumulative += counts.get(d) ?? 0;
    items.push({ dayKey: d, learnedCount: cumulative });
  }
  return { items };
}

export async function getRecentSets(actor: Actor, input: unknown) {
  const req = parse(
    z.object({ cursor: z.string().max(1024).optional() }).strict(),
    input,
  );
  await assertActive(actor);
  let query = db
    .collection(`users/${actor.uid}/deckActivity`)
    .orderBy("lastActivityAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (req.cursor) {
    const cursor = decodeCursor(req.cursor, actor.uid, "recent");
    query = query.startAfter(Timestamp.fromMillis(cursor.time), cursor.id);
  }
  const snapshots = await query.limit(21).get();
  const items = snapshots.docs.slice(0, 20).map(dataWithId);
  const last = snapshots.docs[19];
  return {
    items,
    ...(snapshots.size > 20
      ? {
          cursor: encodeCursor({
            uid: actor.uid,
            kind: "recent",
            time: last.data().lastActivityAt.toMillis(),
            id: last.id,
          }),
        }
      : {}),
  };
}
