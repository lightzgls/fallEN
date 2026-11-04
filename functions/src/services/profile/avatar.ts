import { prepareAvatarImage } from "../../infrastructure/profile/avatar-image.js";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  assertActive,
  command,
  commandId,
  db,
  fail,
  id,
  identifier,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";

export async function beginAvatarUpload(
  actor: Actor,
  raw: unknown,
): Promise<Data> {
  const input = parse(
    z
      .object({
        commandId,
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        sizeBytes: z
          .number()
          .int()
          .min(1)
          .max(5 * 1024 * 1024),
      })
      .strict(),
    raw,
  );
  const assetId = id();
  return command(actor, "beginAvatarUpload", input, async (tx, now) => {
    const stagingPath = `avatars/${actor.uid}/staging/${assetId}`;
    tx.create(db.doc(`users/${actor.uid}/profileAssets/${assetId}`), {
      assetId,
      ownerUid: actor.uid,
      stagingPath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      state: "STAGING",
      createdAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 3600_000),
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
  raw: unknown,
): Promise<Data> {
  const input = parse(z.object({ assetId: identifier }).strict(), raw);
  await assertActive(actor);
  const ref = db.doc(`users/${actor.uid}/profileAssets/${input.assetId}`),
    asset = requireDoc(await ref.get());
  if (asset.ownerUid !== actor.uid) fail("PERMISSION_DENIED");
  if (["READY", "ACTIVE"].includes(asset.state)) return asset;
  if (asset.state !== "STAGING" || asset.expiresAt.toMillis() < Date.now())
    fail("AVATAR_UNAVAILABLE");
  const image = await prepareAvatarImage(actor.uid, input.assetId, {
    stagingPath: asset.stagingPath,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
  });
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const current = requireDoc(await tx.get(ref));
    if (["READY", "ACTIVE"].includes(current.state)) return current;
    if (
      current.state !== "STAGING" ||
      current.expiresAt?.toMillis() <= Date.now() ||
      current.cleanupLeaseUntil?.toMillis() > Date.now()
    )
      fail("AVATAR_UNAVAILABLE");
    const ready = {
      ...current,
      state: "READY",
      storagePath: image.storagePath,
      width: 512,
      height: 512,
      contentHash: image.contentHash,
      normalizedBytes: image.normalizedBytes,
    };
    tx.set(ref, ready);
    return ready;
  });
}
