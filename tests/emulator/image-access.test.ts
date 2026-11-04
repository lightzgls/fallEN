import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bucket,
  db,
  hash,
  type Data,
} from "../../functions/src/shared/core.js";
import { contentHandlers } from "../../functions/src/routes/content.js";
import {
  admin,
  learner,
  otherLearner,
  businessCode,
  resetData,
  seedData,
} from "./fixtures.js";

const resolve = async (input: Data, actor = learner): Promise<Data> =>
  (await contentHandlers.getImageAsset(actor, input)) as Data;
const coverContext = { wordSetId: "test-deck", revisionId: "revision-one" };

async function imageAsset(assetId: string): Promise<void> {
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#345fe8" },
  })
    .png()
    .toBuffer();
  const storagePath = `content/${admin.uid}/${assetId}`;
  await bucket.file(storagePath).save(bytes, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: `emulator-${assetId}-token`,
      },
    },
  });
  await db.doc(`imageAssets/${assetId}`).set({
    id: assetId,
    assetId,
    storagePath,
    createdBy: admin.uid,
    originalFileName: "private-admin-file.png",
    state: "VALIDATED",
    kind: "IMAGE",
    contentType: "image/png",
    byteSize: bytes.length,
    width: 8,
    height: 8,
    checksum: hash(bytes.toString("base64")),
  });
}

beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("published image resolution for Android learners", () => {
  it("returns a usable sanitized URL only for a verified published cover context", async () => {
    await imageAsset("public-cover");
    await db
      .doc("systemDecks/test-deck/revisions/revision-one")
      .update({ coverImageAssetId: "public-cover" });
    const asset = await resolve({ assetId: "public-cover", ...coverContext });
    expect(asset).toMatchObject({
      id: "public-cover",
      assetId: "public-cover",
      state: "VALIDATED",
      contentType: "image/png",
      width: 8,
      height: 8,
    });
    expect(asset.url).toBeTypeOf("string");
    expect(asset.expiresAt).toBeDefined();
    for (const privateField of [
      "createdBy",
      "storagePath",
      "originalFileName",
      "sourceFileId",
    ])
      expect(asset).not.toHaveProperty(privateField);
    const response = await fetch(asset.url);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const administrator = await resolve({ assetId: "public-cover" }, admin);
    expect(administrator.createdBy).toBe(admin.uid);
  });

  it("permits a referenced retained SetWord image while rejecting draft and unrelated assets", async () => {
    await imageAsset("entry-image");
    await imageAsset("unrelated-image");
    await db
      .doc("systemDecks/test-deck/revisions/revision-one/words/book")
      .update({ imageAssetId: "entry-image", imageAlt: "Ảnh học liệu" });
    await db
      .doc("systemDecks/test-deck/revisions/revision-one")
      .update({ state: "RETIRED" });
    expect(
      (
        await resolve(
          { assetId: "entry-image", ...coverContext, wordId: "book" },
          otherLearner,
        )
      ).assetId,
    ).toBe("entry-image");
    expect(
      await businessCode(
        resolve({
          assetId: "unrelated-image",
          ...coverContext,
          wordId: "book",
        }),
      ),
    ).toBe("PERMISSION_DENIED");
    await db
      .doc("systemDecks/test-deck/revisions/private-draft")
      .set({ state: "DRAFT", coverImageAssetId: "unrelated-image" });
    expect(
      await businessCode(
        resolve({
          assetId: "unrelated-image",
          wordSetId: "test-deck",
          revisionId: "private-draft",
        }),
      ),
    ).toBe("PERMISSION_DENIED");
  });

  it("requires the exact public release and WordVersion when resolving dictionary meaning images", async () => {
    await imageAsset("dictionary-image");
    await db.doc("words/book/versions/1").update({
      meanings: [
        {
          id: "meaning-book",
          partOfSpeech: "noun",
          text: "Sách",
          imageAssetId: "dictionary-image",
          imageAlt: "Một cuốn sách",
        },
      ],
    });
    expect(
      (
        await resolve({
          assetId: "dictionary-image",
          wordId: "book",
          wordVersion: 1,
          releaseId: "test-release",
        })
      ).assetId,
    ).toBe("dictionary-image");
    expect(
      await businessCode(
        resolve({
          assetId: "dictionary-image",
          wordId: "book",
          wordVersion: 2,
          releaseId: "test-release",
        }),
      ),
    ).toBe("PERMISSION_DENIED");
    await db.doc("dictionaryReleases/private-release").set({ state: "READY" });
    await db
      .doc("dictionaryReleases/private-release/entries/book")
      .set({ wordVersion: 1, active: true });
    expect(
      await businessCode(
        resolve({
          assetId: "dictionary-image",
          wordId: "book",
          wordVersion: 1,
          releaseId: "private-release",
        }),
      ),
    ).toBe("PERMISSION_DENIED");
  });

  it("resolves a retained deck default image from its pinned WordVersion after the current dictionary advances", async () => {
    await imageAsset("retained-default-image");
    await db.doc("words/book/versions/1").update({
      meanings: [
        {
          id: "meaning-book",
          partOfSpeech: "noun",
          text: "Sách",
          imageAssetId: "retained-default-image",
          imageAlt: "Một cuốn sách",
        },
      ],
    });
    await db.doc("words/book/versions/2").set({
      wordId: "book",
      version: 2,
      spelling: "book",
      otherSpellings: [],
      meanings: [
        { id: "meaning-book", partOfSpeech: "noun", text: "Sách bản mới" },
      ],
      dictionaryRefs: [],
    });
    await db
      .doc("dictionaryReleases/new-image-release")
      .set({ state: "PUBLISHED" });
    await db
      .doc("dictionaryReleases/new-image-release/entries/book")
      .set({ wordId: "book", wordVersion: 2, active: true });
    await db
      .doc("dictionaryReleases/test-release")
      .update({ state: "RETIRED" });
    await db
      .doc("config/dictionary")
      .update({ activeReleaseId: "new-image-release", version: 2 });
    const asset = await resolve({
      assetId: "retained-default-image",
      ...coverContext,
      wordId: "book",
    });
    expect(asset.assetId).toBe("retained-default-image");
    expect(asset.url).toBeTypeOf("string");
    expect(asset).not.toHaveProperty("createdBy");
  });
});
