import { type Transaction } from "firebase-admin/firestore";
import {
  db,
  fail,
  identifier,
  parse,
  requireDoc,
  type Data,
} from "../../shared/core.js";

export const read = (path: string, tx?: Transaction) =>
  tx ? tx.get(db.doc(path)) : db.doc(path).get();

export async function resolveRelease(
  releaseId?: string,
  tx?: Transaction,
): Promise<Data> {
  const key =
    releaseId ?? (await read("config/dictionary", tx)).data()?.activeReleaseId;
  if (!key) fail("DICTIONARY_NOT_READY");
  const release = requireDoc(
    await read(`dictionaryReleases/${parse(identifier, key)}`, tx),
    "RELEASE_UNAVAILABLE",
  );
  if (!["PUBLISHED", "RETIRED"].includes(release.state))
    fail("RELEASE_UNAVAILABLE");
  return { ...release, id: key, releaseId: key };
}

export async function readWordVersion(
  wordId: string,
  wordVersion: number,
  tx?: Transaction,
): Promise<Data> {
  const word = requireDoc(
    await read(
      `words/${parse(identifier, wordId)}/versions/${wordVersion}`,
      tx,
    ),
    "WORD_NOT_FOUND",
  );
  if (word.wordId !== wordId || word.version !== wordVersion)
    fail("WORD_VERSION_INVALID");
  return { ...word, id: wordId, wordId, version: wordVersion, wordVersion };
}

export async function currentEntry(
  wordId: string,
  tx?: Transaction,
): Promise<Data> {
  const release = await resolveRelease(undefined, tx);
  const entry = requireDoc(
    await read(`dictionaryReleases/${release.id}/entries/${wordId}`, tx),
    "WORD_NOT_FOUND",
  );
  return { ...entry, wordId, releaseId: release.id };
}

export async function readWord(
  wordId: string,
  releaseId?: string,
  tx?: Transaction,
): Promise<Data> {
  const release = await resolveRelease(releaseId, tx);
  const entry = requireDoc(
    await read(
      `dictionaryReleases/${release.id}/entries/${parse(identifier, wordId)}`,
      tx,
    ),
    "WORD_NOT_FOUND",
  );
  if (!entry.active) fail("WORD_UNAVAILABLE");
  const word = await readWordVersion(wordId, entry.wordVersion, tx);
  const operational = (await read(`words/${wordId}`, tx)).data();
  return {
    ...word,
    active: entry.active,
    releaseId: release.id,
    speech: operational?.speech,
  };
}
