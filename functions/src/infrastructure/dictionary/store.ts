import type { DictionaryStore } from "../../contracts/dictionary/store.js";
import { db } from "../firebase/runtime.js";
import { assertActive } from "../firebase/access.js";
import {
  read,
  readWord,
  readWordVersion,
  resolveRelease,
} from "./word-reader.js";
import { readDeckSource, readPersonalSource } from "./source-reader.js";
import { searchIndex } from "./search-index.js";

export const dictionaryStore: DictionaryStore = {
  resolveRelease,
  searchIndex,
  readWord,
  readWordVersion,
  assertActive,
  readDeckSource,
  readPersonalSource,
  async readEntry(releaseId, wordId) {
    return (
      await read(`dictionaryReleases/${releaseId}/entries/${wordId}`)
    ).data();
  },
  async listPublicReleases() {
    const page = await db
      .collection("dictionaryReleases")
      .where("state", "in", ["PUBLISHED", "RETIRED"])
      .get();
    return page.docs.map((doc) => doc.id);
  },
  async listConnections(input) {
    const page = await db
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
    return page.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  },
  async listActiveDecks() {
    const page = await db
      .collection("systemDecks")
      .where("active", "==", true)
      .get();
    return page.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  },
};
