import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { z } from "zod";
import {
  db,
  bucket,
  type Actor,
  type Data,
  id,
  hash,
  parse,
  identifier,
  version,
  commandId,
  empty,
  fail,
  command,
  assertActive,
  requireDoc,
  checkVersion,
} from "../shared/core.js";

const avatarMode = z.enum(["DEFAULT", "PROVIDER", "CUSTOM"]);
export async function ensureProfile(actor: Actor, raw: unknown): Promise<Data> {
  const input = parse(
    z
      .object({ displayName: z.string().trim().min(1).max(50).optional() })
      .strict(),
    raw,
  );
  const authUser = await getAuth().getUser(actor.uid);
  if (authUser.disabled) fail("UNAUTHENTICATED");
  return db.runTransaction(async (tx) => {
    const gateRef = db.doc(`accountStates/${actor.uid}`),
      userRef = db.doc(`users/${actor.uid}`);
    const [gate, user] = await Promise.all([tx.get(gateRef), tx.get(userRef)]);
    if (gate.data()?.status === "DELETING") fail("ACCOUNT_DELETING");
    if (user.exists && gate.data()?.status === "ACTIVE") return user.data()!;
    if (gate.exists && !user.exists) fail("PROFILE_PENDING");
    const now = Timestamp.now();
    const providerName = authUser.displayName?.trim();
    const displayName =
      input.displayName ??
      (providerName && providerName.length <= 50 ? providerName : "Người học");
    const profile = {
      uid: actor.uid,
      displayName,
      avatarMode: authUser.photoURL?.startsWith("https://")
        ? "PROVIDER"
        : "DEFAULT",
      profileVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(userRef, profile);
    tx.create(gateRef, {
      uid: actor.uid,
      status: "ACTIVE",
      version: 1,
      updatedAt: now,
    });
    return profile;
  });
}
async function getProfile(actor: Actor, raw: unknown): Promise<Data> {
  parse(empty, raw);
  await assertActive(actor);
  const user = requireDoc(await db.doc(`users/${actor.uid}`).get());
  let avatarSource: Data = { type: "Default" };
  if (user.avatarMode === "PROVIDER") {
    const auth = await getAuth().getUser(actor.uid);
    if (auth.photoURL?.startsWith("https://"))
      avatarSource = { type: "ProviderUrl", url: auth.photoURL };
  } else if (user.avatarMode === "CUSTOM") {
    const asset = requireDoc(
      await db
        .doc(`users/${actor.uid}/profileAssets/${user.avatarAssetId}`)
        .get(),
    );
    if (asset.state !== "ACTIVE" || asset.ownerUid !== actor.uid)
      fail("AVATAR_UNAVAILABLE");
    const expiresAt = Date.now() + 15 * 60_000;
    let url: string;
    if (
      process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
      process.env.STORAGE_EMULATOR_HOST
    ) {
      const host = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
        process.env.STORAGE_EMULATOR_HOST)!.replace(/^https?:\/\//, "");
      const [metadata] = await bucket.file(asset.storagePath).getMetadata();
      const token = metadata.metadata?.firebaseStorageDownloadTokens;
      url = `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(asset.storagePath)}?alt=media&token=${encodeURIComponent(String(token ?? ""))}`;
    } else
      [url] = await bucket
        .file(asset.storagePath)
        .getSignedUrl({ action: "read", expires: expiresAt });
    avatarSource = {
      type: "OwnedAssetUrl",
      assetId: user.avatarAssetId,
      version: user.profileVersion,
      url,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
  return { user, avatarSource, profileVersion: user.profileVersion };
}
async function saveProfile(actor: Actor, raw: unknown): Promise<Data> {
  const input = parse(
    z
      .object({
        commandId,
        expectedProfileVersion: version,
        displayName: z.string().trim().min(1).max(50),
        avatarMode,
        avatarAssetId: identifier.optional(),
      })
      .strict(),
    raw,
  );
  if ((input.avatarMode === "CUSTOM") !== Boolean(input.avatarAssetId))
    fail("VALIDATION_FAILED");
  return command(actor, "saveProfile", input, async (tx, now) => {
    const userRef = db.doc(`users/${actor.uid}`),
      user = requireDoc(await tx.get(userRef));
    checkVersion(user.profileVersion, input.expectedProfileVersion);
    const nextAsset = input.avatarAssetId
      ? db.doc(`users/${actor.uid}/profileAssets/${input.avatarAssetId}`)
      : undefined;
    const oldAsset = user.avatarAssetId
      ? db.doc(`users/${actor.uid}/profileAssets/${user.avatarAssetId}`)
      : undefined;
    const fresh = nextAsset ? (await tx.get(nextAsset)).data() : undefined;
    const previous = oldAsset ? (await tx.get(oldAsset)).data() : undefined;
    if (
      nextAsset &&
      (!fresh ||
        fresh.ownerUid !== actor.uid ||
        !["READY", "ACTIVE"].includes(fresh.state) ||
        fresh.cleanupLeaseUntil?.toMillis() > now.toMillis())
    )
      fail("AVATAR_UNAVAILABLE");
    const updated: Data = {
      ...user,
      displayName: input.displayName,
      avatarMode: input.avatarMode,
      profileVersion: user.profileVersion + 1,
      updatedAt: now,
    };
    delete updated.avatarAssetId;
    if (input.avatarAssetId) updated.avatarAssetId = input.avatarAssetId;
    if (oldAsset && oldAsset.path !== nextAsset?.path && previous)
      tx.update(oldAsset, {
        state: "RETIRING",
        expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 3600_000),
      });
    if (nextAsset) tx.update(nextAsset, { state: "ACTIVE", expiresAt: null });
    tx.set(userRef, updated);
    return { user: updated, profileVersion: updated.profileVersion };
  });
}
async function beginAvatarUpload(actor: Actor, raw: unknown): Promise<Data> {
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
async function finalizeAvatar(actor: Actor, raw: unknown): Promise<Data> {
  const input = parse(z.object({ assetId: identifier }).strict(), raw);
  await assertActive(actor);
  const ref = db.doc(`users/${actor.uid}/profileAssets/${input.assetId}`),
    asset = requireDoc(await ref.get());
  if (asset.ownerUid !== actor.uid) fail("PERMISSION_DENIED");
  if (["READY", "ACTIVE"].includes(asset.state)) return asset;
  if (asset.state !== "STAGING" || asset.expiresAt.toMillis() < Date.now())
    fail("AVATAR_UNAVAILABLE");
  const file = bucket.file(asset.stagingPath);
  const [metadata] = await file.getMetadata();
  if (
    Number(metadata.size) !== asset.sizeBytes ||
    metadata.contentType !== asset.mimeType
  )
    fail("VALIDATION_FAILED");
  const [bytes] = await file.download();
  let normalized: Buffer;
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    });
    const info = await decoder.metadata();
    const expectedFormat = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    }[asset.mimeType as "image/jpeg" | "image/png" | "image/webp"];
    if (
      info.format !== expectedFormat ||
      !info.width ||
      !info.height ||
      info.width * info.height > 16_000_000 ||
      (info.pages ?? 1) > 1
    )
      fail("VALIDATION_FAILED");
    normalized = await decoder
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return fail("VALIDATION_FAILED", "Ảnh không hợp lệ.");
  }
  const storagePath = `avatars/${actor.uid}/normalized/${input.assetId}`;
  await bucket
    .file(storagePath)
    .save(normalized, {
      contentType: "image/webp",
      resumable: false,
      metadata:
        process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
        process.env.STORAGE_EMULATOR_HOST
          ? { metadata: { firebaseStorageDownloadTokens: id() } }
          : undefined,
      preconditionOpts: { ifGenerationMatch: 0 },
    })
    .catch(async (error) => {
      if ((error as { code?: number }).code !== 412) throw error;
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
      storagePath,
      width: 512,
      height: 512,
      contentHash: hash(normalized.toString("base64")),
      normalizedBytes: normalized.length,
    };
    tx.set(ref, ready);
    return ready;
  });
}
export async function cleanupAvatars(): Promise<void> {
  const expired = await db
    .collectionGroup("profileAssets")
    .where("state", "in", ["STAGING", "RETIRING"])
    .where("expiresAt", "<=", Timestamp.now())
    .limit(100)
    .get();
  for (const candidate of expired.docs) {
    const asset = await db.runTransaction(async (tx) => {
      const latest = (await tx.get(candidate.ref)).data();
      if (
        !latest ||
        !["STAGING", "RETIRING"].includes(latest.state) ||
        latest.expiresAt?.toMillis() > Date.now()
      )
        return null;
      const user = (await tx.get(db.doc(`users/${latest.ownerUid}`))).data();
      if (user?.avatarAssetId === candidate.id) return null;
      tx.update(candidate.ref, {
        cleanupLeaseUntil: Timestamp.fromMillis(Date.now() + 5 * 60_000),
      });
      return latest;
    });
    if (!asset) continue;
    for (const path of [asset.stagingPath, asset.storagePath].filter(Boolean))
      await bucket.file(path).delete({ ignoreNotFound: true });
    await candidate.ref.delete();
  }
}
export const profileHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  ensureProfile,
  getProfile,
  saveProfile,
  beginAvatarUpload,
  finalizeAvatar,
  async getAccess(actor, raw) {
    parse(empty, raw);
    await assertActive(actor);
    return {
      uid: actor.uid,
      roles: ["LEARNER", ...(actor.contentAdmin ? ["CONTENT_ADMIN"] : [])],
    };
  },
  async getAccountState(actor, raw) {
    parse(empty, raw);
    const gate = requireDoc(await db.doc(`accountStates/${actor.uid}`).get());
    return {
      status: gate.status,
      version: gate.version,
      deletionJobId: gate.deletionJobId,
    };
  },
  async getDeletionInfo(actor, raw) {
    parse(empty, raw);
    await assertActive(actor);
    return {
      requiresRecentAuthentication: true,
      retentionDays: 7,
      scope: [
        "profile",
        "vocabulary",
        "learning",
        "games",
        "aiSummaries",
        "reports",
        "avatars",
      ],
    };
  },
};
