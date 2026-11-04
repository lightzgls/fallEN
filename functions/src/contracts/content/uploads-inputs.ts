import { z } from "zod";
import { objectId } from "../../domain/values.js";

export const beginContentUploadSchema = z
  .object({
    fileName: z.string().min(1).max(200),
    contentType: z.string().min(1).max(100),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),
    kind: z.enum(["IMAGE", "IMPORT"]),
    commandId: objectId,
  })
  .strict();
export type BeginContentUploadInput = z.output<typeof beginContentUploadSchema>;
export const finalizeContentUploadSchema = z
  .object({ assetId: objectId })
  .strict();
export type FinalizeContentUploadInput = z.output<
  typeof finalizeContentUploadSchema
>;
export const getImageAssetSchema = z
  .object({
    assetId: objectId,
    wordSetId: objectId.optional(),
    revisionId: objectId.optional(),
    wordId: objectId.optional(),
    wordVersion: z.number().int().positive().optional(),
    releaseId: objectId.optional(),
  })
  .strict();
export type GetImageAssetInput = z.output<typeof getImageAssetSchema>;
