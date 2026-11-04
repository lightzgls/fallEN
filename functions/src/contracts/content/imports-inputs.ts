import { z } from "zod";
import { objectId, version } from "../../domain/values.js";
import { rowSchema } from "../../contracts/content/values.js";
export const previewImportSchema = z
  .object({
    wordSetId: objectId,
    revisionId: objectId,
    sourceFileId: objectId.optional(),
    pastedRows: z.array(rowSchema).max(1000).optional(),
    assetIds: z.array(objectId).max(1000),
    expectedDraftVersion: version,
    commandId: objectId,
  })
  .strict()
  .refine(
    (r) => !!r.sourceFileId !== !!r.pastedRows?.length,
    "Use either a file or pasted rows",
  );
export type PreviewImportInput = z.output<typeof previewImportSchema>;
export const resolveImportRowSchema = z
  .object({
    importId: objectId,
    rowId: objectId,
    wordId: objectId,
    focusMeaningId: objectId.optional(),
    expectedDraftVersion: version,
    commandId: objectId,
  })
  .strict();
export type ResolveImportRowInput = z.output<typeof resolveImportRowSchema>;
export const applyImportSchema = z
  .object({
    importId: objectId,
    selectedRowIds: z.array(objectId).max(1000),
    skippedRowIds: z.array(objectId).max(1000),
    duplicateChoices: z.record(objectId, z.enum(["ADD", "UPDATE", "SKIP"])),
    expectedDraftVersion: version,
    fingerprint: z.string().min(1).max(128),
    commandId: objectId,
  })
  .strict();
export type ApplyImportInput = z.output<typeof applyImportSchema>;
export const getImportSchema = z.object({ importId: objectId }).strict();
export type GetImportInput = z.output<typeof getImportSchema>;
export const listImportsSchema = z.object({ wordSetId: objectId }).strict();
export type ListImportsInput = z.output<typeof listImportsSchema>;
