import type { Word, WordPage } from "./dictionary";
import type {
  Metadata,
  Deck,
  DraftEditorData,
  Revision,
  SetWord,
  PublishReceipt,
  ImageAsset,
  UploadGrant,
} from "./content";
import type {
  ImportInputRow,
  ImportPreview,
  ImportReceipt,
  ImportRow,
} from "./imports";
import type { Speech, Topic, ChatLimit } from "./configuration";
import type {
  ReportStatus,
  ReportCategory,
  ReportPage,
  ContentReport,
} from "./reports";
import type { CommandStatus } from "./commands";
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
