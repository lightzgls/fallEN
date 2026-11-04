import { randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bucket,
  db,
  hash,
  type Data,
} from "../../functions/src/shared/core.js";
import {
  profileHandlers,
  cleanupAvatars,
} from "../../functions/src/services/profile.js";
import {
  deletionHandlers,
  runDeletionJob,
} from "../../functions/src/services/deletion.js";
import {
  businessCode,
  learner,
  otherLearner,
  publicActor,
  read,
  resetData,
  seedData,
} from "./fixtures.js";

const profile = async (
  name: string,
  input: Data,
  actor = learner,
): Promise<Data> => (await profileHandlers[name](actor, input)) as Data;
beforeEach(async () => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error("Auth emulator required.");
  await resetData();
  await seedData();
  for (const actor of [learner, otherLearner]) {
    await getAuth()
      .deleteUser(actor.uid)
      .catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
      });
    await getAuth().createUser({
      uid: actor.uid,
      displayName: "Provider name",
      email: `${actor.uid}@example.test`,
      photoURL: "https://example.test/avatar.png",
    });
  }
});

describe("profile version and owned avatar lifecycle", () => {
  it("checks CAS and keeps DEFAULT independent from a provider photo", async () => {
    const input = {
      commandId: "edit-profile",
      expectedProfileVersion: 1,
      displayName: "Tên mới",
      avatarMode: "DEFAULT",
    };
    const changed = await profile("saveProfile", input);
    expect(await profile("saveProfile", input)).toEqual(changed);
    expect((await profile("getProfile", {})).avatarSource.type).toBe("Default");
    expect(
      await businessCode(
        profile("saveProfile", { ...input, commandId: "stale-edit" }),
      ),
    ).toBe("CONFLICT");
    expect(
      await businessCode(
        profile("saveProfile", {
          ...input,
          commandId: "role-forgery",
          contentAdmin: true,
        }),
      ),
    ).toBe("VALIDATION_FAILED");
  });

  it("normalizes validated image bytes but activates only after an explicit profile save", async () => {
    const bytes = await sharp({
      create: { width: 40, height: 80, channels: 3, background: "#345fe8" },
    })
      .png()
      .toBuffer();
    const grant = await profile("beginAvatarUpload", {
      commandId: "avatar-upload",
      mimeType: "image/png",
      sizeBytes: bytes.length,
    });
    await bucket
      .file(grant.stagingPath)
      .save(bytes, { contentType: "image/png", resumable: false });
    const asset = await profile("finalizeAvatar", { assetId: grant.assetId });
    expect(asset).toMatchObject({ state: "READY", width: 512, height: 512 });
    expect((await read(`users/${learner.uid}`))?.avatarMode).toBe("DEFAULT");
    const [normalized] = await bucket.file(asset.storagePath).download();
    const metadata = await sharp(normalized).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(metadata.exif).toBeUndefined();
    await profile("saveProfile", {
      commandId: "use-avatar",
      expectedProfileVersion: 1,
      displayName: "Tên mới",
      avatarMode: "CUSTOM",
      avatarAssetId: grant.assetId,
    });
    expect(
      (await read(`users/${learner.uid}/profileAssets/${grant.assetId}`))
        ?.state,
    ).toBe("ACTIVE");
    await db
      .doc(`users/${learner.uid}/profileAssets/${grant.assetId}`)
      .update({ expiresAt: Timestamp.fromMillis(1) });
    await cleanupAvatars();
    expect(
      (await read(`users/${learner.uid}/profileAssets/${grant.assetId}`))
        ?.state,
    ).toBe("ACTIVE");
    expect((await bucket.file(asset.storagePath).exists())[0]).toBe(true);
    expect(
      await businessCode(
        profile(
          "saveProfile",
          {
            commandId: "steal-avatar",
            expectedProfileVersion: 1,
            displayName: "Other",
            avatarMode: "CUSTOM",
            avatarAssetId: grant.assetId,
          },
          otherLearner,
        ),
      ),
    ).toBe("AVATAR_UNAVAILABLE");
  });

  it("rejects fake image bytes and oversize declarations before profile activation", async () => {
    expect(
      await businessCode(
        profile("beginAvatarUpload", {
          commandId: "oversize-avatar",
          mimeType: "image/png",
          sizeBytes: 5 * 1024 * 1024 + 1,
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    const bytes = Buffer.from("This is not an image.");
    const grant = await profile("beginAvatarUpload", {
      commandId: "fake-avatar",
      mimeType: "image/jpeg",
      sizeBytes: bytes.length,
    });
    await bucket
      .file(grant.stagingPath)
      .save(bytes, { contentType: "image/jpeg", resumable: false });
    expect(
      await businessCode(profile("finalizeAvatar", { assetId: grant.assetId })),
    ).toBe("VALIDATION_FAILED");
    expect((await read(`users/${learner.uid}`))?.avatarMode).toBe("DEFAULT");
    expect(
      (await read(`users/${learner.uid}/profileAssets/${grant.assetId}`))
        ?.state,
    ).toBe("STAGING");
  });

  it("rejects a valid JPEG falsely declared as PNG without activating it", async () => {
    const bytes = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#345fe8" },
    })
      .jpeg()
      .toBuffer();
    const grant = await profile("beginAvatarUpload", {
      commandId: "mislabeled-avatar",
      mimeType: "image/png",
      sizeBytes: bytes.length,
    });
    await bucket
      .file(grant.stagingPath)
      .save(bytes, { contentType: "image/png", resumable: false });
    expect(
      await businessCode(profile("finalizeAvatar", { assetId: grant.assetId })),
    ).toBe("VALIDATION_FAILED");
    expect((await read(`users/${learner.uid}`))?.avatarMode).toBe("DEFAULT");
    expect(
      (await read(`users/${learner.uid}/profileAssets/${grant.assetId}`))
        ?.state,
    ).toBe("STAGING");
  });
});

describe("account deletion gate, recursive purge and capability status", () => {
  it("requires recent authentication and blocks profile recreation immediately after accepting deletion", async () => {
    const token = randomBytes(32).toString("base64url");
    const stale = { ...learner, authTime: Math.floor(Date.now() / 1000) - 301 };
    expect(
      await businessCode(
        deletionHandlers.requestDeletion(stale, {
          commandId: "delete-stale",
          statusTokenHash: hash(token),
        }),
      ),
    ).toBe("REAUTH_REQUIRED");
    const input = { commandId: "delete-request", statusTokenHash: hash(token) };
    const accepted = await deletionHandlers.requestDeletion(learner, input);
    expect(accepted.state).toBe("QUEUED");
    expect((await read(`accountStates/${learner.uid}`))?.status).toBe(
      "DELETING",
    );
    expect((await deletionHandlers.requestDeletion(learner, input)).jobId).toBe(
      accepted.jobId,
    );
    expect(await businessCode(profile("ensureProfile", {}))).toBe(
      "ACCOUNT_DELETING",
    );
    expect(await businessCode(profile("getProfile", {}))).toBe(
      "ACCOUNT_DELETING",
    );
  });

  it("purges owned nested data and reports, deletes Auth last, and returns only public status after completion", async () => {
    const token = randomBytes(32).toString("base64url");
    await db
      .doc(`users/${learner.uid}/studySessions/study/items/book`)
      .set({ wordVersion: 1 });
    await db
      .doc("contentReports/owned-report")
      .set({ ownerUid: learner.uid, description: "Private report" });
    await db
      .doc("contentReports/owned-report/actions/action")
      .set({ actorUid: "admin", note: "Audit" });
    await db
      .doc("contentReports/other-report")
      .set({ ownerUid: otherLearner.uid });
    const avatarPath = `avatars/${learner.uid}/staging/delete-me`;
    await bucket.file(avatarPath).save("private-avatar");
    await deletionHandlers.requestDeletion(learner, {
      commandId: "delete-full",
      statusTokenHash: hash(token),
    });
    await runDeletionJob("delete-full");
    await runDeletionJob("delete-full");
    expect(await read(`users/${learner.uid}`)).toBeUndefined();
    expect(
      await read(`users/${learner.uid}/studySessions/study/items/book`),
    ).toBeUndefined();
    expect(await read("contentReports/owned-report")).toBeUndefined();
    expect(
      await read("contentReports/owned-report/actions/action"),
    ).toBeUndefined();
    expect(await read("contentReports/other-report")).toBeDefined();
    expect(await read("systemDecks/test-deck")).toBeDefined();
    expect((await bucket.file(avatarPath).exists())[0]).toBe(false);
    await expect(getAuth().getUser(learner.uid)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
    const job = await read("accountDeletionJobs/delete-full");
    expect(job?.state).toBe("COMPLETE");
    expect(job?.ownerUid).toBeUndefined();
    expect(job?.requestHash).toBeUndefined();
    const status = await deletionHandlers.getDeletionStatus(publicActor, {
      jobId: "delete-full",
      statusToken: token,
    });
    expect(status.state).toBe("COMPLETE");
    expect(status.ownerUid).toBeUndefined();
    expect(status.statusTokenHash).toBeUndefined();
    expect(
      await businessCode(
        deletionHandlers.getDeletionStatus(publicActor, {
          jobId: "delete-full",
          statusToken: randomBytes(32).toString("base64url"),
        }),
      ),
    ).toBe("PERMISSION_DENIED");
  });
});
