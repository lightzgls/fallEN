import { type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import {
  db,
  bucket,
  type Actor,
  type Data,
  fail,
  hash,
  identifier,
  parse,
  requireDoc,
  cursorDecode,
  cursorEncode,
  assertActive,
  empty,
} from "../shared/core.js";

const read = (path: string, tx?: Transaction) =>
  tx ? tx.get(db.doc(path)) : db.doc(path).get();
export const sourceSchema = z
  .object({
    sourceType: z.enum(["SYSTEM_DECK", "PERSONAL_VOCABULARY"]),
    wordSetId: identifier.optional(),
    revisionId: identifier.optional(),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.sourceType === "SYSTEM_DECK" && !source.wordSetId)
      ctx.addIssue({ code: "custom", message: "wordSetId required" });
    if (
      source.sourceType === "PERSONAL_VOCABULARY" &&
      (source.wordSetId || source.revisionId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Personal vocabulary has no deck",
      });
  });
export interface SourceWord {
  wordId: string;
  wordVersion: number;
  word: Data;
  entry?: Data;
}
export interface SourceRead {
  source: Data;
  words: SourceWord[];
}

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
export function normalizeKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}
interface SearchEntry {
  key: string;
  wordId: string;
  wordVersion: number;
}
const indexCache = new Map<string, { entries: SearchEntry[]; hash: string }>();
async function searchIndex(release: Data): Promise<SearchEntry[]> {
  if (!release.searchIndexPath || !release.searchIndexHash)
    fail("DICTIONARY_NOT_READY");
  const cached = indexCache.get(release.id);
  if (cached && cached.hash === release.searchIndexHash) return cached.entries;
  const file = bucket.file(release.searchIndexPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > 64 * 1024 * 1024) fail("INDEX_INVALID");
  const [bytes] = await file.download();
  if (hash(bytes.toString()) !== release.searchIndexHash) fail("INDEX_INVALID");
  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes.toString());
  } catch {
    return fail("INDEX_INVALID");
  }
  const validated = z
    .object({
      releaseId: identifier,
      entries: z.array(
        z
          .object({
            key: z.string().max(200),
            wordId: identifier,
            wordVersion: z.number().int().positive(),
          })
          .strict(),
      ),
    })
    .strict()
    .safeParse(decoded);
  if (!validated.success || validated.data.releaseId !== release.id)
    fail("INDEX_INVALID");
  if (indexCache.size >= 3) indexCache.delete(indexCache.keys().next().value!);
  indexCache.set(release.id, {
    entries: validated.data.entries,
    hash: release.searchIndexHash,
  });
  return validated.data.entries;
}
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[b.length];
}
async function findWords(_actor: Actor, raw: unknown): Promise<Data> {
  const input = parse(
    z
      .object({
        query: z.string().trim().min(1).max(100),
        partOfSpeech: z.string().trim().min(1).max(100).optional(),
        cursor: z.string().max(4096).optional(),
        releaseId: identifier.optional(),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
      .strict(),
    raw,
  );
  const query = normalizeKey(input.query);
  const cursor = input.cursor ? cursorDecode(input.cursor) : undefined;
  if (
    cursor &&
    (cursor.query !== query ||
      cursor.partOfSpeech !== input.partOfSpeech ||
      (input.releaseId && input.releaseId !== cursor.releaseId))
  )
    fail("VALIDATION_FAILED");
  const release = await resolveRelease(cursor?.releaseId ?? input.releaseId);
  const entries = await searchIndex(release);
  const ranks = new Map<
    string,
    {
      wordId: string;
      wordVersion: number;
      rank: number;
      key: string;
      spelling: string;
    }
  >();
  const possible = entries.filter(
    (item) =>
      item.key === query ||
      item.key.startsWith(query) ||
      (query.length >= 3 && distance(item.key, query) <= 1),
  );
  const eligible: Array<SearchEntry & { spelling: string }> = [];
  const aliasesByWord = new Map<string, SearchEntry[]>();
  for (const item of possible) {
    const aliases = aliasesByWord.get(item.wordId) ?? [];
    aliases.push(item);
    aliasesByWord.set(item.wordId, aliases);
  }
  for (const [wordId, aliases] of aliasesByWord) {
    const entry = (
      await read(`dictionaryReleases/${release.id}/entries/${wordId}`)
    ).data();
    if (!entry?.active) continue;
    const word = await readWordVersion(wordId, entry.wordVersion);
    if (
      input.partOfSpeech &&
      !word.meanings.some(
        (meaning: Data) => meaning.partOfSpeech === input.partOfSpeech,
      )
    )
      continue;
    for (const item of aliases)
      if (item.wordVersion === entry.wordVersion)
        eligible.push({ ...item, spelling: word.spelling });
  }
  const primary = eligible.filter(
    (item) => item.key === query || item.key.startsWith(query),
  );
  const matches = primary.length
    ? primary
    : query.length >= 3
      ? eligible.filter((item) => distance(item.key, query) <= 1)
      : [];
  for (const item of matches) {
    const rank = item.key === query ? 0 : item.key.startsWith(query) ? 1 : 2;
    const previous = ranks.get(item.wordId);
    if (!previous || rank < previous.rank)
      ranks.set(item.wordId, { ...item, rank });
  }
  const ordered = [...ranks.values()].sort(
    (a, b) =>
      a.rank - b.rank ||
      a.spelling.localeCompare(b.spelling, "en") ||
      a.wordId.localeCompare(b.wordId),
  );
  const sorted = ordered;
  if (!primary.length) sorted.splice(5);
  const offset = cursor?.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > sorted.length)
    fail("VALIDATION_FAILED");
  const items = [];
  for (const item of sorted.slice(offset, offset + input.pageSize)) {
    const word = await readWord(item.wordId, release.id);
    items.push({ ...word, matchType: ["EXACT", "PREFIX", "FUZZY"][item.rank] });
  }
  const next = offset + input.pageSize;
  return {
    items,
    releaseId: release.id,
    cursor:
      next < sorted.length
        ? cursorEncode({
            releaseId: release.id,
            query,
            partOfSpeech: input.partOfSpeech,
            offset: next,
          })
        : undefined,
  };
}
export const dictionaryHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  findWords,
  async getWord(_actor, raw) {
    const input = parse(
      z
        .object({ wordId: identifier, releaseId: identifier.optional() })
        .strict(),
      raw,
    );
    return readWord(input.wordId, input.releaseId);
  },
  async getWordVersion(_actor, raw) {
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
  },
  async findConnections(_actor, raw) {
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
  },
  async getPublishedDecks(_actor, raw) {
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
  },
  async getStudySource(actor, raw) {
    const input = parse(z.object({ source: sourceSchema }).strict(), raw);
    await assertActive(actor);
    return input.source.sourceType === "SYSTEM_DECK"
      ? readDeckSource(input.source)
      : readPersonalSource(actor);
  },
};
