import { z } from "zod";
import { objectId, stableId } from "../../domain/backend.js";
import { resolveImageAsset } from "../../infrastructure/asset-resolver.js";
import { inspectContentUpload } from "../../infrastructure/content-assets.js";
import {
  assertActive,
  assertAdmin,
  command,
  db,
  fail,
  parse,
  requireDoc,
  type Actor,
} from "../../shared/core.js";
import { admin } from "./access.js";

export async function beginContentUpload(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
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
      .strict(),
    raw,
  );
  if (/[\\/\x00]/.test(req.fileName))
    fail("VALIDATION_FAILED", "File name cannot contain a path");
  const allowed =
    req.kind === "IMAGE"
      ? ["image/jpeg", "image/png", "image/webp"]
      : [
          "text/csv",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ];
  if (!allowed.includes(req.contentType))
    fail("VALIDATION_FAILED", "Unsupported file type");
  const assetId = stableId(actor.uid, "asset", req.commandId);
  return command(actor, "beginContentUpload", req, async (tx, now) => {
    const asset = {
      id: assetId,
      assetId,
      storagePath: `content/${actor.uid}/${assetId}`,
      contentType: req.contentType,
      byteSize: req.byteSize,
      originalFileName: req.fileName,
      kind: req.kind,
      state: "UPLOADED",
      createdBy: actor.uid,
      createdAt: now,
    };
    tx.create(db.doc(`imageAssets/${assetId}`), asset);
    return { assetId, storagePath: asset.storagePath };
  });
}

export async function finalizeContentUpload(actor: Actor, raw: unknown) {
  const req = parse(z.object({ assetId: objectId }).strict(), raw);
  await admin(actor);
  const ref = db.doc(`imageAssets/${req.assetId}`);
  const asset = requireDoc(await ref.get());
  if (asset.createdBy !== actor.uid) fail("PERMISSION_DENIED");
  if (asset.state === "VALIDATED") return asset;
  if (asset.state !== "UPLOADED") fail("VALIDATION_FAILED");
  const verified = await inspectContentUpload(asset);
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const current = requireDoc(await tx.get(ref));
    if (current.state === "VALIDATED") return current;
    if (current.state !== "UPLOADED" || current.createdBy !== actor.uid)
      fail("CONFLICT");
    const updated = { ...current, ...verified, state: "VALIDATED" };
    tx.set(ref, updated);
    return updated;
  });
}

export async function getImageAsset(actor: Actor, raw: unknown) {
  const req = parse(
    z
      .object({
        assetId: objectId,
        wordSetId: objectId.optional(),
        revisionId: objectId.optional(),
        wordId: objectId.optional(),
        wordVersion: z.number().int().positive().optional(),
        releaseId: objectId.optional(),
      })
      .strict(),
    raw,
  );
  return resolveImageAsset(actor, req);
}
