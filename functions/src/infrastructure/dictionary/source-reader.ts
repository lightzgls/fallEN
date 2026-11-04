import type { Transaction } from "firebase-admin/firestore";
import {
  sourceSchema,
  type SourceRead,
  type SourceWord,
} from "../../domain/dictionary/source.js";
import {
  availableSourceEntries,
  deckRevision,
  readableRevision,
  systemDeckId,
  type SourceEntry,
} from "../../domain/dictionary/policy.js";
import { db } from "../firebase/runtime.js";
import { assertActive } from "../firebase/access.js";
import { parse } from "../../shared/validation.js";
import type { Actor, Data } from "../../shared/types.js";
import {
  read,
  readWord,
  readWordVersion,
  resolveRelease,
} from "./word-reader.js";

export async function readDeckSource(
  source: Data,
  tx?: Transaction,
): Promise<SourceRead> {
  const parsed = parse(sourceSchema, source),
    wordSetId = systemDeckId(parsed);
  const selected = deckRevision(
    parsed,
    (await read(`systemDecks/${wordSetId}`, tx)).data(),
  );
  const revisionId = selected.revisionId;
  readableRevision(
    (await read(`systemDecks/${wordSetId}/revisions/${revisionId}`, tx)).data(),
  );
  const query = db
    .collection(`systemDecks/${wordSetId}/revisions/${revisionId}/words`)
    .orderBy("position");
  const entries = await (tx ? tx.get(query) : query.get()),
    release = await resolveRelease(undefined, tx),
    candidates: SourceEntry[] = [];
  for (const item of entries.docs)
    candidates.push({
      wordId: item.id,
      entry: item.data(),
      live: (
        await read(`dictionaryReleases/${release.id}/entries/${item.id}`, tx)
      ).data(),
    });
  const words: SourceWord[] = [];
  for (const item of availableSourceEntries(candidates)) {
    const word = await readWordVersion(item.wordId, item.entry.wordVersion, tx);
    words.push({
      wordId: item.wordId,
      wordVersion: item.entry.wordVersion,
      word,
      entry: item.entry,
    });
  }
  return {
    source: { sourceType: "SYSTEM_DECK", wordSetId, revisionId },
    words,
  };
}

export async function readPersonalSource(
  actor: Actor,
  tx?: Transaction,
): Promise<SourceRead> {
  await assertActive(actor, tx);
  const query = db
    .collection(`users/${actor.uid}/personalWords`)
    .where("active", "==", true)
    .orderBy("addedAt")
    .orderBy("__name__");
  const saved = await (tx ? tx.get(query) : query.get()),
    release = await resolveRelease(undefined, tx),
    candidates: SourceEntry[] = [];
  for (const item of saved.docs)
    candidates.push({
      wordId: item.id,
      entry: item.data(),
      live: (
        await read(`dictionaryReleases/${release.id}/entries/${item.id}`, tx)
      ).data(),
    });
  const words: SourceWord[] = [];
  for (const item of availableSourceEntries(candidates)) {
    const word = await readWord(item.wordId, release.id, tx);
    words.push({ wordId: item.wordId, wordVersion: word.version, word });
  }
  return { source: { sourceType: "PERSONAL_VOCABULARY" }, words };
}
