import type { Actor } from "../contracts/callable.js";
import type { DictionaryStore } from "../contracts/dictionary/store.js";
import type {
  ConnectionsInput,
  FindWordsInput,
  StudySourceInput,
  WordInput,
  WordVersionInput,
} from "../contracts/dictionary/requests.js";
import { findWords } from "./dictionary/search.js";
import {
  findConnections,
  getPublishedDecks,
  getStudySource,
  getWord,
  getWordVersion,
} from "./dictionary/queries.js";

export function createDictionaryService(store: DictionaryStore) {
  return {
    findWords: (_actor: Actor, input: FindWordsInput) =>
      findWords(input, store),
    getWord: (_actor: Actor, input: WordInput) => getWord(input, store),
    getWordVersion: (_actor: Actor, input: WordVersionInput) =>
      getWordVersion(input, store),
    findConnections: (_actor: Actor, input: ConnectionsInput) =>
      findConnections(input, store),
    getPublishedDecks: async (_actor: Actor, _input: Record<string, never>) =>
      getPublishedDecks(store),
    getStudySource: (actor: Actor, input: StudySourceInput) =>
      getStudySource(actor, input, store),
  };
}
