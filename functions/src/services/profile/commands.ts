import type { Actor } from "../../contracts/callable.js";
import type {
  EnsureProfileInput,
  SaveProfileInput,
} from "../../contracts/profile/requests.js";
import type {
  ProfileStore,
  UserProfile,
} from "../../contracts/profile/store.js";
import { fail } from "../../shared/errors.js";
import { checkVersion } from "../../shared/validation.js";

export async function ensureProfile(
  actor: Actor,
  input: EnsureProfileInput,
  store: ProfileStore,
) {
  const authUser = await store.authUser(actor.uid);
  if (authUser.disabled) fail("UNAUTHENTICATED");
  return store.transaction(actor, false, async (tx) => {
    const gate = await tx.readGate(),
      user = await tx.readProfile();
    if (gate?.status === "DELETING") fail("ACCOUNT_DELETING");
    if (user && gate?.status === "ACTIVE") return user;
    if (gate && !user) fail("PROFILE_PENDING");
    const providerName = authUser.displayName?.trim();
    const profile: UserProfile = {
      uid: actor.uid,
      displayName:
        input.displayName ??
        (providerName && providerName.length <= 50
          ? providerName
          : "Người học"),
      avatarMode: authUser.photoURL?.startsWith("https://")
        ? "PROVIDER"
        : "DEFAULT",
      profileVersion: 1,
      createdAt: tx.now,
      updatedAt: tx.now,
    };
    tx.createProfile(profile, {
      uid: actor.uid,
      status: "ACTIVE",
      version: 1,
      updatedAt: tx.now,
    });
    return profile;
  });
}

export async function saveProfile(
  actor: Actor,
  input: SaveProfileInput,
  store: ProfileStore,
) {
  if ((input.avatarMode === "CUSTOM") !== Boolean(input.avatarAssetId))
    fail("VALIDATION_FAILED");
  return store.command(actor, "saveProfile", input, async (tx) => {
    const user = (await tx.readProfile()) ?? fail("NOT_FOUND");
    checkVersion(user.profileVersion, input.expectedProfileVersion);
    const fresh = input.avatarAssetId
      ? await tx.readAsset(input.avatarAssetId)
      : undefined;
    const previous = user.avatarAssetId
      ? await tx.readAsset(user.avatarAssetId)
      : undefined;
    if (
      input.avatarAssetId &&
      (!fresh ||
        fresh.ownerUid !== actor.uid ||
        !["READY", "ACTIVE"].includes(fresh.state) ||
        (fresh.cleanupLeaseUntil?.getTime() ?? 0) > tx.now.getTime())
    )
      fail("AVATAR_UNAVAILABLE");
    const updated: UserProfile = {
      ...user,
      displayName: input.displayName,
      avatarMode: input.avatarMode,
      profileVersion: user.profileVersion + 1,
      updatedAt: tx.now,
    };
    delete updated.avatarAssetId;
    if (input.avatarAssetId) updated.avatarAssetId = input.avatarAssetId;
    if (
      user.avatarAssetId &&
      user.avatarAssetId !== input.avatarAssetId &&
      previous
    )
      tx.patchAsset(user.avatarAssetId, {
        state: "RETIRING",
        expiresAt: new Date(tx.now.getTime() + 24 * 3600_000),
      });
    if (input.avatarAssetId)
      tx.patchAsset(input.avatarAssetId, { state: "ACTIVE", expiresAt: null });
    tx.saveProfile(updated);
    return { user: updated, profileVersion: updated.profileVersion };
  });
}
