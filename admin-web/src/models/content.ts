import type { Word } from "./dictionary";
export interface Metadata {
  name: string;
  topic: string;
  description?: string;
  coverImageAssetId?: string;
}
export interface Deck extends Metadata {
  id: string;
  wordSetId?: string;
  active: boolean;
  version: number;
  publishedRevisionId?: string;
  draftRevisionId?: string;
  wordCount?: number;
  draft?: Revision;
}
export interface Revision extends Metadata {
  id: string;
  wordSetId: string;
  state: "DRAFT" | "VALIDATING" | "PUBLISHED" | "RETIRED";
  version: number;
  contentHash?: string;
}
export interface SetWord {
  wordId: string;
  wordVersion: number;
  position: number;
  focusMeaningId?: string;
  example?: string;
  exampleTranslation?: string;
  imageAssetId?: string;
  imageAlt?: string;
  spelling?: string;
  word?: Word;
}
export interface DraftEditorData {
  wordSet: Deck;
  revision: Revision;
  entries: SetWord[];
}
export interface PublishReceipt {
  wordSetId: string;
  publishedRevisionId: string;
  version: number;
}
export interface ImageAsset {
  id: string;
  assetId?: string;
  storagePath: string;
  state: string;
  checksum?: string;
  originalFileName?: string;
  url?: string;
  expiresAt?: string;
}
export interface UploadGrant {
  assetId: string;
  storagePath: string;
}
