export interface Meaning {
  id: string;
  partOfSpeech: string;
  text: string;
  example?: string;
  exampleTranslation?: string;
  imageAssetId?: string;
  imageAlt?: string;
}
export interface Word {
  wordId: string;
  id?: string;
  wordVersion: number;
  version?: number;
  spelling: string;
  phonetic?: string;
  meanings: Meaning[];
  releaseId?: string;
  matchType?: string;
}
export interface WordPage {
  items: Word[];
  releaseId: string;
  cursor?: string;
}
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
export interface ImportInputRow {
  word: string;
  partOfSpeech?: string;
  focusMeaningId?: string;
  example?: string;
  exampleTranslation?: string;
  position?: number;
  imageAssetId?: string;
  imageAlt?: string;
}
export interface ImportRow {
  id: string;
  rowNumber: number;
  rawWord: string;
  normalizedKey?: string;
  resolvedWordId?: string;
  wordVersion?: number;
  focusMeaningId?: string;
  status: string;
  operation?: "ADD" | "UPDATE" | "SKIP";
  errors: string[];
  meaningCandidates?: Meaning[];
  imageAssetId?: string;
}
export interface ImportPreview {
  importId: string;
  releaseId: string;
  draftVersion: number;
  fingerprint: string;
  status?: string;
  rows: ImportRow[];
  counts: Record<string, number>;
}
export interface ImportReceipt {
  importId: string;
  appliedRowIds: string[];
  skippedRowIds: string[];
  errors: unknown[];
  draftVersion: number;
}
export interface Speech {
  provider: "ANDROID_TTS";
  text: string;
  listenAllowed: boolean;
  version: number;
}
export interface Topic {
  id: string;
  name: string;
  context: string;
  learnerRole: string;
  aiRole: string;
  goal: string;
  openingLine: string;
  guide: string;
  active: boolean;
  version: number;
}
export interface ChatLimit {
  maxSessionsPerDay: number;
  version: number;
}
export type ReportStatus =
  "OPEN" | "IN_REVIEW" | "WAITING_RELEASE" | "RESOLVED" | "REJECTED";
export type ReportCategory =
  "MEANING" | "EXAMPLE_TRANSLATION" | "IMAGE" | "PRONUNCIATION" | "OTHER";
export interface TargetRef {
  type: "WORD" | "SET_WORD" | "SPEECH";
  wordId: string;
  wordVersion?: number;
  releaseId?: string;
  wordSetId?: string;
  revisionId?: string;
  meaningId?: string;
  speechVersion?: number;
}
export interface ContentReport {
  reportId: string;
  id?: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  version: number;
  targetRef: TargetRef;
  targetSnapshot: Record<string, unknown>;
  publicResolution?: string;
  resolutionKind?: string;
  resolutionRef?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  actions?: ReportAction[];
}
export interface ReportAction {
  actionId: string;
  fromStatus: ReportStatus;
  toStatus: ReportStatus;
  note?: string;
  createdAt: string;
}
export interface ReportPage {
  items: ContentReport[];
  cursor?: string;
}
export interface CommandStatus<T = unknown> {
  status: "ABSENT" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  receipt?: T;
  error?: { code?: string; message?: string };
  progress?: unknown;
}
export interface ApiMap {
  getAccess: {
    input: Record<string, never>;
    output: { uid: string; roles: string[] };
  };
  ensureProfile: { input: { displayName?: string }; output: unknown };
  listDecks: { input: Record<string, never>; output: { items: Deck[] } };
  createDeck: {
    input: { metadata: Metadata; commandId: string };
    output: DraftEditorData;
  };
  getDraft: { input: { wordSetId: string }; output: DraftEditorData };
  openDraft: {
    input: {
      wordSetId: string;
      expectedWordSetVersion: number;
      commandId: string;
    };
    output: DraftEditorData;
  };
  saveDraft: {
    input: {
      wordSetId: string;
      revisionId: string;
      metadata: Metadata;
      entries: SetWord[];
      expectedVersion: number;
      commandId: string;
    };
    output: Revision;
  };
  publishSet: {
    input: {
      wordSetId: string;
      revisionId: string;
      expectedWordSetVersion: number;
      expectedDraftVersion: number;
      commandId: string;
    };
    output: PublishReceipt | CommandStatus<PublishReceipt>;
  };
  setDeckActive: {
    input: {
      wordSetId: string;
      active: boolean;
      expectedVersion: number;
      commandId: string;
    };
    output: Deck;
  };
  findWords: {
    input: {
      query: string;
      partOfSpeech?: string;
      cursor?: string;
      releaseId?: string;
      pageSize?: number;
    };
    output: WordPage;
  };
  getWord: { input: { wordId: string; releaseId?: string }; output: Word };
  getWordVersion: {
    input: { wordId: string; wordVersion: number };
    output: Word;
  };
  getImageAsset: { input: { assetId: string }; output: ImageAsset };
  previewImport: {
    input: {
      wordSetId: string;
      revisionId: string;
      sourceFileId?: string;
      pastedRows?: ImportInputRow[];
      assetIds: string[];
      expectedDraftVersion: number;
      commandId: string;
    };
    output: ImportPreview;
  };
  applyImport: {
    input: {
      importId: string;
      selectedRowIds: string[];
      skippedRowIds: string[];
      duplicateChoices: Record<string, "ADD" | "UPDATE" | "SKIP">;
      expectedDraftVersion: number;
      fingerprint: string;
      commandId: string;
    };
    output: ImportReceipt | CommandStatus<ImportReceipt>;
  };
  resolveImportRow: {
    input: {
      importId: string;
      rowId: string;
      wordId: string;
      focusMeaningId?: string;
      expectedDraftVersion: number;
      commandId: string;
    };
    output: ImportRow;
  };
  getImport: { input: { importId: string }; output: ImportPreview };
  listImports: {
    input: { wordSetId: string };
    output: { items: ImportPreview[] };
  };
  beginContentUpload: {
    input: {
      fileName: string;
      contentType: string;
      byteSize: number;
      kind: "IMAGE" | "IMPORT";
      commandId: string;
    };
    output: UploadGrant;
  };
  finalizeContentUpload: { input: { assetId: string }; output: ImageAsset };
  getSpeech: { input: { wordId: string }; output: Speech };
  saveSpeech: {
    input: {
      wordId: string;
      listenAllowed: boolean;
      expectedVersion: number;
      commandId: string;
    };
    output: Speech;
  };
  listTopics: { input: Record<string, never>; output: { items: Topic[] } };
  getTopic: { input: { topicId: string }; output: Topic };
  saveTopic: {
    input: Omit<Topic, "id" | "version"> & {
      topicId?: string;
      expectedVersion: number;
      commandId: string;
    };
    output: Topic;
  };
  getLimit: { input: Record<string, never>; output: ChatLimit };
  saveLimit: {
    input: {
      maxSessionsPerDay: number;
      expectedVersion: number;
      commandId: string;
    };
    output: ChatLimit;
  };
  listReports: {
    input: {
      status?: ReportStatus;
      category?: ReportCategory;
      cursor?: string;
    };
    output: ReportPage;
  };
  getReport: { input: { reportId: string }; output: ContentReport };
  updateReportStatus: {
    input: {
      reportId: string;
      expectedVersion: number;
      newStatus: ReportStatus;
      publicNote?: string;
      resolutionKind?: string;
      resolutionRef?: Record<string, unknown>;
      commandId: string;
    };
    output: { report: ContentReport };
  };
  getCommandStatus: { input: { commandId: string }; output: CommandStatus };
}
