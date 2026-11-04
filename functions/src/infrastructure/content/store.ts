import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import type { Actor } from "../../contracts/callable.js";
import type {
  ContentStore,
  ContentTransaction,
  WriteMode,
} from "../../contracts/content/store.js";
import type { RecordData } from "../../contracts/content/records.js";
import { db } from "../firebase/runtime.js";
import { assertActive } from "../firebase/access.js";
import { command } from "../firebase/commands.js";
import { parse } from "../../shared/validation.js";
import { rowSchema } from "../../contracts/content/values.js";
import { contentReader } from "./reader.js";
import { fromStored } from "./stored-values.js";
import { inspectContentUpload, readImportFileRows } from "./files.js";
import { imageReadUrl } from "./image-url.js";

function contentTransaction(tx: Transaction): ContentTransaction {
  function stage(
    path: string,
    data: RecordData,
    mode: WriteMode,
    remove: string[] = [],
  ) {
    const reference = db.doc(path);
    const fields = {
      ...data,
      ...Object.fromEntries(remove.map((key) => [key, FieldValue.delete()])),
    };
    if (mode === "create") tx.create(reference, fields);
    else if (mode === "replace") tx.set(reference, fields);
    else tx.update(reference, fields);
  }
  return {
    ...contentReader(tx),
    stageDeck: (id, data, mode, remove) =>
      stage(`systemDecks/${id}`, data, mode, remove),
    stageRevision: (deck, id, data, mode, remove) =>
      stage(`systemDecks/${deck}/revisions/${id}`, data, mode, remove),
    stageEntry: (deck, revision, word, data, mode) =>
      stage(
        `systemDecks/${deck}/revisions/${revision}/words/${word}`,
        data,
        mode,
      ),
    removeEntry: (deck, revision, word) => {
      tx.delete(
        db.doc(`systemDecks/${deck}/revisions/${revision}/words/${word}`),
      );
    },
    stageBatch: (id, data, mode) => stage(`contentImports/${id}`, data, mode),
    stageRow: (batch, id, data, mode) =>
      stage(`contentImports/${batch}/rows/${id}`, data, mode),
    stageAsset: (id, data, mode) => stage(`imageAssets/${id}`, data, mode),
    stageSpeech: (word, speech) => stage(`words/${word}`, { speech }, "patch"),
    stageTopic: (id, data) => stage(`aiScenarios/${id}`, data, "replace"),
    stageLimit: (data) => stage("config/ai", data, "replace"),
    stageCommand: (uid, id, data, mode, remove) =>
      stage(`users/${uid}/commands/${id}`, data, mode, remove),
  };
}
export function createContentStore(): ContentStore {
  return {
    ...contentReader(),
    active: (actor) => assertActive(actor),
    transaction: async (actor, work, checkActive = true) =>
      db.runTransaction(async (tx) => {
        if (checkActive) await assertActive(actor, tx);
        return work(contentTransaction(tx), new Date());
      }),
    command: async (actor: Actor, kind, input, work) =>
      parse(
        z.record(z.string(), z.unknown()),
        fromStored(
          await command(actor, kind, input, (tx, now) =>
            work(contentTransaction(tx), now.toDate()),
          ),
        ),
      ),
    inspectUpload: (asset) => inspectContentUpload(asset),
    importFile: async (asset) =>
      (await readImportFileRows(asset)).map((row) => parse(rowSchema, row)),
    imageUrl: imageReadUrl,
  };
}
