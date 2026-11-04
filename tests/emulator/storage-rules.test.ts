import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

let environment: RulesTestEnvironment;
const bucketUrl = "gs://demo-fallen.firebasestorage.app";
beforeAll(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_STORAGE_EMULATOR_HOST
  )
    throw new Error("Storage and Firestore emulators required.");
  environment = await initializeTestEnvironment({
    projectId: "demo-fallen",
    firestore: {
      rules: readFileSync(
        new URL("../../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
    storage: {
      rules: readFileSync(
        new URL("../../storage.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});
afterAll(async () => {
  await environment?.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc("accountStates/alice")
      .set({ status: "ACTIVE" });
    await context
      .firestore()
      .doc("accountStates/bob")
      .set({ status: "ACTIVE" });
  });
});
const bytes = new Uint8Array([1, 2, 3, 4]);
async function avatarGrant(
  assetId: string,
  changes: Record<string, unknown> = {},
) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc(`users/alice/profileAssets/${assetId}`)
      .set({
        ownerUid: "alice",
        state: "STAGING",
        stagingPath: `avatars/alice/staging/${assetId}`,
        mimeType: "image/png",
        sizeBytes: bytes.length,
        ...changes,
      });
  });
}

describe("Storage create-only upload grants", () => {
  it("permits exactly the owned avatar grant and prevents overwrite or client normalization", async () => {
    const assetId = randomUUID();
    await avatarGrant(assetId);
    const storage = environment
      .authenticatedContext("alice")
      .storage(bucketUrl);
    const object = storage.ref(`avatars/alice/staging/${assetId}`);
    await assertSucceeds(
      Promise.resolve(object.put(bytes, { contentType: "image/png" })),
    );
    await assertFails(
      Promise.resolve(object.put(bytes, { contentType: "image/png" })),
    );
    await assertFails(object.delete());
    await assertFails(
      Promise.resolve(
        storage
          .ref(`avatars/alice/normalized/${assetId}`)
          .put(bytes, { contentType: "image/webp" }),
      ),
    );
  });

  it("rejects another owner, missing grant, wrong MIME and wrong byte length", async () => {
    const assetId = randomUUID();
    await avatarGrant(assetId);
    const alice = environment.authenticatedContext("alice").storage(bucketUrl);
    const bob = environment.authenticatedContext("bob").storage(bucketUrl);
    const path = `avatars/alice/staging/${assetId}`;
    await assertFails(
      Promise.resolve(bob.ref(path).put(bytes, { contentType: "image/png" })),
    );
    await assertFails(
      Promise.resolve(
        alice
          .ref("avatars/alice/staging/no-grant")
          .put(bytes, { contentType: "image/png" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        alice.ref(path).put(bytes, { contentType: "image/jpeg" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        alice.ref(path).put(new Uint8Array([1]), { contentType: "image/png" }),
      ),
    );
  });

  it("blocks upload once an account is DELETING or an avatar has been finalized", async () => {
    const finalizedId = randomUUID();
    await avatarGrant(finalizedId, { state: "READY" });
    const alice = environment.authenticatedContext("alice").storage(bucketUrl);
    await assertFails(
      Promise.resolve(
        alice
          .ref(`avatars/alice/staging/${finalizedId}`)
          .put(bytes, { contentType: "image/png" }),
      ),
    );
    const deletingId = randomUUID();
    await avatarGrant(deletingId);
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("accountStates/alice")
        .update({ status: "DELETING" });
    });
    await assertFails(
      Promise.resolve(
        alice
          .ref(`avatars/alice/staging/${deletingId}`)
          .put(bytes, { contentType: "image/png" }),
      ),
    );
  });

  it("requires a contentAdmin claim plus the exact granted content path, type and size", async () => {
    const assetId = randomUUID();
    const path = `content/alice/${assetId}`;
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(`imageAssets/${assetId}`)
        .set({
          createdBy: "alice",
          state: "UPLOADED",
          kind: "IMAGE",
          storagePath: path,
          contentType: "image/png",
          byteSize: bytes.length,
        });
    });
    const learner = environment
      .authenticatedContext("alice")
      .storage(bucketUrl);
    const admin = environment
      .authenticatedContext("alice", { contentAdmin: true })
      .storage(bucketUrl);
    const otherAdmin = environment
      .authenticatedContext("bob", { contentAdmin: true })
      .storage(bucketUrl);
    await assertFails(
      Promise.resolve(
        learner.ref(path).put(bytes, { contentType: "image/png" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        otherAdmin.ref(path).put(bytes, { contentType: "image/png" }),
      ),
    );
    await assertSucceeds(
      Promise.resolve(admin.ref(path).put(bytes, { contentType: "image/png" })),
    );
    await assertFails(
      Promise.resolve(admin.ref(path).put(bytes, { contentType: "image/png" })),
    );
    await assertFails(
      Promise.resolve(
        admin
          .ref("dictionary/test-release/search-index.json")
          .put(bytes, { contentType: "application/json" }),
      ),
    );
  });
});
