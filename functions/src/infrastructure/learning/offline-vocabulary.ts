import { FieldPath } from "firebase-admin/firestore";
import type { Actor } from "../../contracts/callable.js";
import { membershipRecord } from "../../contracts/learning/records.js";
import { assertActive } from "../firebase/access.js";
import { db } from "../firebase/runtime.js";
import { plain } from "./codec.js";
import { createLearningReads } from "./reads.js";

export async function offlineVocabularyPage(
  actor: Actor,
  cursor: string | undefined,
  pageSize: number,
) {
  await assertActive(actor);
  let query = db
    .collection(`users/${actor.uid}/personalWords`)
    .orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor);
  const page = (await query.limit(pageSize + 1).get()).docs;
  const reads = createLearningReads(actor);
  const releaseId = await reads.releaseId();
  const items = await Promise.all(
    page.slice(0, pageSize).map(async (doc) => {
      const { wordId, membershipVersion, active } = membershipRecord.parse(
        plain(doc.data()),
      );
      const membership = { wordId, membershipVersion, active };
      if (!active) return membership;
      const [entry, plan] = await Promise.all([
        reads.entry(wordId, releaseId),
        reads.plan(wordId),
      ]);
      return {
        ...membership,
        plan,
        ...(entry?.active ? { word: await reads.word(wordId, releaseId) } : {}),
      };
    }),
  );
  return {
    items,
    ...(page.length > pageSize ? { cursor: page[pageSize - 1].id } : {}),
  };
}
