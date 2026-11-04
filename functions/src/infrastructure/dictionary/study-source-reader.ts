import { type Transaction } from "firebase-admin/firestore";
import {
  sourceSchema,
  type SourceRead,
  type SourceWord,
} from "../../domain/dictionary/source.js";
import {
  assertActive,
  db,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import {
  read,
  readWord,
  readWordVersion,
  resolveRelease,
} from "./lexical-reader.js";

export async function readDeckSource(
  source: Data,
  tx?: Transaction,
): Promise<SourceRead> {
  const parsed = parse(sourceSchema, source);
  if (parsed.sourceType !== "SYSTEM_DECK") fail("VALIDATION_FAILED");
  const wordSetId = parsed.wordSetId!;
  const deck = requireDoc(
    await read(`systemDecks/${wordSetId}`, tx),
    "DECK_NOT_FOUND",
  );
  if (!deck.active || !deck.publishedRevisionId) fail("DECK_UNAVAILABLE");
  const revisionId = parsed.revisionId ?? deck.publishedRevisionId;
  const revision = requireDoc(
    await read(`systemDecks/${wordSetId}/revisions/${revisionId}`, tx),
    "REVISION_NOT_FOUND",
  );
  if (!["PUBLISHED", "RETIRED"].includes(revision.state))
    fail("DECK_UNAVAILABLE");
  const query = db
    .collection(`systemDecks/${wordSetId}/revisions/${revisionId}/words`)
    .orderBy("position");
  const entries = await (tx ? tx.get(query) : query.get());
  const words: SourceWord[] = [];
  const activeRelease = await resolveRelease(undefined, tx);
  for (const item of entries.docs) {
    const entry = item.data();
    const live = (
      await read(
        `dictionaryReleases/${activeRelease.id}/entries/${item.id}`,
        tx,
      )
    ).data();
    if (!live?.active) continue;
    const word = await readWordVersion(item.id, entry.wordVersion, tx);
    words.push({
      wordId: item.id,
      wordVersion: entry.wordVersion,
      word,
      entry,
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
  const saved = await (tx ? tx.get(query) : query.get());
  const words: SourceWord[] = [];
  const release = await resolveRelease(undefined, tx);
  for (const item of saved.docs) {
    const entry = (
      await read(`dictionaryReleases/${release.id}/entries/${item.id}`, tx)
    ).data();
    if (!entry?.active) continue;
    const word = await readWord(item.id, release.id, tx);
    words.push({ wordId: item.id, wordVersion: word.version, word });
  }
  return { source: { sourceType: "PERSONAL_VOCABULARY" }, words };
}
