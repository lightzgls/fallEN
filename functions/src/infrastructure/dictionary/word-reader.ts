import { type Transaction } from "firebase-admin/firestore";
import { db } from "../firebase/runtime.js";
import { fail } from "../../shared/errors.js";
import { identifier, parse } from "../../shared/validation.js";
import type { Data } from "../../shared/types.js";
import {
  activeEntry,
  lexicalVersion,
  publicRelease,
  publishedWord,
  releaseKey,
} from "../../domain/dictionary/policy.js";

export const read = (path: string, tx?: Transaction) =>
  tx ? tx.get(db.doc(path)) : db.doc(path).get();

export async function resolveRelease(
  releaseId?: string,
  tx?: Transaction,
): Promise<Data> {
  const active =
    releaseId === undefined
      ? (await read("config/dictionary", tx)).data()?.activeReleaseId
      : undefined;
  const key = parse(identifier, releaseKey(releaseId, active));
  return publicRelease(
    key,
    (await read(`dictionaryReleases/${key}`, tx)).data(),
  );
}

export async function readWordVersion(
  wordId: string,
  wordVersion: number,
  tx?: Transaction,
): Promise<Data> {
  const word = (
    await read(`words/${parse(identifier, wordId)}/versions/${wordVersion}`, tx)
  ).data();
  return lexicalVersion(wordId, wordVersion, word);
}

export async function currentEntry(
  wordId: string,
  tx?: Transaction,
): Promise<Data> {
  const release = await resolveRelease(undefined, tx);
  const entry =
    (
      await read(`dictionaryReleases/${release.id}/entries/${wordId}`, tx)
    ).data() ?? fail("WORD_NOT_FOUND");
  return { ...entry, wordId, releaseId: release.id };
}

export async function readWord(
  wordId: string,
  releaseId?: string,
  tx?: Transaction,
): Promise<Data> {
  const release = await resolveRelease(releaseId, tx);
  const entry = activeEntry(
    (
      await read(
        `dictionaryReleases/${release.id}/entries/${parse(identifier, wordId)}`,
        tx,
      )
    ).data(),
  );
  const word = await readWordVersion(wordId, entry.wordVersion, tx);
  const operational = (await read(`words/${wordId}`, tx)).data();
  return publishedWord(word, entry, release.id, operational);
}
