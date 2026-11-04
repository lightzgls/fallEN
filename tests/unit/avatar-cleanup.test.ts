import { describe, expect, it, vi } from "vitest";
import type {
  AvatarCleanupStore,
  CleanupAsset,
} from "../../functions/src/contracts/profile/cleanup.js";
import { createAvatarCleanup } from "../../functions/src/services/profile/cleanup.js";

const now = new Date("2026-11-04T00:00:00Z"),
  candidate = { key: "asset-key", assetId: "old-avatar" };
function fixture(asset: CleanupAsset, currentAvatar?: string) {
  const lease = vi.fn(),
    deleteFile = vi
      .fn<AvatarCleanupStore["deleteFile"]>()
      .mockResolvedValue(undefined),
    deleteAsset = vi
      .fn<AvatarCleanupStore["deleteAsset"]>()
      .mockResolvedValue(undefined);
  const store: AvatarCleanupStore = {
    now: () => now,
    candidates: async () => [candidate],
    transaction: async (_candidate, work) =>
      work({
        readAsset: async () => asset,
        currentAvatar: async () => currentAvatar,
        lease,
      }),
    deleteFile,
    deleteAsset,
  };
  return { store, lease, deleteFile, deleteAsset };
}
describe("avatar cleanup lifecycle", () => {
  it("keeps an expired asset referenced by the current profile", async () => {
    const test = fixture(
      {
        ownerUid: "learner",
        state: "RETIRING",
        expiresAt: new Date(0),
        storagePath: "owned-image",
      },
      candidate.assetId,
    );
    await createAvatarCleanup(test.store)();
    expect(test.lease).not.toHaveBeenCalled();
    expect(test.deleteFile).not.toHaveBeenCalled();
    expect(test.deleteAsset).not.toHaveBeenCalled();
  });
  it("rechecks lifecycle after the candidate query and keeps an activated asset", async () => {
    const test = fixture({
      ownerUid: "learner",
      state: "ACTIVE",
      expiresAt: new Date(0),
      storagePath: "owned-image",
    });
    await createAvatarCleanup(test.store)();
    expect(test.deleteAsset).not.toHaveBeenCalled();
  });
  it("leases an eligible asset before removing its files and metadata", async () => {
    const test = fixture({
      ownerUid: "learner",
      state: "STAGING",
      expiresAt: new Date(0),
      stagingPath: "staged",
      storagePath: "normalized",
    });
    await createAvatarCleanup(test.store)();
    expect(test.lease).toHaveBeenCalledWith(
      new Date(now.getTime() + 5 * 60_000),
    );
    expect(test.deleteFile.mock.calls).toEqual([["staged"], ["normalized"]]);
    expect(test.deleteAsset).toHaveBeenCalledWith(candidate);
    expect(test.lease.mock.invocationCallOrder[0]).toBeLessThan(
      test.deleteFile.mock.invocationCallOrder[0],
    );
    expect(test.deleteFile.mock.invocationCallOrder[1]).toBeLessThan(
      test.deleteAsset.mock.invocationCallOrder[0],
    );
  });
});
