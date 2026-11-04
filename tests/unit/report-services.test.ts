import { describe, expect, it, vi } from "vitest";
import type {
  ReportReader,
  ReportRecord,
  ReportStore,
  ReportTransaction,
} from "../../functions/src/contracts/reports/store.js";
import { getSnapshot } from "../../functions/src/services/reports/snapshot.js";
import { validateFix } from "../../functions/src/services/reports/fix-validation.js";
import { createReportCommands } from "../../functions/src/services/reports/commands.js";
const learner = { uid: "learner", contentAdmin: false, authTime: 0 };
const now = new Date("2026-11-04T02:00:00Z");
function report(): ReportRecord {
  return {
    reportId: "report",
    ownerUid: "learner",
    category: "MEANING",
    description: "Meaning issue",
    targetRef: {
      type: "WORD",
      wordId: "book",
      wordVersion: 1,
      releaseId: "old-release",
    },
    targetSnapshot: { wordVersion: 1 },
    status: "IN_REVIEW",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
function reader(): ReportReader {
  return {
    report: async () => report(),
    actions: async () => [],
    revision: async () => ({
      id: "revision",
      wordSetId: "travel",
      name: "Travel",
      topic: "Travel",
      state: "PUBLISHED",
      version: 1,
      createdBy: "admin",
      createdAt: now,
    }),
    entry: async () => ({ wordId: "book", wordVersion: 1, position: 0 }),
    release: async () => ({ state: "PUBLISHED" }),
    publicRelease: async () => ({ id: "release" }),
    releaseEntry: async () => ({ wordVersion: 2, active: true }),
    wordVersion: async (_word, version) => ({
      wordId: "book",
      version,
      spelling: "book",
      otherSpellings: [],
      meanings: [{ id: "meaning", partOfSpeech: "noun", text: "Sách" }],
    }),
    speech: async () => ({
      provider: "ANDROID_TTS",
      text: "book",
      listenAllowed: true,
      version: 1,
    }),
    listeningContext: async () => ({
      mode: "LISTEN_AND_TYPE",
      roundStatus: "ACTIVE",
      wordId: "book",
      wordVersion: 1,
      copy: {
        speechVersion: 1,
        listenAllowed: true,
        text: "book",
        spelling: "book",
        meaning: "Sách",
        partOfSpeech: "noun",
        locale: "en-GB",
      },
    }),
  };
}
describe("provider-independent reporting business rules", () => {
  it("does not accept a higher WordVersion as proof of a meaningful fix", async () => {
    await expect(
      validateFix(reader(), report(), {
        kind: "DICTIONARY_RELEASE",
        releaseId: "new-release",
      }),
    ).rejects.toMatchObject({
      details: { code: "VALIDATION_FAILED" },
      message:
        "The dictionary release has not changed the reported learning content",
    });
  });
  it("loads listening context under the verified UID and hides an uncommitted answer", async () => {
    const source = reader(),
      lookup = vi.fn(source.listeningContext);
    source.listeningContext = lookup;
    const snapshot = await getSnapshot(source, learner, {
      type: "SPEECH",
      wordId: "book",
      speechVersion: 1,
      gameRef: {
        sessionId: "session",
        roundId: "round",
        questionId: "question",
      },
    });
    expect(lookup).toHaveBeenCalledWith("learner", {
      sessionId: "session",
      roundId: "round",
      questionId: "question",
    });
    expect(snapshot).toMatchObject({
      meaning: "Sách",
      partOfSpeech: "noun",
      speechVersion: 1,
    });
    expect(snapshot).not.toHaveProperty("spelling");
    expect(snapshot).not.toHaveProperty("text");
  });
  it("rejects a final report transition without staging status or audit writes", async () => {
    const tx: ReportTransaction = {
      ...reader(),
      report: async () => ({ ...report(), status: "RESOLVED" }),
      stageReport: vi.fn(),
      stageAction: vi.fn(),
    };
    const store: ReportStore = {
      ...tx,
      active: async () => {},
      command: async (_actor, _kind, _input, work) => work(tx, now),
      ownerReports: async () => ({ items: [] }),
      queue: async () => ({ items: [] }),
    };
    await expect(
      createReportCommands(store).updateReportStatus(
        { uid: "admin", contentAdmin: true, authTime: 0 },
        {
          reportId: "report",
          expectedVersion: 1,
          newStatus: "IN_REVIEW",
          commandId: "reopen",
        },
      ),
    ).rejects.toMatchObject({ details: { code: "VALIDATION_FAILED" } });
    expect(tx.stageReport).not.toHaveBeenCalled();
    expect(tx.stageAction).not.toHaveBeenCalled();
  });
});
