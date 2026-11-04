import type { Actor } from "../callable.js";
import type { SourceRead } from "../../domain/dictionary/source.js";
import type { Data } from "../../shared/types.js";
import type { ConnectionsInput, StudySourceInput } from "./requests.js";

export interface SearchEntry {
  key: string;
  wordId: string;
  wordVersion: number;
}

/** Immutable lexical documents retain their existing rich entity representation. */
export interface DictionaryStore {
  resolveRelease(releaseId?: string): Promise<Data>;
  searchIndex(release: Data): Promise<SearchEntry[]>;
  readEntry(releaseId: string, wordId: string): Promise<Data | undefined>;
  readWord(wordId: string, releaseId?: string): Promise<Data>;
  readWordVersion(wordId: string, version: number): Promise<Data>;
  listPublicReleases(): Promise<string[]>;
  listConnections(input: ConnectionsInput): Promise<Data[]>;
  listActiveDecks(): Promise<Data[]>;
  assertActive(actor: Actor): Promise<void>;
  readDeckSource(source: StudySourceInput["source"]): Promise<SourceRead>;
  readPersonalSource(actor: Actor): Promise<SourceRead>;
}
