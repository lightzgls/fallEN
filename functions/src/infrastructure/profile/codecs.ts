import { z } from "zod";
import { parse } from "../../shared/validation.js";
import { plainValue } from "../firebase/records.js";

const gate = z
  .object({
    status: z.string(),
    version: z.number(),
    deletionJobId: z.string().optional(),
  })
  .passthrough();
const profile = z
  .object({
    uid: z.string(),
    displayName: z.string(),
    avatarMode: z.enum(["DEFAULT", "PROVIDER", "CUSTOM"]),
    profileVersion: z.number(),
    avatarAssetId: z.string().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .passthrough();
const asset = z
  .object({
    assetId: z.string(),
    ownerUid: z.string(),
    state: z.string(),
    stagingPath: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    expiresAt: z.date().nullable(),
    cleanupLeaseUntil: z.date().optional(),
    storagePath: z.string().optional(),
  })
  .passthrough();
export const decodeGate = (value: unknown) => parse(gate, plainValue(value));
export const decodeProfile = (value: unknown) =>
  parse(profile, plainValue(value));
export const decodeAsset = (value: unknown) => parse(asset, plainValue(value));
