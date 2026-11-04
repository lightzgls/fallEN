import { beforeEach, describe, expect, it } from "vitest";
import { db, type Data } from "../../functions/src/shared/core.js";
import { contentHandlers } from "../../functions/src/routes/content.js";
import { reportHandlers } from "../../functions/src/routes/reports.js";
import { dictionaryHandlers } from "../../functions/src/routes/dictionary.js";
import {
  admin,
  learner,
  otherLearner,
  publicActor,
  businessCode,
  read,
  resetData,
  seedData,
} from "./fixtures.js";

const content = async (
  name: keyof typeof contentHandlers,
  input: Data,
  actor = admin,
): Promise<Data> => (await contentHandlers[name](actor, input)) as Data;
const report = async (
  name: keyof typeof reportHandlers,
  input: Data,
  actor = learner,
): Promise<Data> => (await reportHandlers[name](actor, input)) as Data;
const metadata = {
  name: "Bộ mới",
  topic: "Du lịch",
  description: "Học liệu kiểm thử.",
};
const entries = [
  {
    wordId: "book",
    wordVersion: 1,
    position: 0,
    focusMeaningId: "meaning-book",
    example: "Read a book.",
    exampleTranslation: "Đọc sách.",
  },
];
beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("admin authorization and atomic immutable publication", () => {
  it("denies learners content access and blocks original dictionary mutations through extra fields", async () => {
    expect(await businessCode(content("listDecks", {}, learner))).toBe(
      "PERMISSION_DENIED",
    );
    expect(
      await businessCode(
        content(
          "saveLimit",
          { maxSessionsPerDay: 10, expectedVersion: 1, commandId: "forbidden" },
          learner,
        ),
      ),
    ).toBe("PERMISSION_DENIED");
    expect(
      await businessCode(
        content("createDeck", {
          metadata: { ...metadata, meanings: [] },
          commandId: "lexical-forgery",
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect((await read("words/book/versions/1"))?.spelling).toBe("book");
  });

  it("publishes a whole revision once and keeps later edits in a separate draft", async () => {
    const created = await content("createDeck", {
      metadata,
      commandId: "create-deck",
    });
    const wordSetId = created.wordSet.id;
    const revisionId = created.revision.id;
    const before = (await dictionaryHandlers.getPublishedDecks(
      publicActor,
      {},
    )) as Data;
    expect(before.items.some((deck: Data) => deck.id === wordSetId)).toBe(
      false,
    );
    const saved = await content("saveDraft", {
      wordSetId,
      revisionId,
      metadata,
      entries,
      expectedVersion: 1,
      commandId: "save-draft",
    });
    expect((await read(`systemDecks/${wordSetId}`))?.name).toBeUndefined();
    const input = {
      wordSetId,
      revisionId,
      expectedWordSetVersion: 1,
      expectedDraftVersion: saved.version,
      commandId: "publish",
    };
    const published = await content("publishSet", input);
    expect(await content("publishSet", input)).toEqual(published);
    expect(await read(`systemDecks/${wordSetId}`)).toMatchObject({
      name: metadata.name,
      publishedRevisionId: revisionId,
      version: 2,
    });
    expect(
      (await read(`systemDecks/${wordSetId}`))?.draftRevisionId,
    ).toBeUndefined();
    expect(
      (await read(`systemDecks/${wordSetId}/revisions/${revisionId}`))?.state,
    ).toBe("PUBLISHED");
    expect(
      await businessCode(
        content("saveDraft", {
          wordSetId,
          revisionId,
          metadata,
          entries,
          expectedVersion: saved.version,
          commandId: "change-published",
        }),
      ),
    ).toBe("CONFLICT");
    const draft = await content("openDraft", {
      wordSetId,
      expectedWordSetVersion: 2,
      commandId: "reopen",
    });
    expect(draft.revision.id).not.toBe(revisionId);
    await content("saveDraft", {
      wordSetId,
      revisionId: draft.revision.id,
      metadata: { ...metadata, name: "Tên chưa công khai" },
      entries,
      expectedVersion: 1,
      commandId: "edit-second-draft",
    });
    expect((await read(`systemDecks/${wordSetId}`))?.name).toBe(metadata.name);
    expect(
      (await read(`systemDecks/${wordSetId}/revisions/${revisionId}`))?.name,
    ).toBe(metadata.name);
  });

  it("returns a failed empty publication to DRAFT without moving a public pointer", async () => {
    const created = await content("createDeck", {
      metadata,
      commandId: "empty-deck",
    });
    const { id: wordSetId } = created.wordSet;
    const { id: revisionId } = created.revision;
    expect(
      await businessCode(
        content("publishSet", {
          wordSetId,
          revisionId,
          expectedWordSetVersion: 1,
          expectedDraftVersion: 1,
          commandId: "empty-publish",
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(
      (await read(`systemDecks/${wordSetId}/revisions/${revisionId}`))?.state,
    ).toBe("DRAFT");
    expect(
      (await read(`systemDecks/${wordSetId}`))?.publishedRevisionId,
    ).toBeUndefined();
    expect(
      (await read(`users/${admin.uid}/commands/empty-publish`))?.status,
    ).toBe("FAILED");
  });
});

describe("import preview, explicit decisions and CAS", () => {
  it("does not create missing dictionary words and applies only explicitly selected valid rows once", async () => {
    const created = await content("createDeck", {
      metadata,
      commandId: "import-deck",
    });
    const preview = await content("previewImport", {
      wordSetId: created.wordSet.id,
      revisionId: created.revision.id,
      pastedRows: [
        { word: "book" },
        { word: "books" },
        { word: "not-in-dictionary" },
      ],
      assetIds: [],
      expectedDraftVersion: 1,
      commandId: "preview",
    });
    expect(preview.rows.map((row: Data) => row.status)).toEqual([
      "READY",
      "DUPLICATE",
      "NOT_FOUND",
    ]);
    expect(await read("words/not-in-dictionary")).toBeUndefined();
    const input = {
      importId: preview.importId,
      selectedRowIds: [preview.rows[0].id],
      skippedRowIds: [preview.rows[1].id, preview.rows[2].id],
      duplicateChoices: {},
      expectedDraftVersion: 1,
      fingerprint: preview.fingerprint,
      commandId: "apply",
    };
    const receipt = await content("applyImport", input);
    expect(receipt.appliedRowIds).toEqual([preview.rows[0].id]);
    expect(receipt.skippedRowIds).toHaveLength(2);
    expect(await content("applyImport", input)).toEqual(receipt);
    const editor = await content("getDraft", { wordSetId: created.wordSet.id });
    expect(editor.entries.map((entry: Data) => entry.wordId)).toEqual(["book"]);
    expect(editor.revision.version).toBe(2);
  });

  it("requires a fresh preview after an independent draft edit or release change", async () => {
    const created = await content("createDeck", {
      metadata,
      commandId: "import-deck",
    });
    const preview = await content("previewImport", {
      wordSetId: created.wordSet.id,
      revisionId: created.revision.id,
      pastedRows: [{ word: "book" }],
      assetIds: [],
      expectedDraftVersion: 1,
      commandId: "preview",
    });
    await content("saveDraft", {
      wordSetId: created.wordSet.id,
      revisionId: created.revision.id,
      metadata: { ...metadata, name: "Đã đổi" },
      entries: [],
      expectedVersion: 1,
      commandId: "other-edit",
    });
    const input = {
      importId: preview.importId,
      selectedRowIds: [preview.rows[0].id],
      skippedRowIds: [],
      duplicateChoices: {},
      expectedDraftVersion: 1,
      fingerprint: preview.fingerprint,
      commandId: "stale-apply",
    };
    expect(await businessCode(content("applyImport", input))).toBe("CONFLICT");
    expect(
      (await content("getDraft", { wordSetId: created.wordSet.id })).entries,
    ).toHaveLength(0);
  });

  it("requires every import row to be selected or explicitly skipped and duplicate updates to be intentional", async () => {
    const created = await content("createDeck", {
      metadata,
      commandId: "import-deck",
    });
    const preview = await content("previewImport", {
      wordSetId: created.wordSet.id,
      revisionId: created.revision.id,
      pastedRows: [{ word: "book" }, { word: "books" }],
      assetIds: [],
      expectedDraftVersion: 1,
      commandId: "preview",
    });
    const base = {
      importId: preview.importId,
      expectedDraftVersion: 1,
      fingerprint: preview.fingerprint,
    };
    expect(
      await businessCode(
        content("applyImport", {
          ...base,
          commandId: "missing-row-choice",
          selectedRowIds: [preview.rows[0].id],
          skippedRowIds: [],
          duplicateChoices: {},
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(
      await businessCode(
        content("applyImport", {
          ...base,
          commandId: "missing-duplicate-choice",
          selectedRowIds: preview.rows.map((row: Data) => row.id),
          skippedRowIds: [],
          duplicateChoices: {},
        }),
      ),
    ).toBe("VALIDATION_FAILED");
  });
});

describe("report ownership, transitions, audit and published fixes", () => {
  async function submit() {
    return report("submitReport", {
      commandId: "report-word",
      targetRef: {
        type: "WORD",
        wordId: "book",
        wordVersion: 1,
        releaseId: "test-release",
      },
      category: "MEANING",
      description: "Nghĩa chưa phù hợp.",
    });
  }

  it("builds the snapshot on the server, deduplicates submission and hides reviewer identities from the owner", async () => {
    const first = await submit();
    expect(await submit()).toEqual(first);
    expect(first.report.targetSnapshot).toMatchObject({
      wordId: "book",
      wordVersion: 1,
      spelling: "book",
    });
    const reportId = first.report.reportId;
    expect(
      await businessCode(report("getMyReport", { reportId }, otherLearner)),
    ).toBe("PERMISSION_DENIED");
    await report(
      "updateReportStatus",
      {
        reportId,
        expectedVersion: 1,
        newStatus: "IN_REVIEW",
        commandId: "accept-report",
      },
      admin,
    );
    const own = await report("getMyReport", { reportId });
    expect(own.status).toBe("IN_REVIEW");
    expect(own).not.toHaveProperty("reviewerUid");
    expect(own).not.toHaveProperty("ownerUid");
    expect(own).not.toHaveProperty("actions");
    expect(
      (await report("getReport", { reportId }, admin)).actions,
    ).toHaveLength(1);
    expect(await businessCode(report("getReport", { reportId }, learner))).toBe(
      "PERMISSION_DENIED",
    );
  });

  it("requires admin CAS and an actual published new dictionary version before FIXED", async () => {
    const { report: submitted } = await submit();
    const reportId = submitted.reportId;
    const accepted = await report(
      "updateReportStatus",
      {
        reportId,
        expectedVersion: 1,
        newStatus: "IN_REVIEW",
        commandId: "accept-report",
      },
      admin,
    );
    expect(
      await businessCode(
        report(
          "updateReportStatus",
          {
            reportId,
            expectedVersion: 1,
            newStatus: "WAITING_RELEASE",
            commandId: "stale-transition",
          },
          admin,
        ),
      ),
    ).toBe("CONFLICT");
    const close = {
      reportId,
      expectedVersion: accepted.report.version,
      newStatus: "RESOLVED",
      publicNote: "Đã sửa trong bản mới.",
      resolutionKind: "FIXED",
      resolutionRef: { kind: "DICTIONARY_RELEASE", releaseId: "test-release" },
      commandId: "close-report",
    };
    expect(await businessCode(report("closeReport", close, admin))).toBe(
      "VALIDATION_FAILED",
    );
    const previous = await read("words/book/versions/1");
    await db.doc("words/book/versions/2").set({
      ...previous,
      version: 2,
      meanings: [
        { id: "meaning-book", partOfSpeech: "noun", text: "Nghĩa đã sửa" },
      ],
    });
    await db.doc("dictionaryReleases/fixed-release").set({ state: "READY" });
    await db
      .doc("dictionaryReleases/fixed-release/entries/book")
      .set({ active: true, wordVersion: 2 });
    const fixed = {
      ...close,
      commandId: "close-new-release",
      resolutionRef: { kind: "DICTIONARY_RELEASE", releaseId: "fixed-release" },
    };
    expect(await businessCode(report("closeReport", fixed, admin))).toBe(
      "VALIDATION_FAILED",
    );
    await db
      .doc("dictionaryReleases/fixed-release")
      .update({ state: "PUBLISHED" });
    const result = await report("closeReport", fixed, admin);
    expect(result.report.status).toBe("RESOLVED");
    expect(await report("closeReport", fixed, admin)).toEqual(result);
    expect(
      (await report("getReport", { reportId }, admin)).actions,
    ).toHaveLength(2);
    expect(
      await businessCode(
        report(
          "updateReportStatus",
          {
            reportId,
            expectedVersion: result.report.version,
            newStatus: "IN_REVIEW",
            commandId: "reopen-final",
          },
          admin,
        ),
      ),
    ).toBe("VALIDATION_FAILED");
  });

  it("rejects learner-provided snapshot/owner and refuses a final rejection without a public reason", async () => {
    expect(
      await businessCode(
        report("submitReport", {
          commandId: "spoofed-report",
          targetRef: { type: "WORD", wordId: "book", wordVersion: 1 },
          category: "OTHER",
          description: "Text.",
          ownerUid: otherLearner.uid,
          targetSnapshot: { spelling: "fake" },
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    const { report: submitted } = await submit();
    await report(
      "updateReportStatus",
      {
        reportId: submitted.reportId,
        expectedVersion: 1,
        newStatus: "IN_REVIEW",
        commandId: "accept",
      },
      admin,
    );
    expect(
      await businessCode(
        report(
          "updateReportStatus",
          {
            reportId: submitted.reportId,
            expectedVersion: 2,
            newStatus: "REJECTED",
            commandId: "reject-no-reason",
          },
          admin,
        ),
      ),
    ).toBe("VALIDATION_FAILED");
  });

  it("does not accept a row-position change as a published learning-material fix", async () => {
    const submitted = await report("submitReport", {
      commandId: "report-set-example",
      targetRef: {
        type: "SET_WORD",
        wordSetId: "test-deck",
        revisionId: "revision-one",
        wordId: "book",
        meaningId: "meaning-book",
      },
      category: "EXAMPLE_TRANSLATION",
      description: "Ví dụ và bản dịch chưa phù hợp.",
    });
    const reportId = submitted.report.reportId;
    await report(
      "updateReportStatus",
      {
        reportId,
        expectedVersion: 1,
        newStatus: "IN_REVIEW",
        commandId: "accept-example-report",
      },
      admin,
    );
    const original = await read(
      "systemDecks/test-deck/revisions/revision-one/words/book",
    );
    await db.doc("systemDecks/test-deck/revisions/reordered-revision").set({
      id: "reordered-revision",
      wordSetId: "test-deck",
      name: "Bộ kiểm thử",
      topic: "Kiểm thử",
      state: "PUBLISHED",
      version: 1,
    });
    await db
      .doc("systemDecks/test-deck/revisions/reordered-revision/words/book")
      .set({ ...original, revisionId: "reordered-revision", position: 100 });
    expect(
      await businessCode(
        report(
          "closeReport",
          {
            reportId,
            expectedVersion: 2,
            newStatus: "RESOLVED",
            publicNote: "Đã sửa thứ tự.",
            resolutionKind: "FIXED",
            resolutionRef: {
              kind: "DECK_REVISION",
              wordSetId: "test-deck",
              revisionId: "reordered-revision",
            },
            commandId: "close-reordered-only",
          },
          admin,
        ),
      ),
    ).toBe("VALIDATION_FAILED");
    expect((await read(`contentReports/${reportId}`))?.status).toBe(
      "IN_REVIEW",
    );
    expect(
      (await report("getReport", { reportId }, admin)).actions,
    ).toHaveLength(1);
  });
});
