import { z } from "zod";
import type { Transaction } from "firebase-admin/firestore";
import type { ContentReader } from "../../contracts/content/store.js";
import {
  assetRecord,
  batchRecord,
  commandRecord,
  deckRecord,
  importRowRecord,
  limitRecord,
  revisionRecord,
  setWordRecord,
  speechRecord,
  topicRecord,
} from "../../contracts/content/records.js";
import { db } from "../firebase/runtime.js";
import { readWordVersion, resolveRelease } from "../dictionary/word-reader.js";
import { hash } from "../../shared/values.js";
import { fail } from "../../shared/errors.js";
import { parse } from "../../shared/validation.js";
import { fromStored } from "./stored-values.js";

export function contentReader(transaction?: Transaction): ContentReader {
  const read = async (path: string) => {
    const ref = db.doc(path);
    const snapshot = await (transaction ? transaction.get(ref) : ref.get());
    return snapshot.exists ? fromStored(snapshot.data()) : undefined;
  };
  const get = async <S extends z.ZodType>(
    path: string,
    schema: S,
    id?: string,
  ) => {
    const value = await read(path);
    return value === undefined
      ? undefined
      : parse(
          schema,
          id === undefined
            ? value
            : { ...parse(z.record(z.string(), z.unknown()), value), id },
        );
  };
  const list = async <S extends z.ZodType>(
    query: FirebaseFirestore.Query,
    schema: S,
    identified = false,
  ) => {
    const result = await (transaction ? transaction.get(query) : query.get());
    return result.docs.map((snapshot) =>
      parse(
        schema,
        fromStored(
          identified
            ? { ...snapshot.data(), id: snapshot.id }
            : snapshot.data(),
        ),
      ),
    );
  };
  return {
    deck: async (id) => get(`systemDecks/${id}`, deckRecord, id),
    decks: () =>
      list(db.collection("systemDecks").orderBy("__name__"), deckRecord, true),
    revision: (deck, id) =>
      get(`systemDecks/${deck}/revisions/${id}`, revisionRecord),
    entries: (deck, revision) =>
      list(
        db
          .collection(`systemDecks/${deck}/revisions/${revision}/words`)
          .orderBy("position"),
        setWordRecord,
      ),
    asset: (id) => get(`imageAssets/${id}`, assetRecord),
    batch: (id) => get(`contentImports/${id}`, batchRecord),
    batches: (deck) =>
      list(
        db
          .collection("contentImports")
          .where("wordSetId", "==", deck)
          .orderBy("createdAt", "desc"),
        batchRecord,
      ),
    rows: (id) =>
      list(
        db.collection(`contentImports/${id}/rows`).orderBy("rowNumber"),
        importRowRecord,
      ),
    row: (batch, id) =>
      get(`contentImports/${batch}/rows/${id}`, importRowRecord),
    applyingImports: (deck, revision) =>
      list(
        db
          .collection("contentImports")
          .where("wordSetId", "==", deck)
          .where("revisionId", "==", revision)
          .where("status", "==", "APPLYING"),
        batchRecord,
      ),
    processedCommand: (uid, id) =>
      get(`users/${uid}/commands/${id}`, commandRecord),
    release: async (id) => {
      const value = await resolveRelease(id, transaction);
      return { id: value.id, state: value.state };
    },
    imageRevision: (deck, id) =>
      get(
        `systemDecks/${deck}/revisions/${id}`,
        z
          .object({
            state: z.string(),
            coverImageAssetId: z.string().optional(),
          })
          .passthrough(),
      ),
    imageRelease: async (id) => {
      const release = await get(
        `dictionaryReleases/${id}`,
        z.object({ state: z.string() }).passthrough(),
      );
      return release ? { id, state: release.state } : undefined;
    },
    activeReleaseId: async () => {
      const config = await get(
        "config/dictionary",
        z.object({ activeReleaseId: z.unknown().optional() }).passthrough(),
      );
      return typeof config?.activeReleaseId === "string"
        ? config.activeReleaseId
        : undefined;
    },
    releaseEntry: (release, word) =>
      get(
        `dictionaryReleases/${release}/entries/${word}`,
        z
          .object({ wordVersion: z.number(), active: z.boolean() })
          .passthrough(),
      ),
    exactKey: (release, key) =>
      get(
        `dictionaryReleases/${release}/keys/${hash(key)}`,
        z
          .object({
            normalizedKey: z.string(),
            wordId: z.string(),
            wordVersion: z.number(),
          })
          .passthrough(),
      ),
    wordVersion: (word, version) => readWordVersion(word, version, transaction),
    speech: async (word) => {
      const record = await get(
        `words/${word}`,
        z.object({ speech: speechRecord.optional() }).passthrough(),
      );
      if (!record) fail("NOT_FOUND");
      return record.speech;
    },
    topic: (id) => get(`aiScenarios/${id}`, topicRecord),
    topics: () =>
      list(db.collection("aiScenarios").orderBy("__name__"), topicRecord),
    limit: () => get("config/ai", limitRecord),
  };
}
