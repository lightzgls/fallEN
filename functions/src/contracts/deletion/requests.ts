import { z } from "zod";
import { commandId, identifier } from "../../shared/validation.js";
export const requestDeletionSchema = z
  .object({ commandId, statusTokenHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const deletionStatusSchema = z
  .object({
    jobId: identifier,
    statusToken: z
      .string()
      .min(43)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();
export type RequestDeletionInput = z.output<typeof requestDeletionSchema>;
export type DeletionStatusInput = z.output<typeof deletionStatusSchema>;
