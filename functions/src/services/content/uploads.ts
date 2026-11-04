import type { Actor } from "../../contracts/callable.js";
import type { UploadStore } from "../../contracts/content/ports.js";
import type {
  BeginContentUploadInput,
  FinalizeContentUploadInput,
  GetImageAssetInput,
} from "../../contracts/content/uploads-inputs.js";
import { stableId } from "../../domain/values.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
import { verifyImageReference } from "./image-access.js";
export function createUploadOperations(store: UploadStore) {
  return {
    beginContentUpload: async (actor: Actor, req: BeginContentUploadInput) => {
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
      return store.command(
        actor,
        "beginContentUpload",
        req,
        async (tx, now) => {
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
          tx.stageAsset(assetId, asset, "create");
          return { assetId, storagePath: asset.storagePath };
        },
      );
    },
    finalizeContentUpload: async (
      actor: Actor,
      req: FinalizeContentUploadInput,
    ) => {
      await store.active(actor);
      const asset = required(await store.asset(req.assetId));
      if (asset.createdBy !== actor.uid) fail("PERMISSION_DENIED");
      if (asset.state === "VALIDATED") return asset;
      if (asset.state !== "UPLOADED") fail("VALIDATION_FAILED");
      const verified = await store.inspectUpload(asset);
      return store.transaction(actor, async (tx) => {
        const current = required(await tx.asset(req.assetId));
        if (current.state === "VALIDATED") return current;
        if (current.state !== "UPLOADED" || current.createdBy !== actor.uid)
          fail("CONFLICT");
        const updated = { ...current, ...verified, state: "VALIDATED" };
        tx.stageAsset(req.assetId, updated, "replace");
        return updated;
      });
    },
    getImageAsset: async (actor: Actor, req: GetImageAssetInput) => {
      await store.active(actor);
      if (!actor.contentAdmin) await verifyImageReference(store, req);
      const asset = required(await store.asset(req.assetId));
      if (
        actor.contentAdmin &&
        (asset.state !== "VALIDATED" || asset.kind === "IMPORT")
      )
        return asset;
      if (
        asset.state !== "VALIDATED" ||
        (asset.kind && asset.kind !== "IMAGE") ||
        !["image/jpeg", "image/png", "image/webp"].includes(
          asset.contentType,
        ) ||
        asset.byteSize <= 0 ||
        !asset.checksum
      )
        fail("VALIDATION_FAILED");
      const grant = await store.imageUrl(asset.storagePath);
      await store.active(actor);
      if (actor.contentAdmin) return { ...asset, ...grant };
      return {
        id: req.assetId,
        assetId: req.assetId,
        state: asset.state,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        checksum: asset.checksum,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
        ...grant,
      };
    },
  };
}
