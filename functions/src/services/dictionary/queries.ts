import { z } from "zod";
import { sourceSchema } from "../../domain/dictionary/source.js";
import {
  read,
  readWord,
} from "../../infrastructure/dictionary/lexical-reader.js";
import {
  readDeckSource,
  readPersonalSource,
} from "../../infrastructure/dictionary/study-source-reader.js";
import {
  assertActive,
  db,
  empty,
  fail,
  identifier,
  parse,
  type Actor,
} from "../../shared/core.js";

export async function getWord(_actor: Actor, raw: unknown) {
  const input = parse(
    z.object({ wordId: identifier, releaseId: identifier.optional() }).strict(),
    raw,
  );
  return readWord(input.wordId, input.releaseId);
}

export async function getWordVersion(_actor: Actor, raw: unknown) {
  const input = parse(
    z
      .object({
        wordId: identifier,
        wordVersion: z.number().int().positive(),
        releaseId: identifier.optional(),
      })
      .strict(),
    raw,
  );
  if (input.releaseId) {
    const word = await readWord(input.wordId, input.releaseId);
    if (word.version !== input.wordVersion) fail("WORD_VERSION_INVALID");
    return word;
  }
  const releases = await db
    .collection("dictionaryReleases")
    .where("state", "in", ["PUBLISHED", "RETIRED"])
    .get();
  for (const release of releases.docs) {
    const entry = (
      await read(`dictionaryReleases/${release.id}/entries/${input.wordId}`)
    ).data();
    if (entry?.active && entry.wordVersion === input.wordVersion)
      return readWord(input.wordId, release.id);
  }
  return fail("WORD_VERSION_INVALID");
}

export async function findConnections(_actor: Actor, raw: unknown) {
  const input = parse(
    z
      .object({
        wordId: identifier,
        wordVersion: z.number().int().positive(),
        releaseId: identifier,
        type: z.enum(["SYNONYM", "ANTONYM", "COLLOCATION", "WORD_FAMILY"]),
      })
      .strict(),
    raw,
  );
  const word = await readWord(input.wordId, input.releaseId);
  if (word.version !== input.wordVersion) fail("WORD_VERSION_INVALID");
  const docs = await db
    .collection(`dictionaryReleases/${input.releaseId}/connections`)
    .where("sourceWordId", "==", input.wordId)
    .where("sourceWordVersion", "==", input.wordVersion)
    .where("type", "==", input.type)
    .where("active", "==", true)
    .orderBy("sourceMeaningId")
    .orderBy("targetWordId")
    .orderBy("targetMeaningId")
    .orderBy("__name__")
    .get();
  return {
    items: await Promise.all(
      docs.docs.map(async (item) => ({
        ...item.data(),
        id: item.id,
        targetWord: await readWord(item.data().targetWordId, input.releaseId),
      })),
    ),
    releaseId: input.releaseId,
  };
}

export async function getPublishedDecks(_actor: Actor, raw: unknown) {
  parse(empty, raw);
  const docs = await db
    .collection("systemDecks")
    .where("active", "==", true)
    .get();
  return {
    items: docs.docs
      .filter((x) => x.data().publishedRevisionId)
      .map((x) => ({ ...x.data(), id: x.id })),
  };
}

export async function getStudySource(actor: Actor, raw: unknown) {
  const input = parse(z.object({ source: sourceSchema }).strict(), raw);
  await assertActive(actor);
  return input.source.sourceType === "SYSTEM_DECK"
    ? readDeckSource(input.source)
    : readPersonalSource(actor);
}
