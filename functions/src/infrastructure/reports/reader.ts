import { z } from "zod";
import type { Transaction } from "firebase-admin/firestore";
import type { ReportReader } from "../../contracts/reports/store.js";
import {
  categorySchema,
  statusSchema,
  targetSchema,
} from "../../contracts/reports/values.js";
import {
  revisionRecord,
  setWordRecord,
  speechRecord,
} from "../../contracts/content/records.js";
import { db } from "../firebase/runtime.js";
import { readWordVersion, resolveRelease } from "../dictionary/word-reader.js";
import { fail } from "../../shared/errors.js";
import { parse } from "../../shared/validation.js";
import { requireDoc } from "../firebase/records.js";
import { fromStored } from "../content/stored-values.js";
export const reportRecord = z
  .object({
    reportId: z.string(),
    ownerUid: z.string(),
    category: categorySchema,
    description: z.string(),
    targetRef: targetSchema,
    targetSnapshot: z.record(z.string(), z.unknown()),
    status: statusSchema,
    version: z.number(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .passthrough();
export function reportReader(tx?: Transaction): ReportReader {
  const read = async (path: string) => {
    const ref = db.doc(path),
      snapshot = await (tx ? tx.get(ref) : ref.get());
    return snapshot.exists ? fromStored(snapshot.data()) : undefined;
  };
  const get = async <S extends z.ZodType>(path: string, schema: S) => {
    const value = await read(path);
    return value === undefined ? undefined : parse(schema, value);
  };
  return {
    report: (id) => get(`contentReports/${id}`, reportRecord),
    actions: async (id) => {
      const query = db
          .collection(`contentReports/${id}/actions`)
          .orderBy("createdAt"),
        result = await (tx ? tx.get(query) : query.get());
      return result.docs.map((snapshot) =>
        parse(z.record(z.string(), z.unknown()), fromStored(snapshot.data())),
      );
    },
    revision: (deck, id) =>
      get(`systemDecks/${deck}/revisions/${id}`, revisionRecord),
    entry: (deck, revision, word) =>
      get(
        `systemDecks/${deck}/revisions/${revision}/words/${word}`,
        setWordRecord,
      ),
    release: (id) =>
      get(
        `dictionaryReleases/${id}`,
        z.object({ state: z.string() }).passthrough(),
      ),
    publicRelease: async (id) => {
      const release = await resolveRelease(id, tx);
      return { id: release.id };
    },
    releaseEntry: (release, word) =>
      get(
        `dictionaryReleases/${release}/entries/${word}`,
        z
          .object({ wordVersion: z.number(), active: z.boolean() })
          .passthrough(),
      ),
    wordVersion: (word, version) => readWordVersion(word, version, tx),
    speech: async (word) => {
      const record = await get(
        `words/${word}`,
        z.object({ speech: speechRecord.optional() }).passthrough(),
      );
      if (!record) fail("NOT_FOUND");
      return record.speech;
    },
    listeningContext: async (uid, ref) => {
      const path = `users/${uid}/gameSessions/${ref.sessionId}`;
      const doc = async (path: string) =>
        requireDoc(await (tx ? tx.get(db.doc(path)) : db.doc(path).get()));
      const game = await doc(path),
        round = await doc(`${path}/rounds/${ref.roundId}`),
        question = await doc(
          `${path}/rounds/${ref.roundId}/questions/${ref.questionId}`,
        );
      return {
        mode: game.mode,
        roundStatus: round.status,
        wordId: question.wordId,
        wordVersion: question.wordVersion,
        copy: question.wordCopy,
      };
    },
  };
}
