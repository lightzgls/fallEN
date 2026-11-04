import type { Actor } from "../callable.js";
import type { Data } from "../../shared/types.js";
import type {
  AssetRecord,
  BatchRecord,
  CommandRecord,
  DeckRecord,
  ExactKey,
  ImportInputRow,
  ImportRowRecord,
  LimitRecord,
  RecordData,
  ReleaseEntry,
  ReleaseRecord,
  RevisionRecord,
  SetWordRecord,
  SpeechRecord,
  TopicRecord,
} from "./records.js";
export type WriteMode = "create" | "replace" | "patch";
export interface ContentReader {
  deck(id: string): Promise<DeckRecord | undefined>;
  decks(): Promise<DeckRecord[]>;
  revision(deckId: string, id: string): Promise<RevisionRecord | undefined>;
  entries(deckId: string, revisionId: string): Promise<SetWordRecord[]>;
  asset(id: string): Promise<AssetRecord | undefined>;
  batch(id: string): Promise<BatchRecord | undefined>;
  batches(deckId: string): Promise<BatchRecord[]>;
  rows(importId: string): Promise<ImportRowRecord[]>;
  row(importId: string, id: string): Promise<ImportRowRecord | undefined>;
  applyingImports(deckId: string, revisionId: string): Promise<BatchRecord[]>;
  processedCommand(uid: string, id: string): Promise<CommandRecord | undefined>;
  release(releaseId?: string): Promise<ReleaseRecord>;
  imageRevision(
    deckId: string,
    id: string,
  ): Promise<{ state: string; coverImageAssetId?: string } | undefined>;
  imageRelease(id: string): Promise<ReleaseRecord | undefined>;
  activeReleaseId(): Promise<string | undefined>;
  releaseEntry(
    releaseId: string,
    wordId: string,
  ): Promise<ReleaseEntry | undefined>;
  exactKey(releaseId: string, key: string): Promise<ExactKey | undefined>;
  wordVersion(wordId: string, version: number): Promise<Data>;
  speech(wordId: string): Promise<SpeechRecord | undefined>;
  topic(id: string): Promise<TopicRecord | undefined>;
  topics(): Promise<TopicRecord[]>;
  limit(): Promise<LimitRecord | undefined>;
}
export interface ContentTransaction extends ContentReader {
  stageDeck(
    id: string,
    data: RecordData,
    mode: WriteMode,
    remove?: string[],
  ): void;
  stageRevision(
    deckId: string,
    id: string,
    data: RecordData,
    mode: WriteMode,
    remove?: string[],
  ): void;
  stageEntry(
    deckId: string,
    revisionId: string,
    wordId: string,
    data: RecordData,
    mode: WriteMode,
  ): void;
  removeEntry(deckId: string, revisionId: string, wordId: string): void;
  stageBatch(id: string, data: RecordData, mode: WriteMode): void;
  stageRow(
    importId: string,
    id: string,
    data: RecordData,
    mode: WriteMode,
  ): void;
  stageAsset(id: string, data: RecordData, mode: WriteMode): void;
  stageSpeech(wordId: string, speech: SpeechRecord): void;
  stageTopic(id: string, data: RecordData): void;
  stageLimit(data: LimitRecord): void;
  stageCommand(
    uid: string,
    id: string,
    data: RecordData,
    mode: WriteMode,
    remove?: string[],
  ): void;
}
export interface ContentStore extends ContentReader {
  active(actor: Actor): Promise<void>;
  transaction<T extends RecordData>(
    actor: Actor,
    work: (tx: ContentTransaction, now: Date) => Promise<T>,
    checkActive?: boolean,
  ): Promise<T>;
  command(
    actor: Actor,
    kind: string,
    input: RecordData,
    work: (tx: ContentTransaction, now: Date) => Promise<RecordData>,
  ): Promise<RecordData>;
  inspectUpload(asset: AssetRecord): Promise<RecordData>;
  importFile(asset: AssetRecord): Promise<ImportInputRow[]>;
  imageUrl(path: string): Promise<{ url: string; expiresAt: string }>;
}
