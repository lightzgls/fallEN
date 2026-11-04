import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  checkVersion,
  command,
  commandId,
  db,
  fail,
  identifier,
  parse,
  requireDoc,
  version,
  type Actor,
  type Data,
} from "../../shared/core.js";

export const avatarMode = z.enum(["DEFAULT", "PROVIDER", "CUSTOM"]);

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

export async function saveProfile(actor: Actor, raw: unknown): Promise<Data> {
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
