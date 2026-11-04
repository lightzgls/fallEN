import type { Meaning } from "./dictionary";
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
