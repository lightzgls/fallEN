import type { z } from "zod";
import type { Data } from "../../shared/types.js";
import { fail } from "../../shared/errors.js";
import type { sourceSchema } from "./source.js";

/** Public and retained releases remain readable; draft releases never grant access. */
export function publicRelease(key: string, release: Data | undefined): Data {
  if (!release || !["PUBLISHED", "RETIRED"].includes(release.state))
    fail("RELEASE_UNAVAILABLE");
  return { ...release, id: key, releaseId: key };
}
export function releaseKey(
  requested: string | undefined,
  active: unknown,
): unknown {
  const key = requested ?? active;
  if (!key) fail("DICTIONARY_NOT_READY");
  return key;
}
export function lexicalVersion(
  wordId: string,
  version: number,
  word: Data | undefined,
): Data {
  if (!word) fail("WORD_NOT_FOUND");
  if (word.wordId !== wordId || word.version !== version)
    fail("WORD_VERSION_INVALID");
  return { ...word, id: wordId, wordId, version, wordVersion: version };
}
export function activeEntry(entry: Data | undefined): Data {
  if (!entry) fail("WORD_NOT_FOUND");
  if (!entry.active) fail("WORD_UNAVAILABLE");
  return entry;
}
export function publishedWord(
  word: Data,
  entry: Data,
  releaseId: string,
  operational: Data | undefined,
): Data {
  return {
    ...word,
    active: entry.active,
    releaseId,
    speech: operational?.speech,
  };
}
export function deckRevision(
  source: z.output<typeof sourceSchema>,
  deck: Data | undefined,
): { wordSetId: string; revisionId: string } {
  const wordSetId = systemDeckId(source);
  if (!deck) fail("DECK_NOT_FOUND");
  if (!deck.active || !deck.publishedRevisionId) fail("DECK_UNAVAILABLE");
  return {
    wordSetId,
    revisionId: source.revisionId ?? deck.publishedRevisionId,
  };
}
export function systemDeckId(source: z.output<typeof sourceSchema>): string {
  if (source.sourceType !== "SYSTEM_DECK" || !source.wordSetId)
    fail("VALIDATION_FAILED");
  return source.wordSetId;
}
export function readableRevision(revision: Data | undefined): void {
  if (!revision) fail("REVISION_NOT_FOUND");
  if (!["PUBLISHED", "RETIRED"].includes(revision.state))
    fail("DECK_UNAVAILABLE");
}
export interface SourceEntry {
  wordId: string;
  entry: Data;
  live?: Data;
}
/** Current availability filters a pinned source without replacing its immutable word version. */
export function availableSourceEntries(entries: SourceEntry[]): SourceEntry[] {
  return entries.filter((item) => item.live?.active);
}
