import type { Actor } from "../../contracts/callable.js";
import type { DictionaryStore } from "../../contracts/dictionary/store.js";
import type {
  ConnectionsInput,
  StudySourceInput,
  WordInput,
  WordVersionInput,
} from "../../contracts/dictionary/requests.js";
import { fail } from "../../shared/errors.js";

export function getWord(input: WordInput, store: DictionaryStore) {
  return store.readWord(input.wordId, input.releaseId);
}

export async function getWordVersion(
  input: WordVersionInput,
  store: DictionaryStore,
) {
  if (input.releaseId) {
    const word = await store.readWord(input.wordId, input.releaseId);
    if (word.version !== input.wordVersion) fail("WORD_VERSION_INVALID");
    return word;
  }
  for (const releaseId of await store.listPublicReleases()) {
    const entry = await store.readEntry(releaseId, input.wordId);
    if (entry?.active && entry.wordVersion === input.wordVersion)
      return store.readWord(input.wordId, releaseId);
  }
  return fail("WORD_VERSION_INVALID");
}

export async function findConnections(
  input: ConnectionsInput,
  store: DictionaryStore,
) {
  const word = await store.readWord(input.wordId, input.releaseId);
  if (word.version !== input.wordVersion) fail("WORD_VERSION_INVALID");
  const connections = await store.listConnections(input);
  return {
    items: await Promise.all(
      connections.map(async (item) => ({
        ...item,
        targetWord: await store.readWord(item.targetWordId, input.releaseId),
      })),
    ),
    releaseId: input.releaseId,
  };
}

export async function getPublishedDecks(store: DictionaryStore) {
  return {
    items: (await store.listActiveDecks()).filter(
      (deck) => deck.publishedRevisionId,
    ),
  };
}

export async function getStudySource(
  actor: Actor,
  input: StudySourceInput,
  store: DictionaryStore,
) {
  await store.assertActive(actor);
  return input.source.sourceType === "SYSTEM_DECK"
    ? store.readDeckSource(input.source)
    : store.readPersonalSource(actor);
}
