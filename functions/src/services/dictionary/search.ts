import { distance, normalizeKey } from "../../domain/dictionary/search-key.js";
import type {
  DictionaryStore,
  SearchEntry,
} from "../../contracts/dictionary/store.js";
import type { FindWordsInput } from "../../contracts/dictionary/requests.js";
import { cursorDecode, cursorEncode } from "../../shared/values.js";
import type { Data } from "../../shared/types.js";
import { fail } from "../../shared/errors.js";

export async function findWords(
  input: FindWordsInput,
  store: DictionaryStore,
): Promise<Data> {
  const query = normalizeKey(input.query);
  const cursor = input.cursor ? cursorDecode(input.cursor) : undefined;
  if (
    cursor &&
    (cursor.query !== query ||
      cursor.partOfSpeech !== input.partOfSpeech ||
      (input.releaseId && input.releaseId !== cursor.releaseId))
  )
    fail("VALIDATION_FAILED");
  const release = await store.resolveRelease(
    cursor?.releaseId ?? input.releaseId,
  );
  const entries = await store.searchIndex(release);
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
    const entry = await store.readEntry(release.id, wordId);
    if (!entry?.active) continue;
    const word = await store.readWordVersion(wordId, entry.wordVersion);
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
    const word = await store.readWord(item.wordId, release.id);
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
