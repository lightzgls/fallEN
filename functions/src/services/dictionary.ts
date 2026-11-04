import { type Actor } from "../shared/types.js";
import { findWords } from "./dictionary/search.js";
import {
  getWord,
  getWordVersion,
  findConnections,
  getPublishedDecks,
  getStudySource,
} from "./dictionary/queries.js";
export { sourceSchema } from "../domain/dictionary/source.js";
export { type SourceWord } from "../domain/dictionary/source.js";
export { type SourceRead } from "../domain/dictionary/source.js";
export { resolveRelease } from "../infrastructure/dictionary/lexical-reader.js";
export { readWordVersion } from "../infrastructure/dictionary/lexical-reader.js";
export { currentEntry } from "../infrastructure/dictionary/lexical-reader.js";
export { readWord } from "../infrastructure/dictionary/lexical-reader.js";
export { readDeckSource } from "../infrastructure/dictionary/study-source-reader.js";
export { readPersonalSource } from "../infrastructure/dictionary/study-source-reader.js";
export { normalizeKey } from "../domain/dictionary/search-key.js";
export const dictionaryHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  findWords: findWords,
  getWord: getWord,
  getWordVersion: getWordVersion,
  findConnections: findConnections,
  getPublishedDecks: getPublishedDecks,
  getStudySource: getStudySource,
};
