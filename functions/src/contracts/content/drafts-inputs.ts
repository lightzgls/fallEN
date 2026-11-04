import { z } from "zod";
import { empty, objectId, version } from "../../domain/values.js";
import { metadataSchema, entrySchema } from "../../contracts/content/values.js";
export const createDeckSchema = z
  .object({ metadata: metadataSchema, commandId: objectId })
  .strict();
export type CreateDeckInput = z.output<typeof createDeckSchema>;
export const openDraftSchema = z
  .object({
    wordSetId: objectId,
    expectedWordSetVersion: version,
    commandId: objectId,
  })
  .strict();
export type OpenDraftInput = z.output<typeof openDraftSchema>;
export const saveDraftSchema = z
  .object({
    wordSetId: objectId,
    revisionId: objectId,
    metadata: metadataSchema,
    entries: z.array(entrySchema).max(1000),
    expectedVersion: version,
    commandId: objectId,
  })
  .strict();
export type SaveDraftInput = z.output<typeof saveDraftSchema>;
export const setDeckActiveSchema = z
  .object({
    wordSetId: objectId,
    active: z.boolean(),
    expectedVersion: version,
    commandId: objectId,
  })
  .strict();
export type SetDeckActiveInput = z.output<typeof setDeckActiveSchema>;
export const listDecksSchema = empty;
export type ListDecksInput = z.output<typeof listDecksSchema>;
export const getDraftSchema = z.object({ wordSetId: objectId }).strict();
export type GetDraftInput = z.output<typeof getDraftSchema>;
