import { callable } from "../handlers/callable.js";
import { createDictionaryControllers } from "../controllers/dictionary.js";
import { createDictionaryService } from "../services/dictionary.js";
import { dictionaryStore } from "../infrastructure/dictionary/store.js";

export const dictionaryHandlers = createDictionaryControllers(
  createDictionaryService(dictionaryStore),
);
export const findWords = callable("findWords", dictionaryHandlers.findWords, {
  access: "public",
});
export const getWord = callable("getWord", dictionaryHandlers.getWord, {
  access: "public",
});
export const getWordVersion = callable(
  "getWordVersion",
  dictionaryHandlers.getWordVersion,
  { access: "public" },
);
export const findConnections = callable(
  "findConnections",
  dictionaryHandlers.findConnections,
  { access: "public" },
);
export const getPublishedDecks = callable(
  "getPublishedDecks",
  dictionaryHandlers.getPublishedDecks,
  { access: "public" },
);
