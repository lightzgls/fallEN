import {
  FieldPath,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import type { Actor } from "../../contracts/callable.js";
import type { LearningReader } from "../../contracts/learning/store.js";
import * as records from "../../contracts/learning/records.js";
import { sourceSchema, sourceKey } from "../../domain/values.js";
import { db } from "../firebase/runtime.js";
import {
  readDeckSource,
  readPersonalSource,
} from "../dictionary/source-reader.js";
import { readWord, resolveRelease } from "../dictionary/word-reader.js";
import { plain, record } from "./codec.js";
import { decodeCursor, encodeCursor } from "./pagination.js";
export function createLearningReads(
  actor: Actor,
  tx?: Transaction,
): LearningReader {
  const ref = (collection: string, key: string) =>
    db.doc(`users/${actor.uid}/${collection}/${key}`);
  const read = (collection: string, key: string) =>
    tx ? tx.get(ref(collection, key)) : ref(collection, key).get();
  const query = (value: FirebaseFirestore.Query) =>
    tx ? tx.get(value) : value.get();
  const list = async <S extends z.ZodType>(
    value: FirebaseFirestore.Query,
    schema: S,
  ) => (await query(value)).docs.map((doc) => schema.parse(plain(doc.data())));
  return {
    async membership(id) {
      return record(await read("personalWords", id), records.membershipRecord);
    },
    async plan(id) {
      return record(await read("srsSchedules", id), records.planRecord);
    },
    async memory(id) {
      return record(await read("wordProgress", id), records.memoryRecord);
    },
    async study(id) {
      return record(await read("studySessions", id), records.studyRecord);
    },
    async item(sessionId, wordId) {
      const r = ref("studySessions", sessionId).collection("items").doc(wordId);
      return record(await (tx ? tx.get(r) : r.get()), records.itemRecord);
    },
    async items(sessionId) {
      return list(
        ref("studySessions", sessionId).collection("items").orderBy("position"),
        records.itemRecord,
      );
    },
    async ratings(sessionId) {
      return list(
        db
          .collection(`users/${actor.uid}/assessmentEvents`)
          .where("sessionId", "==", sessionId),
        records.ratingRecord,
      );
    },
    async rating(id) {
      return record(await read("assessmentEvents", id), records.ratingRecord);
    },
    async place(source) {
      return record(
        await read("flashcardPositions", sourceKey(source)),
        records.placeRecord,
      );
    },
    async source(source) {
      const result =
        source.sourceType === "SYSTEM_DECK"
          ? await readDeckSource(source, tx)
          : await readPersonalSource(actor, tx);
      return { ...result, source: sourceSchema.parse(result.source) };
    },
    async releaseId() {
      return (await resolveRelease(undefined, tx)).id;
    },
    async entry(wordId, releaseId) {
      const r = db.doc(`dictionaryReleases/${releaseId}/entries/${wordId}`);
      const doc = await (tx ? tx.get(r) : r.get());
      return doc.exists
        ? z.object({ active: z.boolean() }).parse(doc.data())
        : undefined;
    },
    async word(wordId, releaseId) {
      return readWord(wordId, releaseId, tx);
    },
    async duePlans(day) {
      return list(
        db
          .collection(`users/${actor.uid}/srsSchedules`)
          .where("dueDate", "<=", day)
          .orderBy("dueDate")
          .orderBy(FieldPath.documentId()),
        records.planRecord,
      );
    },
    async day(day) {
      return record(await read("learningDays", day), records.dayRecord);
    },
    async summary() {
      return record(await read("dashboard", "summary"), records.summaryRecord);
    },
    async days(from, to) {
      return list(
        db
          .collection(`users/${actor.uid}/learningDays`)
          .where("dayKey", ">=", from)
          .where("dayKey", "<=", to)
          .orderBy("dayKey"),
        records.dayRecord,
      );
    },
    async rememberedMemories() {
      return list(
        db
          .collection(`users/${actor.uid}/wordProgress`)
          .where("everRemembered", "==", true),
        records.memoryRecord,
      );
    },
    async savedPage(cursor, pageSize) {
      let q = db
        .collection(`users/${actor.uid}/personalWords`)
        .where("active", "==", true)
        .orderBy("addedAt")
        .orderBy(FieldPath.documentId());
      if (cursor) {
        const value = decodeCursor(cursor, actor.uid, "saved");
        q = q.startAfter(Timestamp.fromMillis(value.time), value.id);
      }
      const page = await query(q.limit(pageSize + 1));
      const last = page.docs[pageSize - 1];
      return {
        items: page.docs
          .slice(0, pageSize)
          .map((doc) => records.membershipRecord.parse(plain(doc.data()))),
        ...(page.size > pageSize
          ? {
              cursor: encodeCursor({
                uid: actor.uid,
                kind: "saved",
                time: last.data().addedAt.toMillis(),
                id: last.id,
              }),
            }
          : {}),
      };
    },
    async savedCount() {
      return (
        await db
          .collection(`users/${actor.uid}/personalWords`)
          .where("active", "==", true)
          .count()
          .get()
      ).data().count;
    },
    async recentPage(cursor) {
      let q = db
        .collection(`users/${actor.uid}/deckActivity`)
        .orderBy("lastActivityAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (cursor) {
        const value = decodeCursor(cursor, actor.uid, "recent");
        q = q.startAfter(Timestamp.fromMillis(value.time), value.id);
      }
      const page = await query(q.limit(21));
      const last = page.docs[19];
      return {
        items: page.docs.slice(0, 20).map((doc) => ({
          ...records.recentSetRecord.parse(plain(doc.data())),
          id: doc.id,
        })),
        ...(page.size > 20
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
    },
    async recentDashboard() {
      const page = await query(
        db
          .collection(`users/${actor.uid}/deckActivity`)
          .orderBy("lastActivityAt", "desc")
          .limit(10),
      );
      return page.docs.map((doc) => ({
        ...records.recentSetRecord.parse(plain(doc.data())),
        id: doc.id,
      }));
    },
  };
}
