import { z } from "zod";
import { objectId, version } from "../../domain/values.js";

export const publishSetSchema = z
  .object({
    wordSetId: objectId,
    revisionId: objectId,
    expectedWordSetVersion: version,
    expectedDraftVersion: version,
    commandId: objectId,
  })
  .strict();
export type PublishSetInput = z.output<typeof publishSetSchema>;
