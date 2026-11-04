import { describe, expect, it, vi } from "vitest";
import type {
  DraftStore,
  ImageReferenceReader,
} from "../../functions/src/contracts/content/ports.js";
import { createDraftOperations } from "../../functions/src/services/content/drafts.js";
import { verifyImageReference } from "../../functions/src/services/content/image-access.js";

function imageReader(): ImageReferenceReader {
  return {
    deck: async () => ({ id: "travel", active: true, version: 1 }),
    imageRevision: async () => ({
      state: "PUBLISHED",
      coverImageAssetId: "cover",
    }),
    entries: async () => [{ wordId: "book", wordVersion: 1, position: 0 }],
    imageRelease: async (id) => ({ id, state: "PUBLISHED" }),
    activeReleaseId: async () => "current-release",
    releaseEntry: async () => ({ wordVersion: 1, active: true }),
    wordVersion: async () => ({
      wordId: "book",
      version: 1,
      meanings: [{ id: "book-meaning", imageAssetId: "default-image" }],
    }),
  };
}
describe("provider-independent content services", () => {
  it("delegates receipt replay before checking an obsolete draft version", async () => {
    const receipt = { id: "revision", version: 8 };
    const replay = vi.fn(async () => receipt);
    const store: DraftStore = { command: replay };
    const result = await createDraftOperations(store).saveDraft(
      { uid: "admin", contentAdmin: true, authTime: 0 },
      {
        wordSetId: "travel",
        revisionId: "revision",
        metadata: { name: "Travel", topic: "Travel" },
        entries: [],
        expectedVersion: 1,
        commandId: "same-command",
      },
    );
    expect(result).toEqual(receipt);
    expect(replay).toHaveBeenCalledOnce();
  });
  it("rejects a draft image using only its publication state", async () => {
    const reader = imageReader();
    reader.imageRevision = async () => ({
      state: "DRAFT",
      coverImageAssetId: "cover",
    });
    await expect(
      verifyImageReference(reader, {
        assetId: "cover",
        wordSetId: "travel",
        revisionId: "private",
      }),
    ).rejects.toMatchObject({ details: { code: "PERMISSION_DENIED" } });
  });
  it("rejects a nonpublic dictionary release before resolving its image", async () => {
    const reader = imageReader();
    reader.imageRelease = async (id) => ({ id, state: "READY" });
    await expect(
      verifyImageReference(reader, {
        assetId: "default-image",
        wordId: "book",
        wordVersion: 1,
        releaseId: "private-release",
      }),
    ).rejects.toMatchObject({ details: { code: "PERMISSION_DENIED" } });
  });
  it("resolves a retained deck's pinned default media without following the active dictionary", async () => {
    const reader = imageReader();
    reader.imageRevision = async () => ({ state: "RETIRED" });
    const activeRelease = vi.fn(async () => "new-release");
    reader.activeReleaseId = activeRelease;
    await expect(
      verifyImageReference(reader, {
        assetId: "default-image",
        wordSetId: "travel",
        revisionId: "retained",
        wordId: "book",
      }),
    ).resolves.toBeUndefined();
    expect(activeRelease).not.toHaveBeenCalled();
  });
});
