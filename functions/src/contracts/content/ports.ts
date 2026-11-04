import type { Actor } from "../callable.js";
import type {
  ContentReader,
  ContentStore,
  ContentTransaction,
} from "./store.js";
import type { RecordData } from "./records.js";
type CommandPort<Tx> = {
  command(
    actor: Actor,
    kind: string,
    input: RecordData,
    work: (tx: Tx, now: Date) => Promise<RecordData>,
  ): Promise<RecordData>;
};
type TransactionPort<Tx> = {
  transaction<T extends RecordData>(
    actor: Actor,
    work: (tx: Tx, now: Date) => Promise<T>,
    checkActive?: boolean,
  ): Promise<T>;
};
export type MaterialReader = Pick<ContentReader, "asset" | "wordVersion">;
export type DraftTransaction = MaterialReader &
  Pick<
    ContentTransaction,
    | "deck"
    | "revision"
    | "entries"
    | "applyingImports"
    | "stageDeck"
    | "stageRevision"
    | "stageEntry"
    | "removeEntry"
  >;
export type DraftStore = CommandPort<DraftTransaction>;
export type DeckQueryStore = Pick<
  ContentStore,
  "active" | "deck" | "decks" | "revision" | "entries"
>;
export type ConfigurationTransaction = Pick<
  ContentTransaction,
  | "release"
  | "releaseEntry"
  | "wordVersion"
  | "speech"
  | "topic"
  | "limit"
  | "stageSpeech"
  | "stageTopic"
  | "stageLimit"
>;
export type ConfigurationStore = CommandPort<ConfigurationTransaction> &
  Pick<ContentStore, "active" | "speech" | "topics" | "topic" | "limit">;
export type PublicationTransaction = Pick<
  ContentTransaction,
  | "processedCommand"
  | "deck"
  | "revision"
  | "applyingImports"
  | "stageRevision"
  | "stageDeck"
  | "stageCommand"
>;
export type PublicationStore = MaterialReader &
  TransactionPort<PublicationTransaction> &
  Pick<ContentStore, "active" | "processedCommand" | "revision" | "entries">;
export type ImportMatchingReader = Pick<
  ContentReader,
  "exactKey" | "releaseEntry" | "wordVersion"
>;
export type ImportPreviewTransaction = MaterialReader &
  ImportMatchingReader &
  Pick<
    ContentTransaction,
    | "deck"
    | "revision"
    | "entries"
    | "release"
    | "batch"
    | "row"
    | "stageBatch"
    | "stageRow"
  >;
export type ImportPreviewStore = CommandPort<ImportPreviewTransaction> &
  Pick<ContentStore, "active" | "asset" | "importFile">;
export type ImportApplicationTransaction = MaterialReader &
  Pick<
    ContentTransaction,
    | "processedCommand"
    | "batch"
    | "row"
    | "rows"
    | "revision"
    | "release"
    | "entries"
    | "stageBatch"
    | "stageRow"
    | "stageEntry"
    | "stageRevision"
    | "stageCommand"
  >;
export type ImportApplicationStore =
  TransactionPort<ImportApplicationTransaction> & Pick<ContentStore, "rows">;
export type ImportQueryStore = Pick<
  ContentStore,
  "active" | "batch" | "batches" | "rows"
>;
export type ImageReferenceReader = Pick<
  ContentReader,
  | "deck"
  | "imageRevision"
  | "entries"
  | "imageRelease"
  | "activeReleaseId"
  | "releaseEntry"
  | "wordVersion"
>;
export type UploadTransaction = Pick<
  ContentTransaction,
  "asset" | "stageAsset"
>;
export type UploadStore = ImageReferenceReader &
  CommandPort<UploadTransaction> &
  TransactionPort<UploadTransaction> &
  Pick<ContentStore, "active" | "asset" | "inspectUpload" | "imageUrl">;
