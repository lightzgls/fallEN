import type { Actor } from "../../contracts/callable.js";
import type { ProfileStore } from "../../contracts/profile/store.js";
import { fail } from "../../shared/errors.js";

export async function getProfile(actor: Actor, store: ProfileStore) {
  await store.assertActive(actor);
  const user = await store.readProfile(actor);
  let avatarSource: {
    type: string;
    url?: string;
    assetId?: string;
    version?: number;
    expiresAt?: string;
  } = { type: "Default" };
  if (user.avatarMode === "PROVIDER") {
    const auth = await store.authUser(actor.uid);
    if (auth.photoURL?.startsWith("https://"))
      avatarSource = { type: "ProviderUrl", url: auth.photoURL };
  } else if (user.avatarMode === "CUSTOM") {
    const assetId = user.avatarAssetId ?? fail("AVATAR_UNAVAILABLE");
    const asset = await store.readAsset(actor, assetId);
    if (asset.state !== "ACTIVE" || asset.ownerUid !== actor.uid)
      fail("AVATAR_UNAVAILABLE");
    const expiresAt = new Date(store.now().getTime() + 15 * 60_000);
    const url = await store.avatarUrl(
      asset.storagePath ?? fail("AVATAR_UNAVAILABLE"),
      expiresAt,
    );
    avatarSource = {
      type: "OwnedAssetUrl",
      assetId,
      version: user.profileVersion,
      url,
      expiresAt: expiresAt.toISOString(),
    };
  }
  return { user, avatarSource, profileVersion: user.profileVersion };
}
export async function getAccess(actor: Actor, store: ProfileStore) {
  await store.assertActive(actor);
  return {
    uid: actor.uid,
    roles: ["LEARNER", ...(actor.contentAdmin ? ["CONTENT_ADMIN"] : [])],
  };
}
export async function getAccountState(actor: Actor, store: ProfileStore) {
  const gate = await store.readGate(actor);
  return {
    status: gate.status,
    version: gate.version,
    deletionJobId: gate.deletionJobId,
  };
}
export async function getDeletionInfo(actor: Actor, store: ProfileStore) {
  await store.assertActive(actor);
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
}
