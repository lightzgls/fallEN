import { z } from "zod";
import {
  entrySchema,
  metadataSchema,
  rowSchema,
} from "../../contracts/content/values.js";
export type RecordData = Record<string, unknown>;
export type Metadata = z.infer<typeof metadataSchema>;
export type SetWord = z.infer<typeof entrySchema>;
export type ImportInputRow = z.infer<typeof rowSchema>;
export const deckRecord = z
  .object({
    id: z.string(),
    active: z.boolean(),
    version: z.number(),
    draftRevisionId: z.string().optional(),
    publishedRevisionId: z.string().optional(),
    createdAt: z.date().optional(),
  })
  .passthrough();
export const revisionRecord = metadataSchema
  .extend({
    id: z.string(),
    wordSetId: z.string(),
    state: z.string(),
    version: z.number(),
    createdBy: z.string(),
    createdAt: z.date(),
    updatedAt: z.date().optional(),
    publishCommandId: z.string().optional(),
    publishActorUid: z.string().optional(),
  })
  .passthrough();
export const setWordRecord = entrySchema
  .safeExtend({
    wordSetId: z.string().optional(),
    revisionId: z.string().optional(),
  })
  .passthrough();
export const assetRecord = z
  .object({
    id: z.string().optional(),
    assetId: z.string().optional(),
    storagePath: z.string(),
    contentType: z.string(),
    byteSize: z.number(),
    state: z.string(),
    kind: z.string().optional(),
    createdBy: z.string().optional(),
    checksum: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .passthrough();
export const importRowRecord = z
  .object({
    id: z.string(),
    rowNumber: z.number(),
    rawWord: z.string(),
    normalizedKey: z.string(),
    input: rowSchema,
    status: z.string(),
    operation: z.enum(["ADD", "UPDATE", "SKIP"]),
    errors: z.array(z.string()),
    resolvedWordId: z.string().optional(),
    wordVersion: z.number().optional(),
    focusMeaningId: z.string().optional(),
    meaningCandidates: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();
export const batchRecord = z
  .object({
    id: z.string(),
    importId: z.string(),
    wordSetId: z.string(),
    revisionId: z.string(),
    createdBy: z.string(),
    releaseId: z.string(),
    expectedDraftVersion: z.number(),
    draftVersion: z.number(),
    progressDraftVersion: z.number(),
    inputHash: z.string(),
    fingerprint: z.string(),
    status: z.string(),
    createdAt: z.date(),
    selectedRowIds: z.array(z.string()),
    skippedRowIds: z.array(z.string()),
    duplicateChoices: z
      .record(z.string(), z.enum(["ADD", "UPDATE", "SKIP"]))
      .optional(),
    applyCommandId: z.string().optional(),
    applyActorUid: z.string().optional(),
    counts: z.record(z.string(), z.number()),
  })
  .passthrough();
export const commandRecord = z
  .object({
    kind: z.string(),
    requestHash: z.string(),
    status: z.string(),
    receipt: z.record(z.string(), z.unknown()).optional(),
    error: z.object({ code: z.string().optional() }).passthrough().optional(),
    request: z
      .object({
        expectedWordSetVersion: z.number(),
        expectedDraftVersion: z.number(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export const speechRecord = z
  .object({
    provider: z.string(),
    text: z.string(),
    listenAllowed: z.boolean(),
    version: z.number(),
  })
  .passthrough();
export const topicRecord = z
  .object({
    id: z.string(),
    name: z.string(),
    context: z.string(),
    learnerRole: z.string(),
    aiRole: z.string(),
    goal: z.string(),
    openingLine: z.string(),
    guide: z.string(),
    active: z.boolean(),
    version: z.number(),
  })
  .passthrough();
export const limitRecord = z
  .object({ maxSessionsPerDay: z.number(), version: z.number() })
  .passthrough();
export interface ReleaseRecord {
  id: string;
  state: string;
}
export interface ReleaseEntry {
  wordVersion: number;
  active: boolean;
}
export interface ExactKey {
  normalizedKey: string;
  wordId: string;
  wordVersion: number;
}
export type DeckRecord = z.infer<typeof deckRecord>;
export type RevisionRecord = z.infer<typeof revisionRecord>;
export type SetWordRecord = z.infer<typeof setWordRecord>;
export type AssetRecord = z.infer<typeof assetRecord>;
export type ImportRowRecord = z.infer<typeof importRowRecord>;
export type BatchRecord = z.infer<typeof batchRecord>;
export type CommandRecord = z.infer<typeof commandRecord>;
export type SpeechRecord = z.infer<typeof speechRecord>;
export type TopicRecord = z.infer<typeof topicRecord>;
export type LimitRecord = z.infer<typeof limitRecord>;
