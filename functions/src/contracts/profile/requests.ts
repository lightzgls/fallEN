import { z } from "zod";
import {
  commandId,
  empty,
  identifier,
  version,
} from "../../shared/validation.js";
export { empty };
export const avatarMode = z.enum(["DEFAULT", "PROVIDER", "CUSTOM"]);
export const ensureProfileSchema = z
  .object({ displayName: z.string().trim().min(1).max(50).optional() })
  .strict();
export const saveProfileSchema = z
  .object({
    commandId,
    expectedProfileVersion: version,
    displayName: z.string().trim().min(1).max(50),
    avatarMode,
    avatarAssetId: identifier.optional(),
  })
  .strict();
export const beginAvatarSchema = z
  .object({
    commandId,
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(5 * 1024 * 1024),
  })
  .strict();
export const finalizeAvatarSchema = z.object({ assetId: identifier }).strict();
export type EnsureProfileInput = z.output<typeof ensureProfileSchema>;
export type SaveProfileInput = z.output<typeof saveProfileSchema>;
export type BeginAvatarInput = z.output<typeof beginAvatarSchema>;
export type FinalizeAvatarInput = z.output<typeof finalizeAvatarSchema>;
