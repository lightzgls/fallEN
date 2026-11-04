import type { Actor } from "../../contracts/callable.js";
import type {
  BeginAvatarInput,
  FinalizeAvatarInput,
} from "../../contracts/profile/requests.js";
import type {
  AvatarAsset,
  ProfileStore,
} from "../../contracts/profile/store.js";
import { fail } from "../../shared/errors.js";
import { id } from "../../shared/values.js";

export async function beginAvatarUpload(
  actor: Actor,
  input: BeginAvatarInput,
  store: ProfileStore,
) {
  const assetId = id();
  return store.command(actor, "beginAvatarUpload", input, async (tx) => {
    const stagingPath = `avatars/${actor.uid}/staging/${assetId}`;
    tx.createAsset({
      assetId,
      ownerUid: actor.uid,
      stagingPath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      state: "STAGING",
      createdAt: tx.now,
      expiresAt: new Date(tx.now.getTime() + 24 * 3600_000),
    });
    return {
      assetId,
      stagingPath,
      storagePath: stagingPath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    };
  });
}
export async function finalizeAvatar(
  actor: Actor,
  input: FinalizeAvatarInput,
  store: ProfileStore,
) {
  await store.assertActive(actor);
  const asset = await store.readAsset(actor, input.assetId);
  if (asset.ownerUid !== actor.uid) fail("PERMISSION_DENIED");
  if (["READY", "ACTIVE"].includes(asset.state)) return asset;
  if (
    asset.state !== "STAGING" ||
    (asset.expiresAt?.getTime() ?? 0) < store.now().getTime()
  )
    fail("AVATAR_UNAVAILABLE");
  // Decoding and Storage writes run once outside a transaction that Firestore may retry.
  const image = await store.prepareImage(actor.uid, input.assetId, asset);
  return store.transaction(actor, true, async (tx) => {
    const current = (await tx.readAsset(input.assetId)) ?? fail("NOT_FOUND");
    if (["READY", "ACTIVE"].includes(current.state)) return current;
    const now = store.now().getTime();
    if (
      current.state !== "STAGING" ||
      (current.expiresAt?.getTime() ?? 0) <= now ||
      (current.cleanupLeaseUntil?.getTime() ?? 0) > now
    )
      fail("AVATAR_UNAVAILABLE");
    const ready: AvatarAsset = {
      ...current,
      state: "READY",
      storagePath: image.storagePath,
      width: 512,
      height: 512,
      contentHash: image.contentHash,
      normalizedBytes: image.normalizedBytes,
    };
    tx.saveAsset(ready);
    return ready;
  });
}
