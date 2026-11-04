import type { AvatarCleanupStore } from "../../contracts/profile/cleanup.js";

export function createAvatarCleanup(store: AvatarCleanupStore) {
  return async function cleanupAvatars(): Promise<void> {
    for (const candidate of await store.candidates(store.now())) {
      const asset = await store.transaction(candidate, async (tx) => {
        const latest = await tx.readAsset();
        if (
          !latest ||
          !["STAGING", "RETIRING"].includes(latest.state) ||
          (latest.expiresAt?.getTime() ?? 0) > store.now().getTime()
        )
          return null;
        if ((await tx.currentAvatar(latest.ownerUid)) === candidate.assetId)
          return null;
        tx.lease(new Date(store.now().getTime() + 5 * 60_000));
        return latest;
      });
      if (!asset) continue;
      for (const path of [asset.stagingPath, asset.storagePath])
        if (path) await store.deleteFile(path);
      await store.deleteAsset(candidate);
    }
  };
}
