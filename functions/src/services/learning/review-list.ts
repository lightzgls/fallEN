import {
  FieldPath,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { empty } from "../../domain/backend.js";
import { userRef } from "../../infrastructure/learning/references.js";
import {
  assertActive,
  dayKey,
  db,
  parse,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { readWord, resolveRelease } from "../dictionary.js";

export async function dueWords(actor: Actor, tx?: Transaction) {
  const release = await resolveRelease(undefined, tx);
  const query = db
    .collection(`users/${actor.uid}/srsSchedules`)
    .where("dueDate", "<=", dayKey())
    .orderBy("dueDate")
    .orderBy(FieldPath.documentId());
  const schedules = tx ? await tx.get(query) : await query.get();
  const words: Data[] = [];
  for (const snapshot of schedules.docs) {
    const membershipRef = userRef(actor, "personalWords", snapshot.id);
    const membership = tx
      ? await tx.get(membershipRef)
      : await membershipRef.get();
    if (!membership.data()?.active) continue;
    const entryRef = db.doc(
      `dictionaryReleases/${release.id}/entries/${snapshot.id}`,
    );
    const entry = (await (tx ? tx.get(entryRef) : entryRef.get())).data();
    if (!entry?.active) continue;
    const word = await readWord(snapshot.id, release.id, tx);
    words.push({
      wordId: snapshot.id,
      word,
      plan: snapshot.data(),
      membershipVersion: membership.data()!.membershipVersion,
    });
  }
  return words;
}

export async function getDueWords(actor: Actor, input: unknown) {
  parse(empty, input);
  await assertActive(actor);
  const items = await dueWords(actor);
  return {
    items,
    count: items.length,
    asOfDay: dayKey(),
    fetchedAt: Timestamp.now(),
  };
}
